#!/usr/bin/env bash
# A claim that falls back must leave the module as legacy alone writes it (D17241, D17242).
#
#     scripts/claim-refusal-survey.sh <seed> [--shard K/N] [--list <file>]
#
# Builds the claimless compiler from <seed> (`ir-identity.sh --build-claimless`), then every
# tests/cases program not marked `@error` and every distilled cell (or the programs <file> names)
# three ways: claimless, and under <seed> with `$VL_TEST_CLAIM_REFUSAL=1` and `=2`, which refuse
# every claimed function and start before or after its body. Each forced-refusal module must `cmp`
# equal to the claimless one. Prints `claim-refusal survey: N programs, differ D, buildfail B` and
# each `DIFF r<k> f` / `BUILDFAIL r<k> f`; exits 1 on any. A program claimless cannot build, or
# that runs past 60 s, is not graded. Run from the checkout root; $VL names the host, $JOBS the
# fan-out (default 4).
set -euo pipefail
SEED=${1:?usage: scripts/claim-refusal-survey.sh <seed> [--shard K/N] [--list <file>]}
shift
SHARD="1/1"
LIST=""
while [ $# -gt 0 ]; do
  case "$1" in
    --shard) SHARD=${2:?--shard K/N}; shift 2 ;;
    --list) LIST=${2:?--list <file>}; shift 2 ;;
    *) echo "claim-refusal-survey: unknown argument $1" >&2; exit 2 ;;
  esac
done
export VL=${VL:-$PWD/scripts/vl-host/target/release/vl}
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
scripts/ir-identity.sh --build-claimless "$SEED" "$T/claimless.wasm" > /dev/null
if [ -n "$LIST" ]; then cp "$LIST" "$T/all"; else
  { grep -rL '^// @error' --include='*.vl' tests/cases | grep -v '/lib\.vl$'
    ls scripts/silent-sweep/distilled/cells/*.vl scripts/silent-sweep/distilled/named/*.vl
  } | LC_ALL=C sort > "$T/all"
fi
K=${SHARD%/*}; N=${SHARD#*/}
awk -v k="$K" -v n="$N" '(NR - 1) % n == k - 1' "$T/all" > "$T/list"
export T SEED
one() {
  local f=$1 k
  k=$(printf "%s" "$f" | tr "/" "_")
  timeout 60 "$VL" build "$f" -o "$T/$k.cl.wasm" --compiler "$T/claimless.wasm" > /dev/null 2>&1 \
    || { rm -f "$T/$k.cl.wasm"; return 0; }
  for m in 1 2; do
    if ! VL_TEST_CLAIM_REFUSAL=$m timeout 60 "$VL" build "$f" -o "$T/$k.r$m.wasm" --compiler "$SEED" \
      > /dev/null 2>&1; then
      echo "BUILDFAIL r$m $f"
    elif ! cmp -s "$T/$k.cl.wasm" "$T/$k.r$m.wasm"; then
      echo "DIFF r$m $f"
    fi
    rm -f "$T/$k.r$m.wasm"
  done
  rm -f "$T/$k.cl.wasm"
}
export -f one
xargs -a "$T/list" -P "${JOBS:-4}" -I{} bash -c 'one "$@"' _ {} | LC_ALL=C sort > "$T/rows"
cat "$T/rows"
d=$(grep -c '^DIFF' "$T/rows" || true)
b=$(grep -c '^BUILDFAIL' "$T/rows" || true)
echo "claim-refusal survey: $(wc -l < "$T/list") programs, differ $d, buildfail $b"
[ "$d" = 0 ] && [ "$b" = 0 ]
