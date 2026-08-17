#!/usr/bin/env bash
# Run ONE cell: $1 = cell .vl path (relative to repo root), $2 = result dir.
# Writes exactly ONE result file per cell (never a shared append), so concurrent
# interleaving cannot tear or drop a record.
#
# Three stages, the third only when the run stage failed:
#   check  -- the DIAGNOSTIC channel ([ERROR] / [HINT] / [WARNING])
#   run    -- the VALUE channel (stdout is graded against the independent expectation)
#   build  -- disambiguates a COMPILER-INTERNAL trap (no module written) from an
#             emitted-program trap (module written) and from invalid wasm.
cd "$(dirname "$0")/.." || exit 99
VL=scripts/vl-host/target/release/vl
CMP=build/vl-compiler.wasm
f="$1"
outdir="$2"
name="$(basename "$f" .vl)"
res="$outdir/$name.res"

cerr="$(mktemp)"
"$VL" check "$f" --compiler "$CMP" >"$cerr" 2>&1
crc=$?

rout="$(mktemp)"; rerr="$(mktemp)"
"$VL" run "$f" --compiler "$CMP" >"$rout" 2>"$rerr"
rrc=$?

brc=""; bsize=""
if [ "$rrc" != "0" ]; then
  bw="$(mktemp -u)"
  "$VL" build "$f" --compiler "$CMP" -o "$bw" >/dev/null 2>&1
  brc=$?
  if [ -f "$bw" ]; then bsize=$(wc -c <"$bw" | tr -d ' '); else bsize=0; fi
  rm -f "$bw"
fi

{
  printf 'CELL %s\n' "$name"
  printf 'CHECKRC %s\n' "$crc"
  printf 'RUNRC %s\n' "$rrc"
  printf 'BUILDRC %s\n' "$brc"
  printf 'BUILDSIZE %s\n' "$bsize"
  printf 'CHECKERR %s\n' "$(base64 -w0 <"$cerr")"
  printf 'RUNOUT %s\n' "$(base64 -w0 <"$rout")"
  printf 'RUNERR %s\n' "$(base64 -w0 <"$rerr")"
} >"$res"
rm -f "$cerr" "$rout" "$rerr"
