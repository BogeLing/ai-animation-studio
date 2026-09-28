#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["faster-whisper>=1.1", "librosa>=0.10"]
# ///
"""Settle doubtful words in a transcript.

A full transcription pass also reads the sentence around each word, so it can pick the word that fits
the sentence rather than the one that was said (homophones, near-homophones that differ only by tone).
This re-transcribes short windows on their own, with no text context, and can print a pitch contour to
tell tones apart (a Mandarin 2nd tone rises, a 4th tone falls).

    uv run tools/audio/recheck.py clip.m4a 5.4:7.45 6.0:7.45 [--language zh] [--pitch 7.3:7.8]

Try a wide and a tight window around the word: if they disagree, the audio alone is ambiguous.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path


def span(text: str) -> tuple[float, float]:
    a, b = text.split(':')
    return float(a), float(b)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('audio')
    ap.add_argument('windows', nargs='*', type=span, help='start:end windows (seconds) to re-transcribe')
    ap.add_argument('--language', default=None)
    ap.add_argument('--model', default='large-v3-turbo')
    ap.add_argument('--pitch', action='append', type=span, default=[], help='start:end window to print a pitch contour for')
    args = ap.parse_args()

    import librosa
    import numpy as np
    from faster_whisper import WhisperModel

    with tempfile.TemporaryDirectory() as tmp:
        wav = str(Path(tmp) / 'audio.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', args.audio, '-ac', '1', '-ar', '16000', wav], check=True)
        y, sr = librosa.load(wav, sr=16000, mono=True)

    if args.windows:
        model = WhisperModel(args.model, device='cpu', compute_type='int8')
        for a, b in args.windows:
            out, _ = model.transcribe(y[int(a * sr):int(b * sr)], language=args.language, word_timestamps=True,
                                      condition_on_previous_text=False, beam_size=5, temperature=0)
            for s in out:
                words = ' '.join(f'{w.word.strip()}({w.probability:.2f})' for w in s.words or [])
                print(f'[{a:.2f}–{b:.2f}] {s.text.strip()}   | {words}')

    for a, b in args.pitch:
        f0, voiced, _ = librosa.pyin(y[int(a * sr):int(b * sr)], fmin=70, fmax=450, sr=sr, frame_length=1024, hop_length=160)
        times = a + np.arange(len(f0)) * 160 / sr
        pts = [f'{t:.2f}:{v:.0f}Hz' for t, v, ok in zip(times, f0, voiced) if ok and not np.isnan(v)]
        print(f'pitch [{a:.2f}–{b:.2f}]', ' '.join(pts) if pts else 'no voiced frames found (music may mask the voice)')


if __name__ == '__main__':
    main()
