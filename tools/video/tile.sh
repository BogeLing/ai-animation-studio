#!/usr/bin/env bash
# Labelled comparison sheet, one ffmpeg pass per tile (several drawtext filters in one graph crashed ffmpeg).
#   tile.sh <out.jpg> <cols> <tile_width> "label|image" ...
# Labels may be Chinese (a CJK font is picked from fc-list). Avoid ' and : in labels (drawtext syntax).
set -euo pipefail
[ $# -ge 4 ] || { echo "usage: $0 <out.jpg> <cols> <tile_width> \"label|image\" ..."; exit 1; }
out=$1; cols=$2; w=$3; shift 3
font=$(fc-list :lang=zh file 2>/dev/null | head -1 | cut -d: -f1)
font=${font:-/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
i=0
for pair in "$@"; do
  label=${pair%%|*}; img=${pair#*|}
  ffmpeg -v error -y -i "$img" -vf "scale=$w:-2,drawtext=fontfile=$font:text='$label':x=w-tw-14:y=12:fontsize=$(( w / 32 )):fontcolor=white:box=1:boxcolor=0x15110f@0.72:boxborderw=8" "$tmp/$(printf %03d $i).png"
  i=$((i + 1))
done
n=$i
if [ "$n" -eq 1 ]; then ffmpeg -v error -y -i "$tmp/000.png" "$out"; echo "$out"; exit 0; fi
h=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 "$tmp/000.png")
inputs=(); layout=()
for ((k = 0; k < n; k++)); do inputs+=(-i "$tmp/$(printf %03d $k).png"); layout+=("$(( (k % cols) * w ))_$(( (k / cols) * h ))"); done
ffmpeg -v error -y "${inputs[@]}" -filter_complex "xstack=inputs=$n:layout=$(IFS='|'; echo "${layout[*]}"):fill=0x15110f" -q:v 3 "$out"
echo "$out"
