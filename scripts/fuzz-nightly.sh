#!/usr/bin/env bash
# Nightly randomized-seed fuzz sweep (Phase 0 item 3, docs/internals/codebase-audit-2026-07.md):
# scripts/rep-fuzz-check.sh gates 16 FROZEN seeds only — proven three times now to under-sample
# the ~10^5-shape space (fresh seeds keep finding unsound output at roughly 1 per ~200 programs).
# This script runs a FRESH batch of random seeds each invocation, so coverage grows over time
# instead of staying pinned to the same net. Driven nightly by .github/workflows/fuzz-nightly.yml;
# fully runnable locally for triage.
#
# Same baseline contract as scripts/fuzz-vl.sh / rep-fuzz-check.sh: a `CLASS<TAB>SHAPE` line
# present in the baseline is a committed known issue, suppressed. What's DIFFERENT from
# rep-fuzz-check.sh's exact bidirectional check: this script never asks for the baseline to be
# reconciled (STALE lines are not this script's concern — that's the pinned-seed job's invariant).
# Instead it classifies non-baselined findings by SOUNDNESS:
#   - any non-baselined INVALID-WASM / TRAP / MISMATCH -> exit 1 (a fresh soundness hole: never OK)
#   - non-baselined REJECT only                        -> exit 0 (report-only: the fail-loud tail)
#
# USAGE: scripts/fuzz-nightly.sh [--seeds N] [--count M] [--depths "D1 D2 ..."] [--baseline FILE]
#                                 [--out-dir DIR]
#   --seeds N       number of fresh random seeds to sample this run (default 10)
#   --count M       programs generated per seed (default 200)
#   --depths LIST   space-separated depths, cycled across seeds round-robin (default "4 5 6")
#   --baseline FILE known-issue baseline (default scripts/rep-fuzz-baseline.txt)
#   --out-dir DIR   where per-seed shapes/keep artifacts land (default a fresh mktemp dir, printed)
#   --branching     generate BRANCHING-tree shapes (fuzz-vl.sh --branching): multi-element
#                   arrays/maps, structs with two recursive fields, arity-3 unions, multi-param
#                   closures. A frontier the pinned net never samples — pair with --experimental.
#   --multiobs      widen the ORACLE (fuzz-vl.sh --multiobs): also read + assert decoy siblings, the
#                   union decoy arm, and (with --branching) the map's second entry. Surfaces
#                   miscompiles the single-carrier oracle masks — pair with --experimental. Composes
#                   with --branching.
#   --declared      DECLARED-TYPES dimension (fuzz-vl.sh --declared): hoist struct-flavored shapes to
#                   `type Tn = {...}` declarations — declared spelling, structural twins, and the
#                   mixed declared/inline seam (PR #911's dup-heap shapes). A frontier the inline-only
#                   pinned net never samples — pair with --experimental. Composes with --branching/
#                   --multiobs.
#   --experimental  report-only: classify + print non-baselined unsound findings but ALWAYS exit 0
#                   (never fail the job). For a survey leg still surfacing many holes (e.g.
#                   --branching), so the frontier is measured and artifacted without gating.
# Requires a fresh seed: bash scripts/refresh-compiler.sh
set -uo pipefail
cd "$(dirname "$0")/.."

SEEDS_N=10
COUNT=200
DEPTHS="4 5 6"
BASELINE="scripts/rep-fuzz-baseline.txt"
OUT_DIR=""
BRANCHING=""
MULTIOBS=""
DECLARED=""
EXPERIMENTAL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --seeds) SEEDS_N="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --depths) DEPTHS="$2"; shift 2 ;;
    --baseline) BASELINE="$2"; shift 2 ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --branching) BRANCHING="--branching"; shift ;;
    --multiobs) MULTIOBS="--multiobs"; shift ;;
    --declared) DECLARED="--declared"; shift ;;
    --experimental) EXPERIMENTAL=1; shift ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done
# EXTRA = the generalization flags passed through to fuzz-vl.sh (branching shapes, the widened
# oracle, and/or the declared-types dimension); all compose. Word-split intentionally at the
# fuzz-vl.sh call (each is a bare flag token).
EXTRA="$BRANCHING $MULTIOBS $DECLARED"
MODE="pinned-grammar"
[ -z "$BRANCHING" ] || MODE="branching-tree (experimental)"
[ -z "$MULTIOBS" ] || MODE="$MODE + multi-observation (experimental)"
[ -z "$DECLARED" ] || MODE="$MODE + declared-types (experimental)"

[ -n "$OUT_DIR" ] || OUT_DIR="$(mktemp -d)"
mkdir -p "$OUT_DIR"
echo "fuzz-nightly: out-dir=$OUT_DIR"

# Fresh, unpinned seeds every run: bash's $RANDOM twice (15 bits each) composed so a rerun samples
# a different corner of the shape space than the last nightly, and never collides with the 16
# seeds frozen in rep-fuzz-check.sh. Printed up front so ANY run (CI or local) is reproducible from
# the log alone, even before results land.
read -ra depth_arr <<< "$DEPTHS"
declare -a seeds=()
declare -A seed_depth=()
i=0
while [ "$i" -lt "$SEEDS_N" ]; do
  s=$((RANDOM * RANDOM + RANDOM))
  seeds+=("$s")
  seed_depth[$s]="${depth_arr[$((i % ${#depth_arr[@]}))]}"
  i=$((i + 1))
