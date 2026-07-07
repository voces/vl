#!/usr/bin/env bash
# Exact rep-composition fuzz check — the CI gate over a broad pinned seed set.
#
# The baseline is a COMPLETE, class-tagged snapshot of every shape that currently fails
# (any class: INVALID-WASM / TRAP / MISMATCH / REJECT). The rule is simply NO REGRESSION —
# the current failure set must EQUAL the baseline set. The check is bidirectional:
#
#   1. NEW — a `CLASS<TAB>SHAPE` failing now but not in the baseline. A regression: a brand
#      new failure, OR a known shape that got WORSE (e.g. REJECT -> INVALID-WASM shows up as a
#      new INVALID-WASM line). Fails CI.
#   2. STALE — a baseline line that no longer fails: a fix landed (or a shape improved), so
#      graduate it (remove the line + pin a tests/cases/ regression proving the fix).
#
# So known issues are committed and burned down over time; the invariant is that we never
# ADD a failure or silently worsen one. When the baseline empties, the fuzzer is at true zero.
#
# SOUNDNESS IS NEVER BASELINEABLE: only REJECT (a loud parse/type/emit refusal) may ever appear
# in the baseline. INVALID-WASM / TRAP / MISMATCH are miscompiles — silently pinning one as
# "known" would suppress a real bug from CI with no objection. This is enforced below, not just
# documented: a baseline line tagged with an unsound class fails the check immediately.
#
# Regenerate after a fix (or a scripts/fuzzgen.vl change): this script prints the exact
# NEW/STALE deltas to apply. Requires a fresh seed: bash scripts/refresh-compiler.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="${BASELINE:-scripts/rep-fuzz-baseline.txt}"

# Soundness ratchet: reject any baselined line whose class isn't REJECT, before spending any
# time on the fuzz run itself. See the header note above.
unsound_baseline="$(grep -P '^(INVALID-WASM|TRAP|MISMATCH)\t' "$BASELINE" 2>/dev/null || true)"
if [ -n "$unsound_baseline" ]; then
  echo "✗ unsound classes (INVALID-WASM/TRAP/MISMATCH) are never baselineable — fix the miscompile or convert it to a loud REJECT:"
  echo "$unsound_baseline" | sed 's/^/    ! /'
  echo
  echo "rep-fuzz-check: FAILED — $BASELINE contains a non-REJECT class; see message above."
  exit 1
fi

# seed count depth — the broad net. Must match the header note in the baseline file.
SEEDS=(
  "101 150 3" "202 150 4" "303 150 4"
  "1 150 4" "7 150 4" "13 150 5" "42 150 4" "99 150 5"
  "500 150 4" "777 150 5" "1234 150 5" "2024 150 4"
  "9999 150 5" "31337 150 5" "88888 150 5" "65535 150 4"
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Run the seeds in parallel, each to its OWN shapes file (avoids concurrent-append
# interleaving); concatenate once all finish. fuzz-vl.sh --shapes-out emits `CLASS<TAB>SHAPE`.
pids=()
i=0
for sc in "${SEEDS[@]}"; do
  # shellcheck disable=SC2086
  set -- $sc
  ./scripts/fuzz-vl.sh --seed "$1" --count "$2" --depth "$3" --quiet --shapes-out "$WORK/s$i.tsv" >/dev/null 2>&1 &
  pids+=($!); i=$((i + 1))
done
for p in "${pids[@]}"; do wait "$p" || true; done   # fuzz-vl.sh exits 1 on findings; the analysis below is authoritative

# Current failure set: class-tagged `CLASS<TAB>SHAPE` (SHAPE keeps its `p<pos><variant>` prefix,
# so a type is tracked per-position — a rep can be sound in one position and not another), deduped.
cat "$WORK"/s*.tsv 2>/dev/null | sort -u > "$WORK/cur.txt" || : > "$WORK/cur.txt"
# `|| true`: an EMPTY baseline (the ZERO goal) makes grep exit 1, which under `set -e` would abort
# before the all-clear can print. Tolerate no matches.
{ grep -P '\t' "$BASELINE" || true; } | sort -u > "$WORK/base.txt"

new="$(comm -23 "$WORK/cur.txt" "$WORK/base.txt")"    # failing now, not baselined -> regression / worse
stale="$(comm -13 "$WORK/cur.txt" "$WORK/base.txt")"  # baselined, not failing now -> graduate

rc=0
if [ -n "$new" ]; then
  echo "✗ NEW / WORSE — a failure not in the baseline (regression):"; echo "$new" | sed 's/^/    + /'; rc=1
fi
if [ -n "$stale" ]; then
  echo "✗ STALE — no longer fails; graduate it (remove from $BASELINE, pin a tests/cases/ regression):"
  echo "$stale" | sed 's/^/    - /'; rc=1
fi

cur_n=$(wc -l < "$WORK/cur.txt" | tr -d ' ')
# `grep -c` prints the count AND exits 1 when it's 0, so `|| echo 0` would append a
# SECOND "0" (breaking the `$((…))` below the moment unsound hits 0 — the goal state).
# Take the first line only, defaulting to 0.
unsound_n=$( { grep -cvP '^REJECT\t' "$WORK/cur.txt" 2>/dev/null || true; } | head -1 )
unsound_n=${unsound_n:-0}
if [ "$rc" -eq 0 ]; then
  echo "rep-fuzz-check: exact ✅  ($cur_n baselined failures — $unsound_n unsound, $((cur_n - unsound_n)) reject; 0 new, 0 stale)"
else
  echo; echo "rep-fuzz-check: FAILED — reconcile the baseline (apply the deltas above)."
fi
exit "$rc"
