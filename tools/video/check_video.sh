#!/usr/bin/env bash
# Verify a rendered film before sending it: duration, frames decoded (vs expected), decode errors,
# loudness, and (with a frames folder) a scan for single-frame glitches.
#   check_video.sh <video.mp4> [expected_frames] [frames_dir]
set -euo pipefail
v=$1; expected=${2:-}; dir=${3:-}
here=$(cd "$(dirname "$0")" && pwd)
echo "duration: $(ffprobe -v error -show_entries format=duration -of csv=p=0 "$v") s"
n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$v" | tr -dc "0-9")
echo "frames decoded: $n${expected:+ (expected $expected)}"
echo "decode errors: $(ffmpeg -v error -i "$v" -f null - 2>&1 | wc -l)"
ffmpeg -nostats -i "$v" -af ebur128=peak=true -f null - 2>&1 | grep -E "^ +(I|Peak):" | sed 's/^ */loudness /' || true
if [ -n "$dir" ]; then uv run -q "$here/glitch_scan.py" "$dir"; fi
if [ -n "$expected" ] && [ "$n" != "$expected" ]; then echo "FRAME COUNT MISMATCH"; exit 1; fi
