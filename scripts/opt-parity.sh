#!/usr/bin/env bash
# The parity oracle for porting an `-O` rung from the host into the compiler
# (docs/internals/optimizer-in-vl.md): every program is built with `-O` twice, once
# per SIDE, and the two builds must agree on exit status, on the argv of every
# `wasm-opt` run (captured by a shim), and byte for byte on the module written. A
# build that times out on either side is UNCOMPARED, never counted as agreeing.
#
#   scripts/opt-parity.sh [--compiler <seed>] [--jobs N] [--timeout S] [--rung -O3]
#       [--flag <build flag> ...] SIDE_A SIDE_B [path ...]
#
# A side is `VAR=value` (that variable set for the checkout's own `vl`) or the path
# of a `vl` binary: a rung's port is graded `VAR=rust VAR=vl`, its retirement
# against a binary built before the Rust was deleted. Both sides use one seed.
# Paths are .vl files or directories (searched for *.vl); the default is
# tests/cases plus the distilled corpus. Run from the checkout root. Exits 1 when
# any program disagrees, naming each; 2 on a usage error. `--flag` passes one more
# build flag to both sides (repeatable), and a `--source-map` build's map must agree too,
# as must the escape step's output (`$VL_OPT_ESCAPE_DUMP`), whose names `-O` then strips.
set -u

COMPILER=build/vl-compiler.wasm
JOBS=4
TIMEOUT=120
RUNG=-O
FLAGS=
while [ $# -gt 0 ]; do
  case "$1" in
    --compiler) COMPILER=$2; shift 2 ;;
    --jobs) JOBS=$2; shift 2 ;;
    --timeout) TIMEOUT=$2; shift 2 ;;
    --rung) RUNG=$2; shift 2 ;;
    --flag) FLAGS="$FLAGS $2"; shift 2 ;;
    *) break ;;
  esac
done
if [ $# -lt 2 ]; then
  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
A=$1 B=$2
shift 2
[ $# -gt 0 ] || set -- tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named

ROOT=$(pwd)
VL=${VL:-$ROOT/scripts/vl-host/target/release/vl}
WASM_OPT=${VL_WASM_OPT:-$(command -v wasm-opt || echo "$ROOT/node_modules/.bin/wasm-opt")}
# A side's binary, and the one assignment `env` runs it under.
side_bin() { case "$1" in *=*) echo "$VL" ;; *) realpath "$1" ;; esac; }
side_env() { case "$1" in *=*) echo "$1" ;; *) echo "OPT_PARITY_SIDE=$1" ;; esac; }
for side in "$A" "$B"; do
  [ -x "$(side_bin "$side")" ] || { echo "opt-parity: no vl binary for side \`$side\`" >&2; exit 2; }
done
[ -f "$COMPILER" ] || { echo "opt-parity: no compiler seed at $COMPILER" >&2; exit 2; }
export VL_STD=${VL_STD:-$ROOT/std}
export BINARYEN_CORES=${BINARYEN_CORES:-1}
# A cache hit would skip the chain being compared.
export VL_COMPILE_CACHE=0

WORK=$(mktemp -d "${TMPDIR:-/tmp}/opt-parity.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
# The shim records each wasm-opt argv, then runs the real one.
cat > "$WORK/shim.sh" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\$OPT_PARITY_LOG"
exec "$WASM_OPT" "\$@"
EOF
chmod +x "$WORK/shim.sh"

find "$@" -name '*.vl' -type f | sort > "$WORK/files"
total=$(wc -l < "$WORK/files")

# One program, both sides, in a slot directory of its own; prints one verdict line.
one() {
  local f=$1 slot side spec rc
  slot=$(mktemp -d "$WORK/slot.XXXXXX")
  for side in a b; do
    spec=$A
    [ "$side" = b ] && spec=$B
    : > "$slot/log"
    env "$(side_env "$spec")" OPT_PARITY_LOG="$slot/log" VL_WASM_OPT="$WORK/shim.sh" \
      VL_OPT_ESCAPE_DUMP="$slot/out.escape" \
      timeout "$TIMEOUT" "$(side_bin "$spec")" build "$f" "$RUNG" $FLAGS -o "$slot/out.wasm" \
      --compiler "$COMPILER" > "$slot/$side.stdout" 2> "$slot/$side.stderr"
    rc=$?
    if [ "$rc" -eq 124 ]; then
      echo "UNCOMPARED $f (timed out, side $side)"
      rm -rf "$slot"
      return
    fi
    echo "$rc" > "$slot/$side.rc"
    mv "$slot/log" "$slot/$side.argv"
    if [ -f "$slot/out.wasm" ]; then mv "$slot/out.wasm" "$slot/$side.wasm"; fi
    if [ -f "$slot/out.wasm.map" ]; then mv "$slot/out.wasm.map" "$slot/$side.map"; fi
    if [ -f "$slot/out.escape" ]; then mv "$slot/out.escape" "$slot/$side.escape"; fi
  done
  if ! cmp -s "$slot/a.rc" "$slot/b.rc"; then
    echo "DIFFER $f (exit $(cat "$slot/a.rc") vs $(cat "$slot/b.rc"))"
  elif ! cmp -s "$slot/a.argv" "$slot/b.argv"; then
    echo "DIFFER $f (wasm-opt argv)"
  elif [ -f "$slot/a.wasm" ] || [ -f "$slot/b.wasm" ]; then
    if ! cmp -s "$slot/a.wasm" "$slot/b.wasm"; then
      echo "DIFFER $f (module bytes)"
    elif { [ -f "$slot/a.map" ] || [ -f "$slot/b.map" ]; } && ! cmp -s "$slot/a.map" "$slot/b.map"; then
      echo "DIFFER $f (source map)"
    elif { [ -f "$slot/a.escape" ] || [ -f "$slot/b.escape" ]; } \
      && ! cmp -s "$slot/a.escape" "$slot/b.escape"; then
      echo "DIFFER $f (escape step output)"
    else
      echo "AGREE $f $(grep -c -e --no-inline= -e --skip-pass= "$slot/a.argv") $([ -f "$slot/a.escape" ] && echo 1 || echo 0)"
    fi
  else
    echo "AGREE-FAIL $f"
  fi
  rm -rf "$slot"
}
export -f one side_bin side_env
export WORK A B VL COMPILER TIMEOUT RUNG FLAGS

xargs -a "$WORK/files" -d '\n' -P "$JOBS" -I{} bash -c 'one "$1"' _ {} > "$WORK/verdicts"

agree=$(grep -c '^AGREE ' "$WORK/verdicts")
both_fail=$(grep -c '^AGREE-FAIL ' "$WORK/verdicts")
marked=$(grep -c "^AGREE .* [1-9][0-9]* [01]\$" "$WORK/verdicts")
escaped=$(grep -c "^AGREE .* 1\$" "$WORK/verdicts")
differ=$(grep -c '^DIFFER ' "$WORK/verdicts")
uncompared=$(grep -c '^UNCOMPARED ' "$WORK/verdicts")
grep -E '^(DIFFER|UNCOMPARED) ' "$WORK/verdicts" | sort
echo "opt-parity $A vs $B ($RUNG$FLAGS): $total programs · $agree identical modules ·" \
  "$both_fail both refused · $marked identical carrying a --no-inline or --skip-pass mark ·" \
  "$escaped identical through an escape step · $differ differ · $uncompared uncompared"
[ "$differ" -eq 0 ]
