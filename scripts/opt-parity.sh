#!/usr/bin/env bash
# The parity oracle for porting an `-O` rung from the host into the compiler
# (docs/internals/optimizer-in-vl.md): every program is built with `-O` twice, once
# with `$VAR=$A` and once with `$VAR=$B`, and the two builds must agree on exit
# status, on the argv of every `wasm-opt` run (captured by a shim), and byte for
# byte on the module written. A build that times out on either side is UNCOMPARED,
# never counted as agreeing.
#
#   scripts/opt-parity.sh [--compiler <seed>] [--jobs N] [--timeout S] [--rung -O3]
#       VAR A B [path ...]
#
# Paths are .vl files or directories (searched for *.vl); the default is
# tests/cases plus the distilled corpus. Run from the checkout root. Exits 1 when
# any program disagrees, naming each; 2 on a usage error.
set -u

COMPILER=build/vl-compiler.wasm
JOBS=4
TIMEOUT=120
RUNG=-O
while [ $# -gt 0 ]; do
  case "$1" in
    --compiler) COMPILER=$2; shift 2 ;;
    --jobs) JOBS=$2; shift 2 ;;
    --timeout) TIMEOUT=$2; shift 2 ;;
    --rung) RUNG=$2; shift 2 ;;
    *) break ;;
  esac
done
if [ $# -lt 3 ]; then
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi
VAR=$1 A=$2 B=$3
shift 3
[ $# -gt 0 ] || set -- tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named

ROOT=$(pwd)
VL=${VL:-$ROOT/scripts/vl-host/target/release/vl}
WASM_OPT=${VL_WASM_OPT:-$(command -v wasm-opt || echo "$ROOT/node_modules/.bin/wasm-opt")}
[ -x "$VL" ] || { echo "opt-parity: no vl binary at $VL" >&2; exit 2; }
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
  local f=$1 slot dir side rc
  slot=$(mktemp -d "$WORK/slot.XXXXXX")
  for side in a b; do
    local val=$A
    [ "$side" = b ] && val=$B
    : > "$slot/log"
    env "$VAR=$val" OPT_PARITY_LOG="$slot/log" VL_WASM_OPT="$WORK/shim.sh" \
      timeout "$TIMEOUT" "$VL" build "$f" "$RUNG" -o "$slot/out.wasm" --compiler "$COMPILER" \
      > "$slot/$side.stdout" 2> "$slot/$side.stderr"
    rc=$?
    if [ "$rc" -eq 124 ]; then
      echo "UNCOMPARED $f (timed out, side $side)"
      rm -rf "$slot"
      return
    fi
    echo "$rc" > "$slot/$side.rc"
    mv "$slot/log" "$slot/$side.argv"
    if [ -f "$slot/out.wasm" ]; then mv "$slot/out.wasm" "$slot/$side.wasm"; fi
  done
  if ! cmp -s "$slot/a.rc" "$slot/b.rc"; then
    echo "DIFFER $f (exit $(cat "$slot/a.rc") vs $(cat "$slot/b.rc"))"
  elif ! cmp -s "$slot/a.argv" "$slot/b.argv"; then
    echo "DIFFER $f (wasm-opt argv)"
  elif [ -f "$slot/a.wasm" ] || [ -f "$slot/b.wasm" ]; then
    if cmp -s "$slot/a.wasm" "$slot/b.wasm"; then
      echo "AGREE $f $(grep -c -e --no-inline= -e --skip-pass= "$slot/a.argv")"
    else
      echo "DIFFER $f (module bytes)"
    fi
  else
    echo "AGREE-FAIL $f"
  fi
  rm -rf "$slot"
}
export -f one
export WORK VAR A B VL COMPILER TIMEOUT RUNG

xargs -a "$WORK/files" -d '\n' -P "$JOBS" -I{} bash -c 'one "$1"' _ {} > "$WORK/verdicts"

agree=$(grep -c '^AGREE ' "$WORK/verdicts")
both_fail=$(grep -c '^AGREE-FAIL ' "$WORK/verdicts")
marked=$(grep -c "^AGREE .* [1-9][0-9]*\$" "$WORK/verdicts")
differ=$(grep -c '^DIFFER ' "$WORK/verdicts")
uncompared=$(grep -c '^UNCOMPARED ' "$WORK/verdicts")
grep -E '^(DIFFER|UNCOMPARED) ' "$WORK/verdicts" | sort
echo "opt-parity $VAR=$A vs $B ($RUNG): $total programs · $agree identical modules ·" \
  "$both_fail both refused · $marked identical carrying a --no-inline or --skip-pass mark · $differ differ · $uncompared uncompared"
[ "$differ" -eq 0 ]
