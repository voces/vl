#!/usr/bin/env bash
# The kill matrix: build broken compilers and record which gate checks catch each one.
# docs/internals/testing-strategy.md is what it is for and how to read it.
#
#   scripts/kill-matrix/run.sh [--out DIR] [MUTANT...]
#
# A MUTANT is a patch under scripts/kill-matrix/mutants/ (`<name>.diff`, applied to
# compiler/), or `revert:<sha>`, the compiler/*.vl half of a commit applied in reverse. With
# none, every patch there and every sha in mutants/reverts.txt. For each one, in turn: apply
# it, build the seed with scripts/refresh-compiler.sh off the pristine seed, run every
# gate.sh row with each deno suite writing junit, then restore compiler/ and the pristine
# seed. `<out>/<mutant>/status` is `seed-build-failed`, `apply-failed` or `gate-rc=N secs=S`;
# `<out>/pristine/` is the same run on the unmutated tree. `<out>/<mutant>/logs/` holds
# the rows' logs and `j*.xml`. A mutant already holding a status is skipped, so an
# interrupted run resumes. Read it with report.ts.
#
# It edits compiler/ and build/vl-compiler.wasm in THIS checkout, so it refuses a dirty
# compiler/, and nothing else may build or gate here while it runs. Never commit a mutant.
set -u
cd "$(dirname "$0")/../.."
ROOT=$PWD
OUT="${TMPDIR:-/tmp}/vl-kill-matrix"
[ "${1:-}" = --out ] && { OUT=$2; shift 2; }
mkdir -p "$OUT"
[ -z "$(git status --porcelain -- compiler/)" ] || { echo "kill-matrix: compiler/ is dirty; commit or restore it first" >&2; exit 2; }
[ -f build/vl-compiler.wasm ] || { echo "kill-matrix: no seed; run scripts/refresh-compiler.sh" >&2; exit 2; }
# A suite whose tool is absent registers ignored and passes, so the matrix would read every
# mutant only it can see as SURVIVED: the release-shape files need wasm-tools and binaryen, and
# the timing pairs /usr/bin/time. CI's release job installs wasm-tools 1.258.0.
for t in wasm-tools /usr/bin/time /usr/bin/true node_modules/.bin/wasm-opt node_modules/.bin/wasm-dis; do
  command -v "$t" >/dev/null || { echo "kill-matrix: missing $t, and the suites that need it would skip; install it first" >&2; exit 2; }
done
PRISTINE="$OUT/pristine.wasm"
cp build/vl-compiler.wasm "$PRISTINE"

# gate.sh, with each `deno test` row writing junit next to its log and the logs kept.
GATE="$OUT/gate-junit.sh"
awk '{ if ($0 ~ /^run "/ && $0 ~ /deno test -A --no-check/) { n++
         sub(/deno test -A --no-check/, "deno test -A --no-check --junit-path=$LOGS/j" n ".xml") }
       print }' scripts/gate.sh |
  sed "s|^cd \"\$(dirname \"\$0\")/..\"|cd \"$ROOT\"|; s|^LOGS=.*|LOGS=\"\${KM_LOGS:?}\"; mkdir -p \"\$LOGS\"|" > "$GATE"
grep -q 'junit-path' "$GATE" || { echo "kill-matrix: gate.sh's deno rows were not found" >&2; exit 2; }

restore() {
  git checkout -q -- compiler/
  cp "$PRISTINE" build/vl-compiler.wasm
  # A mutant seed's engine sidecars are ~220 MB each; keep only the pristine seed's.
  find build -name 'vl-compiler.wasm.*.cwasm' -newer "$PRISTINE" -delete 2>/dev/null
}
trap restore EXIT

if [ $# -eq 0 ]; then
  set -- $(ls scripts/kill-matrix/mutants/*.diff 2>/dev/null | xargs -n1 basename | sed 's/\.diff$//') \
         $(grep -v '^#' scripts/kill-matrix/mutants/reverts.txt 2>/dev/null | awk 'NF {print "revert:" $1}')
fi
# `pristine` first: the unmutated tree, every row expected green, and the per-check cost
# report.ts weighs a deletion by.
for m in pristine "$@"; do
  id=${m/revert:/r-}; dir="$OUT/$id"
  [ -f "$dir/status" ] && continue
  rm -rf "$dir"; mkdir -p "$dir"; restore
  case "$m" in
    pristine) true ;;
    revert:*) git show --format= "${m#revert:}" -- 'compiler/*.vl' | git apply -R ;;
    *) git apply "scripts/kill-matrix/mutants/$m.diff" ;;
  esac || { echo apply-failed > "$dir/status"; continue; }
  git diff --stat -- compiler/ > "$dir/diffstat"
  echo "$(date +%T) $id: building"
  if ! timeout 900 bash scripts/refresh-compiler.sh > "$dir/build.log" 2>&1; then
    echo seed-build-failed > "$dir/status"; continue
  fi
  start=$(date +%s)
  KM_LOGS="$dir/logs" GATE_KEEP_LOGS=1 GATE_MAX_PAR="${GATE_MAX_PAR:-3}" bash "$GATE" --no-build > "$dir/gate.log" 2>&1
  echo "gate-rc=$? secs=$(( $(date +%s) - start ))" > "$dir/status"
  echo "$(date +%T) $id: $(cat "$dir/status")"
done
