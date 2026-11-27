#!/bin/bash
# ripple.sh <base.wasm> <head.wasm> <std-dir> <list> <out> : run every program with both seeds, report changes
B=$1; H=$2; S=$3; LIST=$4; OUT=$5
VL=/home/user/vl/scripts/vl-host/target/release/vl
one() {
  f=$1
  ob=$(cd $(dirname $f) && VL_STD=$S VL_COMPILER_WASM=$B VL_NO_CACHE=1 timeout 120 $VL run $(basename $f) 2>/dev/null </dev/null | head -c 20000; echo "rc=${PIPESTATUS[0]}")
  oh=$(cd $(dirname $f) && VL_STD=$S VL_COMPILER_WASM=$H VL_NO_CACHE=1 timeout 120 $VL run $(basename $f) 2>/dev/null </dev/null | head -c 20000; echo "rc=${PIPESTATUS[0]}")
  echo x >> $OUT.prog
  if [ "$ob" != "$oh" ]; then echo "DIFF $f | base:$(echo "$ob" | tail -1) head:$(echo "$oh" | tail -1)"; fi
}
export -f one; export B H S VL OUT
cat $LIST | xargs -P 3 -I{} bash -c 'one {}' > $OUT
echo RIPPLE-DONE >> $OUT
