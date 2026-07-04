#!/usr/bin/env bash
# Exact rep-composition fuzz check — the CI gate over the pinned seeds (101/202/303).
#
# "Exact" means the baseline is a PRECISE mirror of the current fail-loud rejects — no
# entry that no longer triggers a failure, no failure that isn't accounted for. The check
# is BIDIRECTIONAL and fails on any of three conditions:
#
#   1. SOUNDNESS — any INVALID-WASM / TRAP / MISMATCH at any seed. These are real bugs and
#      are NEVER baselineable; the residual must stay 0.
#   2. NEW REJECT — a reject shape not in the baseline: a coverage regression (under fixed
#      seeds a shape that used to compile now rejects).
#   3. STALE BASELINE — a baseline shape that no longer fails: a fix landed but the shape
#      wasn't graduated. A baseline entry that doesn't trigger an issue is not allowed.
#
# So every baseline line corresponds to exactly one currently-failing (reject) shape, and
# every finding is a genuine issue. On a clean tree: 0 soundness, 0 new, 0 stale → exit 0.
#
# Regenerate the baseline after a fix (or a fuzzgen change) — this script prints the exact
# NEW/STALE deltas to apply. Requires a fresh seed: bash scripts/refresh-compiler.sh
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE="${BASELINE:-scripts/rep-fuzz-baseline.txt}"
SEEDS=("101 120 2" "202 120 3" "303 120 4")   # seed count depth — must match ci.yml + the baseline header

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
SHAPES="$WORK/shapes.tsv"

# Run the seeds in parallel (matching CI wall-clock), each to its OWN shapes file to
# avoid concurrent-append interleaving; concatenate once all finish.
pids=()
i=0
for sc in "${SEEDS[@]}"; do
  # shellcheck disable=SC2086
  set -- $sc
  ./scripts/fuzz-vl.sh --seed "$1" --count "$2" --depth "$3" --quiet --shapes-out "$WORK/s$i.tsv" >/dev/null 2>&1 &
  pids+=($!); i=$((i + 1))
done
for p in "${pids[@]}"; do wait "$p" || true; done   # fuzz-vl.sh exits 1 on findings; the analysis below is authoritative
cat "$WORK"/s*.tsv > "$SHAPES" 2>/dev/null || : > "$SHAPES"

# 1. Soundness — any non-REJECT class is a hard finding.
unsound="$(grep -vP '^REJECT\t' "$SHAPES" 2>/dev/null | sort -u || true)"

# Current reject shapes (union across seeds) vs the baseline.
cut -f2 <(grep -P '^REJECT\t' "$SHAPES" 2>/dev/null || true) | sort -u > "$WORK/cur.txt"
# `|| true`: an EMPTY baseline shape list (the ZERO goal — every shape graduated) makes `grep`
# exit 1, which under `set -euo pipefail` would abort the script before the analysis. Tolerate
# no matches so the all-clear (`exact ✅ (0 reject shapes …)`) can actually be reported.
{ grep '^p' "$BASELINE" || true; } | sort -u > "$WORK/base.txt"
new="$(comm -23 "$WORK/cur.txt" "$WORK/base.txt")"    # failing now, not in baseline → regression
stale="$(comm -13 "$WORK/cur.txt" "$WORK/base.txt")"  # in baseline, not failing now → graduate

rc=0
if [ -n "$unsound" ]; then
  echo "✗ SOUNDNESS — unsound outputs must be 0 (never baselineable):"; echo "$unsound" | sed 's/^/    /'; rc=1
fi
if [ -n "$new" ]; then
  echo "✗ NEW REJECT — coverage regression (shape rejects but is not in the baseline):"; echo "$new" | sed 's/^/    + /'; rc=1
fi
if [ -n "$stale" ]; then
  echo "✗ STALE BASELINE — shape no longer fails; graduate it (remove from $BASELINE, pin a tests/cases/ regression):"
  echo "$stale" | sed 's/^/    - /'; rc=1
fi

if [ "$rc" -eq 0 ]; then
  echo "rep-fuzz-check: exact ✅  ($(wc -l < "$WORK/cur.txt" | tr -d ' ') reject shapes, all baselined; 0 unsound, 0 new, 0 stale)"
else
  echo; echo "rep-fuzz-check: FAILED — see deltas above."
fi
exit "$rc"
