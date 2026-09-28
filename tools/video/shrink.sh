#!/usr/bin/env bash
# Re-encode a video to fit a size budget with two-pass x264: for upload limits and chat apps. Film grain
# and paper texture make these films large at a fixed quality, so a bitrate target is the reliable way down.
#
#   tools/video/shrink.sh in.mp4 out.mp4 [max_mb=25]
set -euo pipefail
if [ $# -lt 2 ]; then sed -n '2,6p' "$0"; exit 1; fi
in=$1 out=$2 max=${3:-25}
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
audio_k=160
# 4% headroom for the container; what's left after the sound goes to the picture.
video_k=$(awk -v m="$max" -v d="$dur" -v a="$audio_k" 'BEGIN { printf "%d", m * 8 * 1024 * 0.96 / d - a }')
log=$(mktemp -d)/x264
ffmpeg -v error -y -i "$in" -c:v libx264 -preset slow -b:v "${video_k}k" -pass 1 -passlogfile "$log" -an -f null /dev/null
ffmpeg -v error -y -i "$in" -c:v libx264 -preset slow -b:v "${video_k}k" -pass 2 -passlogfile "$log" \
  -pix_fmt yuv420p -c:a aac -b:a "${audio_k}k" -movflags +faststart "$out"
rm -rf "$(dirname "$log")"
du -h "$out"
