#!/bin/bash
SP=/tmp/claude-0/-home-user-vl/7fa865fe-c7b3-5acf-8a08-0ee5d968f84b/scratchpad
one() {
  f=$1; k=$(echo $f | tr / _)
  VL_STD=/home/user/vl/.claude/worktrees/msr/std VL_COMPILER_WASM=$SP/census.wasm VL_LATE_DEMANDS=1 timeout 120 /home/user/vl/scripts/vl-host/target/release/vl build /home/user/vl/$f -o $SP/cen/$k.wasm 2>&1 | grep -o "msr \(disp\|set\).*" | sed "s|^|$f\t|"
  rm -f $SP/cen/$k.wasm
}
export -f one; export SP
mkdir -p $SP/cen
cat $SP/all.txt | xargs -P 3 -I{} bash -c 'one {}' > $SP/census.txt
echo CENSUS-DONE >> $SP/census.txt
