# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["kokoro>=0.9.4", "soundfile", "numpy", "torch"]
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

The script is plain text in blocks separated by blank lines. A block may start with a line `[id]`, or
`[id gap=0.9]` to change the pause after it; otherwise blocks are named b1, b2, …. Write what should be
*said*: spell out code and commands (TTS reads `pnpm` badly) and show them on screen instead.

Writes the audio (FLAC or WAV, by the file's extension; 24 kHz mono, peak at -1 dBFS) and, next to it, a JSON
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


def blocks(text: str) -> list[dict]:
    out = []
    for i, raw in enumerate(b for b in re.split(r'\n\s*\n', text.strip()) if b.strip()):
        lines = raw.strip().splitlines()
        head = re.match(r'^\[([\w-]+)(?:\s+gap=([\d.]+))?\]$', lines[0].strip())
        if head:
            lines = lines[1:]
        out.append({'id': head.group(1) if head else f'b{i + 1}', 'gap': float(head.group(2)) if head and head.group(2) else None,
                    'text': ' '.join(l.strip() for l in lines if l.strip())})
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('script')
    ap.add_argument('out')
    ap.add_argument('--voice', default='af_heart', help='a Kokoro voice, e.g. af_heart, af_bella, am_michael, bf_emma')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--gap', type=float, default=0.5, help='pause after each block, seconds')
    ap.add_argument('--lead', type=float, default=0.15, help='silence before the first word, seconds')
    a = ap.parse_args()

    from kokoro import KPipeline  # imported late so --help works without the model
    pipe = KPipeline(lang_code=a.voice[0], repo_id='hexgrad/Kokoro-82M')
    parts, meta, t = [np.zeros(int(a.lead * SR), np.float32)], [], a.lead
    for b in blocks(Path(a.script).read_text()):
        audio, words, offset = [], [], 0.0
        for r in pipe(b['text'], voice=a.voice, speed=a.speed):
            chunk = r.audio.numpy().astype(np.float32)
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
    wav = np.concatenate(parts)
    wav *= 10 ** (-1 / 20) / max(1e-9, float(np.abs(wav).max()))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out, wav, SR, subtype='PCM_16')
    info = {'sampleRate': SR, 'length': round(len(wav) / SR, 3), 'voice': a.voice, 'speed': a.speed, 'model': 'hexgrad/Kokoro-82M', 'blocks': meta}
    out.with_suffix('.json').write_text(json.dumps(info, indent=1))
    print(f'{out} ({info["length"]:.1f} s) and {out.with_suffix(".json")}', file=sys.stderr)


if __name__ == '__main__':
    main()
