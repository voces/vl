#!/bin/bash
# The function-holding value shadow: mono's closed type for a returned record, list or stored call,
# against the elaboration's `elabHeldValTy`.
#
#   scripts/fn-fact-shadow/run.sh [--seed S] [--jobs N] [--out F] [FILE...]
#
# Applies probe.patch to a copy of compiler/ (uncommitted edits included), builds a probe
# compiler with --seed (default build/vl-compiler.wasm), builds each FILE with it (default:
# tests/cases, the distilled corpus and both inventories' `Repro:` witnesses) and prints, per
# mono function, how many decisions agree, differ, or are answered by one side only. --out keeps
# the raw lines. One line per decision, so the counts are decisions, not programs. Run from the
# checkout root.
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

T="$(mktemp -d "${TMPDIR:-/tmp}/fn-fact-shadow.XXXXXX")"
trap 'rm -rf "${T:?}"' EXIT
mkdir -p "$T/tree" "$T/inv"
cp -r compiler "$T/tree/"
touch "$T/tree/deno.json"
patch -s -p1 -d "$T/tree" < "$HERE/probe.patch"
if ! timeout 600 "$VL" build "$T/tree/compiler/entry.vl" --compiler "$SEED" -o "$T/probe.wasm" \
  > "$T/build.log" 2>&1; then
  cat "$T/build.log"
  exit 1
fi

if [ ${#FILES[@]} -eq 0 ]; then
  # Each inventory row's first `Repro:` block, unindented, as its own program.
  for d in docs/internals/inventory docs/internals/inventory-2; do
    for f in "$d"/D*.md; do
      w="$T/inv/$(basename "$d")-$(basename "$f" .md).vl"
      awk 'BEGIN { st = 0 }
        /^Repro:/ { st = 1; next }
        st == 1 && /^    / { st = 2 }
        st == 2 { if ($0 ~ /^    / || $0 ~ /^$/) { sub(/^    /, ""); print; next } else { exit } }
        st == 1 && !/^$/ { exit }' "$f" > "$w"
      [ -s "$w" ] || rm -f "$w"
    done
  done
  { find tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named \
      -name '*.vl'; find "$T/inv" -name '*.vl'; } | sort > "$T/files"
else
  printf '%s\n' "${FILES[@]}" > "$T/files"
fi

export VL T
one() {
  local o
  o="$(mktemp "$T/o.XXXXXX")"
  VL_LATE_DEMANDS=1 VL_STD="$PWD/std" timeout 120 "$VL" build "$1" --compiler "$T/probe.wasm" \
    -o "$o.wasm" 2>&1 < /dev/null | grep -F "@@FF" | sed "s|^\[late\] [^:]*: demand @@FF |$1 |" || true
  rm -f "$o" "$o.wasm"
}
export -f one
xargs -a "$T/files" -P "$JOBS" -I{} bash -c 'one "$1"' _ {} > "$T/lines"
[ -n "$OUT" ] && cp "$T/lines" "$OUT"

# Line: <file> <tag> <class> L<line> gen=<0|1> late=<n> rule=<rule> m=<mono> e=<elab> id=<identity>
awk '
  {
    k = $2 " " $3; n[k]++
    if (!((k, $1) in seen)) { seen[k, $1] = 1; p[k]++ }
    r = $2 " " $3 " " substr($7, 6); nr[r]++
    if ($6 != "late=0") late++
  }
  END {
    printf "%-9s %-9s %9s %9s\n", "tag", "class", "decisions", "programs"
    for (k in n) { split(k, a, " "); printf "%-9s %-9s %9d %9d\n", a[1], a[2], n[k], p[k] | "sort" }
    close("sort")
    printf "\n%-9s %-9s %-12s %9s\n", "tag", "class", "rule", "decisions"
    for (r in nr) { split(r, a, " "); printf "%-9s %-9s %-12s %9d\n", a[1], a[2], a[3], nr[r] | "sort" }
    close("sort")
    printf "\ndecisions whose reader minted a late elaboration key: %d\n", late
  }
' "$T/lines"
if grep -q " differ \| old-only " "$T/lines"; then
  echo
  grep " differ \| old-only " "$T/lines" | head -40
fi