done

echo "fuzz-nightly: mode=$MODE"
echo "fuzz-nightly: seeds = ${seeds[*]}"
echo "fuzz-nightly: count=$COUNT depths=$DEPTHS baseline=$BASELINE"
for s in "${seeds[@]}"; do
  echo "  seed $s -> depth ${seed_depth[$s]} (repro: scripts/fuzz-vl.sh --seed $s --count $COUNT --depth ${seed_depth[$s]})"
done

for s in "${seeds[@]}"; do
  d="${seed_depth[$s]}"
  echo; echo "-- running seed $s (depth $d) --"
  # shellcheck disable=SC2086  # $EXTRA is bare flag tokens (--branching/--multiobs) or empty
  ./scripts/fuzz-vl.sh --seed "$s" --count "$COUNT" --depth "$d" $EXTRA \
    --baseline "$BASELINE" --shapes-out "$OUT_DIR/seed_$s.tsv" --keep "$OUT_DIR/keep_$s" --quiet
done

# Aggregate: the complete non-baselined failure set across all seeds this run, class-tagged
# `CLASS<TAB>SHAPE` — same exact-line suppression logic as rep-fuzz-check.sh (a baseline line only
# suppresses the IDENTICAL class+shape; a shape that got WORSE, e.g. REJECT -> INVALID-WASM, is a
# new line and surfaces).
cat "$OUT_DIR"/seed_*.tsv 2>/dev/null | sort -u > "$OUT_DIR/cur.txt" || : > "$OUT_DIR/cur.txt"
{ grep -P '\t' "$BASELINE" || true; } | sort -u > "$OUT_DIR/base.txt"
comm -23 "$OUT_DIR/cur.txt" "$OUT_DIR/base.txt" > "$OUT_DIR/new.txt" || : > "$OUT_DIR/new.txt"

unsound_new="$(grep -vP '^REJECT\t' "$OUT_DIR/new.txt" || true)"
reject_new="$(grep -P '^REJECT\t' "$OUT_DIR/new.txt" || true)"

# Family = the shape with its `p<pos><variant>` position/role prefix stripped, so the same
# underlying type failing at several read/construct/global positions counts as one family.
family_summary() {
  sed -E 's/^([A-Z-]+)\tp[0-9]+[a-z]? /\1\t/' | sort | uniq -c | sort -rn
}

{
  echo "### fuzz-nightly summary ($MODE)"
  echo
  echo "seeds: ${seeds[*]} (count=$COUNT, depths=$DEPTHS)"
  echo
  if [ -n "$unsound_new" ]; then
    verdict="Job FAILS."
    [ "$EXPERIMENTAL" -eq 0 ] || verdict="Report-only (experimental) — job does NOT fail."
    echo "**UNSOUND — $(printf '%s\n' "$unsound_new" | grep -c .) non-baselined finding(s) (INVALID-WASM/TRAP/MISMATCH). $verdict**"
  else
    echo "No non-baselined unsound (INVALID-WASM/TRAP/MISMATCH) findings."
  fi
  if [ -n "$reject_new" ]; then
    n_reject=$(printf '%s\n' "$reject_new" | grep -c .)
    echo
    echo "$n_reject new non-baselined REJECT shape(s) (report-only, fail-loud tail — not a soundness hole):"
    echo
    echo '```'
    printf '%s\n' "$reject_new" | family_summary
    echo '```'
  fi
} | tee "$OUT_DIR/summary.md"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  cat "$OUT_DIR/summary.md" >> "$GITHUB_STEP_SUMMARY"
fi

if [ -z "$unsound_new" ]; then
  echo; echo "fuzz-nightly: OK (0 new unsound findings; ${reject_new:+new REJECTs are report-only})"
  exit 0
fi

verb="FAILED"
[ "$EXPERIMENTAL" -eq 0 ] || verb="report-only (experimental, exit 0)"
echo
echo "fuzz-nightly: $verb — non-baselined unsound finding(s):"
echo
while IFS=$'\t' read -r class shape; do
  [ -n "$class" ] || continue
  echo "✗ $class  $shape"
  # Identify which seed(s) this run produced the finding at, for an exact repro command.
  for s in "${seeds[@]}"; do
    f="$OUT_DIR/seed_$s.tsv"
    [ -f "$f" ] || continue
    if grep -qxF "$(printf '%s\t%s' "$class" "$shape")" "$f"; then
      d="${seed_depth[$s]}"
      echo "    repro: scripts/fuzz-vl.sh --seed $s --count $COUNT --depth $d $EXTRA"
      echo "    failing case + error kept at: $OUT_DIR/keep_$s/"
    fi
  done
done <<< "$unsound_new"

# Experimental legs (e.g. --branching) surface the frontier for measurement, not as a gate: report
# and exit 0. The pinned-grammar leg still fails loudly on any fresh unsound hole.
[ "$EXPERIMENTAL" -eq 0 ] || exit 0
exit 1
