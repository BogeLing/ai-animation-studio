#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["kokoro>=0.9.4", "misaki[zh]>=0.9.4", "soundfile", "scipy", "numpy"]
# ///
"""Narration with Kokoro-82M, one line at a time, for films timed to a voice.

    uv run tools/voice/lines.py lines.json -o voice/ [--voice zf_001] [--speed 1.0] [--words 公司名,产品名]
    uv run tools/voice/lines.py --list-voices [--repo …]

lines.json is a list of {"id": "l01", "say": "…"}. For each line it writes <id>.wav (48 kHz mono 16-bit,
silence trimmed to a short pad, every line at the same loudness) and, for all of them, timing.json with each
line's length in seconds, the phonemes Kokoro read, the pinyin, and every pause the model put in (from its predicted
durations), to check polyphonic characters and phrasing without ears. Spell numbers the way they should be read
("一九九九年"). `--words` lists names that must be read as one unit, in their own tones (a company, a product): Mandarin is split into
words first, and each word boundary costs the voice a small pause, so a name split in two sounds broken.
Runs on the CPU and is seeded, so it repeats. The model downloads from Hugging Face on first use (~330 MB).
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np

SR_IN, SR_OUT, PAD = 24000, 48000, 0.06
TONE = set('12345')


def pauses(phonemes: str, durations: list[int], vocab: dict) -> list[tuple[int, float]]:
    """Every word boundary or punctuation Kokoro voiced, as (syllables before it, seconds); a duration unit is 1/40 s."""
    kept = [p for p in phonemes if p in vocab]
    out, syllables = [], 0
    for p, n in zip(kept, durations[1:]):
        if p in TONE:
            syllables += 1
        elif not p.isalnum():
            out.append((syllables, n / 40))
    return out


def marked(say: str, found: list[tuple[int, float]], at_least: float = 0.1) -> str:
    """The line with ‖ after each character where the voice pauses `at_least` s or more and the text has no punctuation."""
    long = {k for k, s in found if s >= at_least}
    out, k = [], 0
    for i, ch in enumerate(say):
        out.append(ch)
        if '\u4e00' <= ch <= '\u9fff':
            k += 1
            after = say[i + 1] if i + 1 < len(say) else ''
            if k in long and after and after not in '，。、！？：；,.!?':
                out.append('‖')
    return ''.join(out)


def trim(y: np.ndarray, sr: int, floor_db: float = -45) -> np.ndarray:
    """Cut leading and trailing silence, keeping PAD seconds on each side."""
    frame = int(sr * 0.01)
    rms = np.sqrt(np.convolve(y ** 2, np.ones(frame) / frame, mode='same'))
    loud = np.flatnonzero(rms > np.abs(y).max() * 10 ** (floor_db / 20))
    if not loud.size:
        return y
    pad = int(PAD * sr)
    return y[max(0, loud[0] - pad):min(len(y), loud[-1] + pad)]


def level(y: np.ndarray, rms_db: float = -20, peak_db: float = -1.5) -> np.ndarray:
    """Every line at the same speech level (RMS over the voiced part), with the peaks kept under peak_db."""
    voiced = y[np.abs(y) > np.abs(y).max() * 0.05]
    gain = 10 ** (rms_db / 20) / max(1e-9, float(np.sqrt(np.mean(voiced ** 2))))
    peak = float(np.abs(y).max()) * gain
    if peak > 10 ** (peak_db / 20):
        gain *= 10 ** (peak_db / 20) / peak
    return y * gain


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('lines', nargs='?')
    ap.add_argument('-o', '--out', default='voice')
    ap.add_argument('--voice', default='zf_001')
    ap.add_argument('--speed', type=float, default=1.0)
    ap.add_argument('--repo', default='hexgrad/Kokoro-82M-v1.1-zh')
    ap.add_argument('--lang', default='z', help='Kokoro language code: z Mandarin, a US English, j Japanese, …')
    ap.add_argument('--words', default='', help='comma-separated names to keep whole, e.g. a company name (Mandarin)')
    ap.add_argument('--list-voices', action='store_true')
    args = ap.parse_args()

    if args.list_voices:
        from huggingface_hub import list_repo_files
        print(' '.join(sorted(Path(f).stem for f in list_repo_files(args.repo) if f.startswith('voices/'))))
        return
    if not args.lines:
        ap.error('lines.json is required')

    import soundfile as sf
    import torch
    from kokoro import KModel, KPipeline
    from pypinyin import Style, pinyin
    from scipy.signal import resample_poly

    lines = json.loads(Path(args.lines).read_text())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model = KModel(repo_id=args.repo).to('cpu').eval()
    # English words in Mandarin lines are read by the English rules (without them the Mandarin G2P drops them).
    en = KPipeline(lang_code='a', repo_id=args.repo, model=False) if args.lang == 'z' else None
    pipeline = KPipeline(lang_code=args.lang, repo_id=args.repo, model=model, en_callable=(lambda text: en.g2p(text)[0]) if en else None)
    if args.words:
        import jieba
        names = [w.strip() for w in args.words.split(',') if w.strip()]
        for w in names:
            jieba.add_word(w, freq=10 ** 6, tag='nt')
        # A name keeps its own tones: a word ending in 得 would otherwise end in a neutral tone.
        frontend = getattr(pipeline.g2p, 'frontend', None)
        if frontend is not None:
            frontend.tone_modifier.must_not_neural_tone_words.update(names)
    timing = []
    for line in lines:
        torch.manual_seed(0)
        parts, phonemes, found = [], [], []
        for result in pipeline(line['say'], voice=args.voice, speed=args.speed):
            parts.append(result.audio.numpy())
            phonemes.append(result.phonemes)
            before = sum(1 for p in ''.join(phonemes[:-1]) if p in TONE)
            found += [(before + k, s) for k, s in pauses(result.phonemes, result.pred_dur.tolist(), model.vocab)]
        y = level(trim(np.concatenate(parts).astype(np.float64), SR_IN))
        y = resample_poly(y, SR_OUT // SR_IN, 1)
        sf.write(out / f"{line['id']}.wav", y.astype(np.float32), SR_OUT, subtype='PCM_16')
        spoken = ' '.join(p[0] for p in pinyin(line['say'], style=Style.TONE3)) if args.lang == 'z' else ''
        timing.append({'id': line['id'], 'seconds': round(len(y) / SR_OUT, 3), 'say': line['say'], 'phonemes': ' '.join(phonemes), 'pinyin': spoken,
                       'pauses': [[k, round(s, 3)] for k, s in found]})
        print(f"{line['id']}  {timing[-1]['seconds']:5.2f}s  {marked(line['say'], found) if args.lang == 'z' else line['say']}")
    (out / 'timing.json').write_text(json.dumps(timing, ensure_ascii=False, indent=1))
    print(f"{len(lines)} lines, {sum(t['seconds'] for t in timing):.1f}s of voice → {out}/")


if __name__ == '__main__':
    main()
