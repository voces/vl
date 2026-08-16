#!/bin/bash
# Worktree setup for parallel compiler agents (docs/agent-playbook.md).
# Symlinks the warm cargo target + node_modules from the main checkout and
# builds the seed compiler. Run from the WORKTREE root.
set -e
# The MAIN checkout, derived rather than hardcoded: in a worktree
# `--git-common-dir` is the main repo's `.git`, so its parent is that checkout;
# in the main checkout it is `.git` and the parent is `.`. A hardcoded default
# silently rots the moment the repo moves, and the failure is a dangling symlink
# rather than an error — every `vl` invocation in the worktree then misses.
MAIN="${MAIN_CHECKOUT:-}"
if [ -z "$MAIN" ]; then
  common="$(git rev-parse --git-common-dir)"
  case "$common" in /*) ;; *) common="$PWD/$common" ;; esac
  MAIN="$(cd "$(dirname "$common")" && pwd)"
fi
[ -d "$MAIN/node_modules" ] || { echo "agent-setup: no node_modules at $MAIN (run npm ci there)" >&2; exit 1; }
[ -e node_modules ] || ln -s "$MAIN/node_modules" node_modules
[ -e scripts/vl-host/target ] || ln -s "$MAIN/scripts/vl-host/target" scripts/vl-host/target
bash scripts/refresh-compiler.sh
echo "agent-setup: ready (vl: scripts/vl-host/target/release/vl, seed: build/vl-compiler.wasm)"
