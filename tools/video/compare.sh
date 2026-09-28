#!/usr/bin/env bash
# Two videos side by side at half size with a label under each (1920x600 for 1080p inputs). Frame rates
# are matched to 30 fps; the sound, if any, comes from the left video. The output is limited (tv) range, whatever
# the inputs' ranges, so a full-range and a limited-range video compare fairly.
#
#   tools/video/compare.sh left.mp4 "Left label" right.mp4 "Right label" out.mp4
set -euo pipefail
if [ $# -lt 5 ]; then sed -n '2,6p' "$0"; exit 1; fi
left=$1 left_label=$2 right=$3 right_label=$4 out=$5
bold=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
font=$([ -f "$bold" ] && echo "fontfile=$bold" || echo "font=Sans")
text() { printf "drawtext=%s:text='%s':x=%s-tw/2:y=560:fontsize=26:fontcolor=0xf3e9dc" "$font" "$1" "$2"; }
ffmpeg -v error -y -i "$left" -i "$right" -filter_complex \
  "[0:v]fps=30,scale=960:540,setsar=1[a];[1:v]fps=30,scale=960:540,setsar=1[b];[a][b]hstack=inputs=2,pad=1920:600:0:0:color=0x1c1714,$(text "$left_label" 480),$(text "$right_label" 1440)[v]" \
  -map "[v]" -map '0:a?' -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -color_range tv -c:a aac -b:a 160k -shortest -movflags +faststart "$out"
du -h "$out"
