#!/usr/bin/env bash
# Differential fuzz: generate programs, run them compiled (`vl run --batch`) and in the oracle,
# and report every disagreement (docs/internals/refactor-notes/2026-11-14-oracle-design.md).
#
#   scripts/oracle/fuzz.sh [--seeds N] [--count M] [--gen arith|data|hof|rep|both|all] [--keep DIR]
#
# `arith` is scripts/oracle/gen.ts (arithmetic, widths, casts, evaluation order); `data` is
# scripts/oracle/gen_data.ts (records, lists, maps, closures, loops, strings, evaluation order);
# `hof` is scripts/oracle/gen_hof.ts (generics, hole functions, function values, declaration
# order); `rep` is scripts/fuzzgen.vl's batch (the rep-composition programs fuzz-vl.sh runs); `both` is
# arith and rep, `all` all four. Exit 1 on a new DISAGREE or UNSOUND verdict, a COMPILED-BAD
# one (scripts/oracle/known.txt lists the filed cells, and the filed refusals by row), or a
# generator whose share of cases `vl check` refuses passes its ceiling; 2 on setup failure.
# Requires a fresh seed (scripts/refresh-compiler.sh) and deno.
set -uo pipefail
cd "$(dirname "$0")/../.."

SEEDS=2
COUNT=200
GEN=both
KEEP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --seeds) SEEDS="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --gen) GEN="$2"; shift 2 ;;
    --keep) KEEP="$2"; shift 2 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
done

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED_WASM="${SEED_WASM:-build/vl-compiler.wasm}"
[ -x "$VL" ] || { echo "oracle-fuzz: no vl at $VL"; exit 2; }
[ -f "$SEED_WASM" ] || { echo "oracle-fuzz: no seed at $SEED_WASM (scripts/refresh-compiler.sh)"; exit 2; }
command -v deno >/dev/null || { echo "oracle-fuzz: deno is required"; exit 2; }

WORK="${KEEP:-$(mktemp -d)}"
[ -n "$KEEP" ] || trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/cases" "$WORK/out"

for s in $(seq 1 "$SEEDS"); do
  if [ "$GEN" = arith ] || [ "$GEN" = both ] || [ "$GEN" = all ]; then
    deno run -A scripts/oracle/gen.ts "$WORK/cases" --seed "$s" --count "$COUNT" || exit 2
  fi
  if [ "$GEN" = data ] || [ "$GEN" = all ]; then
    deno run -A scripts/oracle/gen_data.ts "$WORK/cases" --seed "$s" --count "$COUNT" || exit 2
  fi
  if [ "$GEN" = hof ] || [ "$GEN" = all ]; then
    deno run -A scripts/oracle/gen_hof.ts "$WORK/cases" --seed "$s" --count "$COUNT" || exit 2
  fi
  if [ "$GEN" = rep ] || [ "$GEN" = both ] || [ "$GEN" = all ]; then
    sed -e "s/^let SEED = .*/let SEED = $s/" -e "s/^let COUNT = .*/let COUNT = $COUNT/" \
      -e "s/^let BRANCHING = .*/let BRANCHING = 1/" -e "s/^let MULTIOBS = .*/let MULTIOBS = 1/" \
      scripts/fuzzgen.vl > "$WORK/gen.vl"
    "$VL" run "$WORK/gen.vl" --compiler "$SEED_WASM" > "$WORK/batch.txt" || { echo "oracle-fuzz: fuzzgen failed"; exit 2; }
    awk -v dir="$WORK/cases" -v s="$s" '
      /^===CASE/ { if (file) close(file); n++; file = sprintf("%s/rep_s%d_%05d.vl", dir, s, n); next }
      n > 0 { print > file }
    ' "$WORK/batch.txt"
  fi
done

# In chunks: one argument list of every case overflows ARG_MAX at a few tens of thousands of paths.
find "$WORK/cases" -maxdepth 1 -name '*.vl' -print0 | sort -z \
  | xargs -0 -n 2000 "$VL" run --batch --out-dir "$WORK/out" --compiler "$SEED_WASM" >/dev/null \
  || { echo "oracle-fuzz: vl run --batch failed"; exit 2; }
deno run -A scripts/oracle/oracle.ts diff "$WORK/cases" "$WORK/out" --json "$WORK/verdicts.jsonl"
rc=$?
# A COMPILED-BAD cell (the compiled program traps, fails to load or prints a wrong value where the
# oracle runs) fails the run too, unless known.txt lists it: the oracle's own exit counts only
# disagreements, and a red cell must not pass a green run. A compile that fails with a refusal a
# known.txt row names is REFUSED-FILED, not COMPILED-BAD; a line's first word is its cell or row id.
known_cells=$(awk '{ sub(/#.*/, ""); if ($1 != "") print $1 }' scripts/oracle/known.txt)
bad=$(grep '"verdict":"COMPILED-BAD"' "$WORK/verdicts.jsonl" | sed -e 's/.*"cell":"\([^"]*\)".*/\1/' \
  | grep -vxF -e "$known_cells" -e '' || true)
if [ -n "$bad" ]; then
  echo "oracle-fuzz: $(echo "$bad" | wc -l) COMPILED-BAD cell(s) known.txt does not list:"
  echo "$bad" | sed 's/^/  /'
  [ "$rc" -eq 0 ] && rc=1
fi
# Every generator emits programs meant to pass `vl check`, and a refused case is no test, so
# a generator whose refused share passes its ceiling fails the run: its templates have drifted
# from the language. A ceiling above the default is a debt with a refactor note, to be lowered.
ceiling() {
  case "$1" in
    ar) echo 62 ;;  # 2026-11-15-oracle-refused-column.md: constant folds the checker refuses
    ho) echo 7 ;;   # same note: untriaged
    *) echo "${REFUSAL_MAX_PCT:-2}" ;;
  esac
}
for g in ar da ho rep; do
  total=$(find "$WORK/cases" -maxdepth 1 -name "${g}_*.vl" | wc -l)
  [ "$total" -gt 0 ] || continue
  refused=$(grep -l -E 'type error|parse error' "$WORK"/out/"${g}"_*.vl.err 2>/dev/null | wc -l)
  pct=$((100 * refused / total))
  echo "oracle: refused $g $refused of $total (${pct}%, ceiling $(ceiling "$g")%)"
  if [ $((100 * refused)) -gt $(($(ceiling "$g") * total)) ]; then
    echo "oracle-fuzz: generator $g has $refused of $total cases refused by vl check, past its $(ceiling "$g")% ceiling"
    [ "$rc" -eq 0 ] && rc=1
  fi
done
exit "$rc"
