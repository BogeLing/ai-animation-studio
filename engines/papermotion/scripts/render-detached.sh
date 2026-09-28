#!/usr/bin/env bash
# Start ONE render-parallel render, detached so it survives Claude Code restarts; refuse if one is running.
# Run from engines/papermotion/:  scripts/render-detached.sh <example> [render:fast options]
#   e.g. scripts/render-detached.sh plane --workers 6 --gpu --codec nvenc --out out/plane.mp4
# Log: out/<example>_render.log, ending with "EXIT <code> after <n>s". Poll: grep EXIT out/<example>_render.log
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: $0 <example> [render:fast options]"; exit 1; }
[ -f scripts/render-parallel.ts ] || { echo "run from the engines/papermotion/ folder"; exit 1; }
if running=$(pgrep -d, -f '^node .*scripts/render-parallel\.ts'); then
  echo "a render is already running (two renders corrupt each other's frames and output):"
  ps -o pid=,args= -p "$running"
  exit 1
fi
name=$1; shift
mkdir -p out; log="out/${name}_render.log"
if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then   # WSL2
  for a in "$@"; do if [ "$a" = "--gpu" ]; then source ../../tools/gpu/wsl-gpu.sh; fi; done
fi
# A session of its own, so it outlives the shell that started it. macOS has no setsid(1); Node's detached
# spawn makes the same setsid() call.
if command -v setsid >/dev/null; then detach=(setsid)
else detach=(node -e "require('node:child_process').spawn(process.argv[1], process.argv.slice(2), { detached: true, stdio: 'inherit' }).unref()"); fi
"${detach[@]}" nohup bash -c 'start=$(date +%s); node scripts/render-parallel.ts "$@"; echo "EXIT $? after $(( $(date +%s) - start ))s"' _ "$name" "$@" > "$log" 2>&1 < /dev/null &
disown
echo "started $name; log: $log"
