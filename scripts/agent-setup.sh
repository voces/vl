#!/bin/bash
# Worktree setup for parallel compiler agents (docs/agent-playbook.md).
# Symlinks the warm cargo target + node_modules from the main checkout and
# builds the seed compiler. Run from the WORKTREE root.
set -e
MAIN="${MAIN_CHECKOUT:-/home/user/vl}"
[ -e node_modules ] || ln -s "$MAIN/node_modules" node_modules
[ -e scripts/vl-host/target ] || ln -s "$MAIN/scripts/vl-host/target" scripts/vl-host/target
bash scripts/refresh-compiler.sh
echo "agent-setup: ready (vl: scripts/vl-host/target/release/vl, seed: build/vl-compiler.wasm)"
