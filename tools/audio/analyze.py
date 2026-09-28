#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["faster-whisper>=1.1", "librosa>=0.10"]
# ///
"""Analyse a narration or song before animating to it.

Writes a JSON file with a transcript (segments and word timings), the tempo and beat times, rough
section boundaries, and where the sound starts and ends (to trim silence). Everything runs locally.

    uv run tools/audio/analyze.py clip.m4a -o clip.json [--model large-v3-turbo] [--language zh]

Word timings come from faster-whisper; tempo, beats and sections from librosa. Times are seconds in
the original file; subtract `suggested_trim.start` if you trim the clip (see trim_silence.py).
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def silence_bounds(path: str, threshold_db: float = -40, min_len: float = 0.3) -> tuple[float, float, float]:
    """(sound start, sound end, duration) from ffmpeg's silencedetect."""
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', f'silencedetect=noise={threshold_db}dB:d={min_len}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    h, m, s = re.search(r'Duration: (\d+):(\d+):([\d.]+)', log).groups()
    duration = int(h) * 3600 + int(m) * 60 + float(s)
    starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    start = ends[0] if starts and starts[0] <= 0.05 and ends else 0.0
    end = starts[-1] if starts and (len(ends) < len(starts) or ends[-1] >= duration - 0.1) and starts[-1] > start else duration
    return start, end, duration


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('audio')
    ap.add_argument('-o', '--out', help='JSON file to write (default: <audio>.analysis.json)')
    ap.add_argument('--model', default='large-v3-turbo', help='faster-whisper model (default: large-v3-turbo)')
    ap.add_argument('--language', default=None, help='language code, e.g. zh or en (default: detect)')
    ap.add_argument('--sections', type=int, default=0, help='number of sections to split into (default: about one per 8 s)')
    args = ap.parse_args()

    import librosa
    import numpy as np
    from faster_whisper import WhisperModel

    start, end, duration = silence_bounds(args.audio)
    with tempfile.TemporaryDirectory() as tmp:
        wav = str(Path(tmp) / 'audio.wav')   # librosa can't read every container (m4a), so decode once with ffmpeg
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', args.audio, '-ac', '1', '-ar', '22050', wav], check=True)
        y, sr = librosa.load(wav, sr=22050, mono=True)

    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
    features = np.vstack([librosa.feature.chroma_cqt(y=y, sr=sr), librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)])
    k = args.sections or max(2, round(duration / 8))
    sections = librosa.frames_to_time(librosa.segment.agglomerative(features, k), sr=sr)

    model = WhisperModel(args.model, device='cpu', compute_type='int8')
    segments, info = model.transcribe(args.audio, language=args.language, word_timestamps=True, beam_size=5)
    segs = [{
        'start': round(s.start, 2), 'end': round(s.end, 2), 'text': s.text.strip(),
        'words': [{'w': w.word.strip(), 's': round(w.start, 2), 'e': round(w.end, 2), 'p': round(w.probability, 2)} for w in (s.words or [])],
    } for s in segments]

    result = {
        'file': args.audio, 'duration': round(duration, 3),
        'sound': {'start': round(start, 3), 'end': round(end, 3)},
        'suggested_trim': {'start': round(max(0.0, start - 0.05), 3), 'end': round(min(duration, end + 0.05), 3)},
        'language': info.language, 'language_probability': round(info.language_probability, 2),
        'tempo': round(float(np.atleast_1d(tempo)[0]), 2), 'beats': [round(float(b), 3) for b in beats],
        'sections': [round(float(t), 2) for t in sections],
        'segments': segs,
    }
    out = args.out or f'{args.audio}.analysis.json'
    Path(out).write_text(json.dumps(result, ensure_ascii=False, indent=1))

    print(f'{args.audio}: {duration:.2f}s, sound {start:.2f}–{end:.2f}s, {info.language} ({info.language_probability:.2f}), {result["tempo"]} BPM')
    for s in segs:
        low = [w['w'] for w in s['words'] if w['p'] < 0.6]
        print(f"[{s['start']:7.2f} – {s['end']:7.2f}] {s['text']}" + (f"   (unsure: {' '.join(low)})" if low else ''))
    print(f'→ {out}', file=sys.stderr)


if __name__ == '__main__':
    main()
