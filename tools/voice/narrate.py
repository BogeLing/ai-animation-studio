# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["kokoro>=0.9.4", "misaki[zh]>=0.9.4", "soundfile", "numpy", "torch", "pyloudnorm"]
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# ///
"""Voice a narration script with Kokoro-82M (Apache-2.0, runs on the CPU), and write the timing a scene
needs to follow it: when each block and each word is spoken.

    uv run tools/voice/narrate.py script.md public/voice/film.flac [--voice af_heart] [--speed 1.0] [--gap 0.5]
    uv run tools/voice/narrate.py script.zh.md public/voice/film-zh.flac --voice zf_001 [--words 智能体,拍立得]

The script is plain text in blocks separated by blank lines. A block may start with a line `[id]`, or
`[id gap=0.9]` to change the pause after it; otherwise blocks are named b1, b2, …. Write what should be
*said*: spell out code and commands (TTS reads `pnpm` badly) and show them on screen instead.

Mandarin: a voice whose name starts with z and ends in a number (zf_001 … zm_100) is read by
Kokoro-82M-v1.1-zh, English words in the text by the English voice rules. Its words are the Mandarin words the
voice split the text into, timed from the model's own phoneme durations. Each boundary between words costs the
voice a short pause, so list names and terms that must not break with --words; they also keep their own tones
(a word ending in 得 is read with a neutral tone otherwise: 拍立得 as pāilìde). Write numbers in characters
(十二秒), and check polyphonic characters in the printed words (多长 comes out as duō zhǎng; 时长 doesn't).

Writes the audio (FLAC or WAV, by the file's extension; 24 kHz mono at -23 LUFS, so any voice in any language
sits the same in a film's mix; peaks under -1 dBFS) and, next to it, a JSON
file (load both in a scene with `loadVoice` from `examples/shared/narration.ts`):
    {"sampleRate": 24000, "length": s, "voice": …, "blocks": [{"id", "text", "start", "end",
     "words": [[word, start, end], …]}]}
with all times in seconds from the start of the audio. The first run downloads Kokoro (~330 MB) and a CPU
build of PyTorch.
"""
import argparse, json, re, sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 24000
CJK = r'[　-〿㐀-鿿＀-￯]'


def blocks(text: str) -> list[dict]:
    out = []
    for i, raw in enumerate(b for b in re.split(r'\n\s*\n', text.strip()) if b.strip()):
        lines = raw.strip().splitlines()
        head = re.match(r'^\[([\w-]+)(?:\s+gap=([\d.]+))?\]$', lines[0].strip())
        if head:
            lines = lines[1:]
        # Lines join with a space, except between Chinese characters, where a space would be read as a pause.
        text = re.sub(f'(?<={CJK}) (?={CJK})', '', ' '.join(l.strip() for l in lines if l.strip()))
        out.append({'id': head.group(1) if head else f'b{i + 1}', 'gap': float(head.group(2)) if head and head.group(2) else None, 'text': text})
    return out


