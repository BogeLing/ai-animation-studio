#!/usr/bin/env bash
# Copy every skill from .agents/skills/ (the open Agent Skills location, read by Codex and other agents) to
# .claude/skills/ (read by Claude Code), at the repository root and in each engine. Edit the .agents copy,
# then run this: engines/papermotion's `pnpm test` fails while the two copies differ.
#   tools/sync-skills.sh
# Copies rather than symlinks, because Windows checkouts turn symlinks into plain text files.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
for base in "$root" "$root"/engines/*; do
  [ -d "$base/.agents/skills" ] || continue
  mkdir -p "$base/.claude/skills"
  for src in "$base"/.agents/skills/*/; do
    name=$(basename "$src") dst="$base/.claude/skills/$(basename "$src")"
    rm -rf "$dst"
    cp -R "$src" "$dst"
    echo "synced ${base#"$root"}/.claude/skills/$name" | sed 's|^synced /|synced |'
  done
done
