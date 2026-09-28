#!/usr/bin/env python3
"""Cut the silence off both ends of an audio file.

Finds where the sound starts and ends with ffmpeg's silencedetect, keeps a small margin, and fades the
cut edges so they don't click. Prints the kept span as JSON, so scene timings taken from the original
file can be shifted by the same offset.

    python3 tools/audio/trim_silence.py in.m4a out.wav [--threshold -40] [--margin 0.05] [--fade 0.02]
"""
import argparse
import json
import re
import subprocess


def silence_bounds(path: str, threshold_db: float, min_len: float) -> tuple[float, float, float]:
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
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--threshold', type=float, default=-40, help='silence level in dB (default -40)')
    ap.add_argument('--min', type=float, default=0.2, help='shortest silence that counts, in seconds (default 0.2)')
    ap.add_argument('--margin', type=float, default=0.05, help='seconds kept before and after the sound (default 0.05)')
    ap.add_argument('--fade', type=float, default=0.02, help='fade-in length; the fade-out is 3.5x longer (default 0.02)')
    args = ap.parse_args()

    sound_start, sound_end, duration = silence_bounds(args.src, args.threshold, args.min)
    start, end = max(0.0, sound_start - args.margin), min(duration, sound_end + args.margin)
    length, fade_out = end - start, args.fade * 3.5
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-to', f'{end:.3f}', '-i', args.src,
                    '-af', f'afade=t=in:st=0:d={args.fade},afade=t=out:st={max(0.0, length - fade_out):.3f}:d={fade_out}', args.dst], check=True)
    print(json.dumps({'start': round(start, 3), 'end': round(end, 3), 'length': round(length, 3), 'original': round(duration, 3)}))


if __name__ == '__main__':
    main()
