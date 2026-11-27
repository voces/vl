#!/bin/bash
# msr.sh <seed> <file>... : print msr rows per file
SEED=$1; shift
W=/home/user/vl/.claude/worktrees/msr
for f in "$@"; do
  echo "== $(basename $f)"
  VL_STD=$W/std VL_COMPILER_WASM=$SEED VL_LATE_DEMANDS=1 /home/user/vl/scripts/vl-host/target/release/vl build "$f" -o /tmp/claude-0/-home-user-vl/7fa865fe-c7b3-5acf-8a08-0ee5d968f84b/scratchpad/o.wasm 2>&1 | grep -o "hold .*\|msr.*\|late\] [^:]*: [0-9]*$\|cannot yet lower.*" | sort | uniq -c
done
