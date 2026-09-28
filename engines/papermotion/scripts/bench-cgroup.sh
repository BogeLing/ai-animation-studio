#!/usr/bin/env bash
# Emulate cloud worker sizes locally: for each memory size, run one render page in a systemd scope with
# CPUQuota = mem/1769 MB vCPUs (Lambda's ratio), MemoryMax = mem and no swap. One JSON line per size.
# Run from engines/papermotion/:  scripts/bench-cgroup.sh <example> <memMB...>     e.g. scripts/bench-cgroup.sh plane 1769 3008 10240
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: $0 <example> <memMB...>"; exit 1; }
[ -f scripts/render-parallel.ts ] || { echo "run from the engines/papermotion/ folder"; exit 1; }
here=$(cd "$(dirname "$0")" && pwd); name=$1; shift
for mem in "$@"; do
  quota=$(( (mem * 100 + 884) / 1769 ))
  systemd-run --scope --quiet -p CPUQuota=${quota}% -p MemoryMax=${mem}M -p MemorySwapMax=0 \
    node "$here/bench-page.ts" "$name" "mem${mem}_cpu${quota}pct" 2>/dev/null || echo "{\"label\":\"mem${mem}\",\"failed\":true}"
done