class Spans:
    """Kokoro's Mandarin G2P, made to remember which stretch of its phoneme string each word became (its pipeline
    times no words). English words in the text go through the English G2P."""

    def __init__(self, english_g2p):
        self.english_g2p, self.parts = english_g2p, []

    def watch(self, pipe) -> None:
        g2p, frontend = pipe.g2p, pipe.g2p.frontend

        def mandarin(text, *args, **kwargs):
            result, tokens = frontend(text, *args, **kwargs)
            self.add([(tk.text, frontend.unk if tk.phonemes is None else tk.phonemes, tk.whitespace) for tk in tokens], result)
            return result, tokens

        def call(text):
            self.parts = []   # one call per chunk the pipeline reads
            return g2p(text)

        g2p.frontend, pipe.g2p = mandarin, call

    def english(self, text: str) -> str:
        tokens = self.english_g2p(text)[1] if text.strip() else []
        ps = ''.join((tk.phonemes or '') + (' ' if tk.whitespace else '') for tk in tokens).rstrip()
        self.add([(tk.text, tk.phonemes or '', ' ' if tk.whitespace else '') for tk in tokens], ps)
        return ps

    def add(self, tokens: list[tuple[str, str, str]], ps: str) -> None:
        spans, at = [], 0
        for text, phonemes, space in tokens:
            if re.search(r'\w', text) and phonemes:
                spans.append((text, at, at + len(phonemes)))
            at += len(phonemes) + len(space)
        self.parts.append((ps, spans))

    def words(self, phonemes: str, durations: list[int], vocab: dict, t0: float) -> list[list]:
        """The last chunk's words with times from t0: Kokoro predicts frames of 1/40 s for a leading pad and then for
        every phoneme it knows, so a word lasts from its first phoneme's frame to the end of its last. The Mandarin
        voice puts the pause before a comma or a full stop into the tone mark that ends the syllable (up to half a
        second of silence), so at most 0.1 s of a word's final tone mark counts as the word."""
        spans, at = [], 0
        for ps, sp in self.parts:
            spans += [(w, at + a, at + b) for w, a, b in sp]
            at += len(ps) + 1
        if not ' '.join(ps for ps, _ in self.parts).startswith(phonemes):
            raise RuntimeError(f'the phonemes read ({phonemes!r}) are not the ones the words were found in')
        index, k = [], 1
        for ch in phonemes:
            index.append(k if ch in vocab else None)
            k += ch in vocab
        edges = np.concatenate([[0], np.cumsum(durations)])
        out = []
        for word, a, b in spans:
            ids = [(phonemes[i], index[i]) for i in range(a, min(b, len(phonemes))) if index[i] is not None]
            if ids:
                (_, first), (mark, last) = ids[0], ids[-1]
                tail = min(durations[last], 4) if mark in '12345' else durations[last]
                out.append([word, round(t0 + edges[first] / 40, 3), round(t0 + (edges[last] + tail) / 40, 3)])
        return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('script')
    ap.add_argument('out')
    ap.add_argument('--voice', default='af_heart', help='a Kokoro voice, e.g. af_heart, af_bella, am_michael, bf_emma; zf_001 for Mandarin')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--gap', type=float, default=0.5, help='pause after each block, seconds')
    ap.add_argument('--lead', type=float, default=0.15, help='silence before the first word, seconds')
    ap.add_argument('--loudness', type=float, default=-23, help='integrated loudness of the whole narration, LUFS')
    ap.add_argument('--words', default='', help='Mandarin: comma-separated names and terms to keep whole, in their own tones')
    ap.add_argument('--repo', help='the Kokoro model (default: Kokoro-82M, or Kokoro-82M-v1.1-zh for zf_/zm_ voices)')
    a = ap.parse_args()

    import torch
    from kokoro import KPipeline  # imported late so --help works without the model
    mandarin = re.fullmatch(r'z[fm]_\d+', a.voice) is not None
    repo = a.repo or ('hexgrad/Kokoro-82M-v1.1-zh' if mandarin else 'hexgrad/Kokoro-82M')
    spans = None
    if mandarin:
        import jieba
        names = [w.strip() for w in a.words.split(',') if w.strip()]
        for w in names:
            jieba.add_word(w, freq=10 ** 6, tag='n')
        spans = Spans(KPipeline(lang_code='a', repo_id=repo, model=False).g2p)
        pipe = KPipeline(lang_code='z', repo_id=repo, en_callable=spans.english)
        pipe.g2p.frontend.tone_modifier.must_not_neural_tone_words.update(names)
        spans.watch(pipe)
    else:
        pipe = KPipeline(lang_code=a.voice[0], repo_id=repo)
    parts, meta, t = [np.zeros(int(a.lead * SR), np.float32)], [], a.lead
    for b in blocks(Path(a.script).read_text()):
        torch.manual_seed(0)   # the voice has a random source; seeded, a block reads the same every time
        audio, words, offset = [], [], 0.0
        for r in pipe(b['text'], voice=a.voice, speed=a.speed):
            chunk = r.audio.numpy().astype(np.float32)
            if spans:
                if len(r.phonemes) >= 510:
                    print(f"{b['id']}: over 510 phonemes, the voice cut it short; split the block", file=sys.stderr)
                words += spans.words(r.phonemes, r.pred_dur.tolist(), pipe.model.vocab, t + offset)
            else:
                words += [[tk.text, round(t + offset + tk.start_ts, 3), round(t + offset + tk.end_ts, 3)]
                          for tk in (r.tokens or []) if tk.start_ts is not None and tk.end_ts is not None and re.search(r'\w', tk.text)]
            audio.append(chunk)
            offset += len(chunk) / SR
        clip = np.concatenate(audio)
        meta.append({'id': b['id'], 'text': b['text'], 'start': round(t, 3), 'end': round(t + len(clip) / SR, 3), 'words': words})
        gap = a.gap if b['gap'] is None else b['gap']
        parts += [clip, np.zeros(int(gap * SR), np.float32)]
        t += len(clip) / SR + gap
        print(f"{b['id']:>10}  {meta[-1]['start']:7.2f} – {meta[-1]['end']:7.2f}  {len(words):3d} words", file=sys.stderr)
        if spans:
            print(' ' * 12 + ' / '.join(w for w, _, _ in words), file=sys.stderr)
    import pyloudnorm
    wav = np.concatenate(parts)
    wav *= 10 ** ((a.loudness - pyloudnorm.Meter(SR).integrated_loudness(wav)) / 20)
    if np.abs(wav).max() > 10 ** (-1 / 20):
        wav *= 10 ** (-1 / 20) / float(np.abs(wav).max())
        print(f'peaks kept under -1 dBFS: {pyloudnorm.Meter(SR).integrated_loudness(wav):.1f} LUFS', file=sys.stderr)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, wav, SR, subtype='PCM_16')
    info = {'sampleRate': SR, 'length': round(len(wav) / SR, 3), 'voice': a.voice, 'speed': a.speed, 'model': repo, 'blocks': meta}
    out.with_suffix('.json').write_text(json.dumps(info, indent=1, ensure_ascii=False))
    print(f'{out} ({info["length"]:.1f} s) and {out.with_suffix(".json")}', file=sys.stderr)


if __name__ == '__main__':
    main()
