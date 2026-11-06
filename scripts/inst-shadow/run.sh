#!/bin/bash
# The instance-choice shadow: what mono instances a generic call at, against the elaboration.
#
#   scripts/inst-shadow/run.sh [--seed S] [--jobs N] [--out F] [FILE...]
#
# Applies probe.patch to a copy of compiler/ (uncommitted edits included), builds a probe
# compiler with --seed (default build/vl-compiler.wasm), builds each FILE with it (default:
# tests/cases and the distilled corpus) and prints the class table. --out keeps the raw lines.
#
# One line per call `monoWalkIdentCall` instances, one tag per parameter (README.md):
#   ok repeq litrep nulfn bundle monoopenrec colstub annrow argrep   the two sides agree
#   REAL[...]                     they disagree; the line names both
#   <why>:xyz, no:argrep-dis      the walk top has no closed type, and what else answers
# and a call whose own pin is not closed is `monoopen`, its parameters `eo:yes` / `eo:no` by
# whether the elaboration closes them anyway. Run from the checkout root.
set -euo pipefail

SEED=build/vl-compiler.wasm
JOBS=4
OUT=""
FILES=()
while [ $# -gt 0 ]; do
  case "$1" in
    --seed) SEED="$2"; shift 2 ;;
    --jobs) JOBS="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    *) FILES+=("$1"); shift ;;
  esac
done
VL="${VL:-$PWD/scripts/vl-host/target/release/vl}"
HERE="$(cd "$(dirname "$0")" && pwd)"

T="$(mktemp -d "${TMPDIR:-/tmp}/inst-shadow.XXXXXX")"
trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$T/tree"
cp -r compiler "$T/tree/"
touch "$T/tree/deno.json"
patch -s -p1 -d "$T/tree" < "$HERE/probe.patch"
if ! timeout 600 "$VL" build "$T/tree/compiler/entry.vl" --compiler "$SEED" -o "$T/probe.wasm" \
  > "$T/build.log" 2>&1; then
  cat "$T/build.log"
  exit 1
fi

if [ ${#FILES[@]} -eq 0 ]; then
  find tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named \
    -name '*.vl' | sort > "$T/files"
else
  printf '%s\n' "${FILES[@]}" > "$T/files"
fi

export VL T
one() {
  local o
  o="$(mktemp "$T/o.XXXXXX")"
  VL_LATE_DEMANDS=1 VL_STD="$PWD/std" timeout 120 "$VL" build "$1" --compiler "$T/probe.wasm" \
    -o "$o.wasm" 2>&1 < /dev/null | grep -F "@@IS" | sed "s|^\[late\] [^:]*: demand @@IS |$1 |" || true
  rm -f "$o" "$o.wasm"
}
export -f one
xargs -a "$T/files" -P "$JOBS" -I{} bash -c 'one "$1"' _ {} > "$T/lines"
[ -n "$OUT" ] && cp "$T/lines" "$OUT"

awk '
  {
    f = $1; call = "agree"
    for (i = 4; i <= NF; i++) {
      t = $i
      if (t ~ /^REAL/) { sub(/\[.*/, "", t) }
      if (t ~ /^(ok|repeq|litrep|nulfn|bundle|monoopenrec|colstub|annrow|argrep|REAL|monoopen|eo:(yes|no)|no:[a-z-]+|[a-z-]+:[adn][adn][adn]+)$/) {
        n[t]++
        if (!((t, f) in seen)) { seen[t, f] = 1; p[t]++ }
        if (t == "REAL") call = "disagree"
        else if (t == "monoopen") call = "mono pin open"
        else if (t ~ /^(no:|[a-z-]+:[adn][adn][adn]+$)/ && call == "agree") call = "no answer"
      }
    }
    c[call]++
    if (!((call, f) in cs)) { cs[call, f] = 1; cp[call]++ }
  }
  END {
    printf "%-16s %8s %8s\n", "call", "calls", "programs"
    split("agree|disagree|no answer|mono pin open", k, "|")
    for (j = 1; j <= 4; j++) printf "%-16s %8d %8d\n", k[j], c[k[j]], cp[k[j]]
    printf "\n%-16s %8s %8s\n", "parameter tag", "params", "programs"
    for (t in n) printf "%-16s %8d %8d\n", t, n[t], p[t] | "sort"
  }
' "$T/lines"
if grep -q "REAL" "$T/lines"; then
  echo
  grep "REAL" "$T/lines"
fi
