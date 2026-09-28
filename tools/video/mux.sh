#!/usr/bin/env bash
# Put a sound track under a video: the picture is copied as it is, the sound is encoded to AAC, and the
# result is as long as the shorter of the two. Use it for scenes timed to an outside recording.
#
#   tools/video/mux.sh video.mp4 audio.wav out.mp4 [gain_db]
#
# gain_db (default 0) lowers or raises the sound, e.g. -1 to leave headroom when the source peaks at 0 dBFS.
set -euo pipefail
if [ $# -lt 3 ]; then sed -n '2,8p' "$0"; exit 1; fi
video=$1 audio=$2 out=$3 gain=${4:-0}
ffmpeg -v error -y -i "$video" -i "$audio" -map 0:v -map 1:a -c:v copy -af "volume=${gain}dB" \
  -c:a aac -b:a 192k -shortest -movflags +faststart "$out"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$out" | xargs printf '%s → %.2fs\n' "$out"
