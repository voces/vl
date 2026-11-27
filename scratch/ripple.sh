#!/bin/bash
# ripple.sh <base.wasm> <head.wasm> <outdir> : build every tests/cases program with both seeds
B=$1; H=$2; O=$3; LIST=$4; mkdir -p $O/b $O/h
VL=/home/user/vl/scripts/vl-host/target/release/vl
one() {
  f=$1; k=$(echo $f | tr / _)
  VL_COMPILER_WASM=$B timeout 120 $VL build $f -o $O/b/$k.wasm >/dev/null 2>$O/b/$k.err; rb=$?
  VL_COMPILER_WASM=$H timeout 120 $VL build $f -o $O/h/$k.wasm >/dev/null 2>$O/h/$k.err; rh=$?
  if [ $rb != $rh ]; then echo "RC $rb->$rh $f"
  elif [ $rb = 0 ] && ! cmp -s $O/b/$k.wasm $O/h/$k.wasm; then echo "BYTES $f"; fi
  rm -f $O/b/$k.wasm $O/h/$k.wasm
}
export -f one; export B H O VL
cat $LIST | xargs -P 3 -I{} bash -c 'one {}'
echo RIPPLE-DONE
