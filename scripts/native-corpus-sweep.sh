#!/usr/bin/env bash
# Native corpus sweep — the ground-truth counterpart of the TS harness's corpus
# tiers: every `// @run` file under tests/cases is checked + run through the
# NATIVE pipeline (`vl check` / `vl run` against the self-hosted compiler seed),
# stdout diffed against the file's ordered `// @log` directives. Buckets land in
# /tmp/sweep-{pass,checkfail,runfail,logdiff}.txt for triage.
#
# PARALLEL: files fan out over `JOBS` workers (default: every core) via xargs;
# each worker classifies one file and appends a single `BUCKET\tfile` line to a
# shared results file (O_APPEND single-line writes are atomic). ~24x wall-clock
# over the old serial loop on a 24-core box; buckets/summary are byte-identical
# (sorted) to the serial output.
#
# NOTE: matches files containing the literal `// @run` ANYWHERE — two soundness
# @check files mention `// @run` in prose comments and show up as CHECKFAIL noise
# (xfail-elseif-chain-residual, xfail-seq-guard-residual-codegen); read the
# directive line before chasing them.
#
# Prereqs: scripts/vl-host built (cargo build --release) and a fresh seed
# (bash scripts/refresh-compiler.sh).
set -uo pipefail
cd "$(dirname "$0")/.."

export VL="${VL:-scripts/vl-host/target/release/vl}"
export SEED="${SEED:-build/vl-compiler.wasm}"
JOBS="${JOBS:-$(nproc)}"

RESULTS="$(mktemp)"
trap 'rm -f "$RESULTS"' EXIT
export RESULTS

classify() {
  f="$1"
  if ! "$VL" check "$f" --compiler "$SEED" >/dev/null 2>&1; then
    echo "CHECKFAIL	$f" >> "$RESULTS"; return
  fi
  expected=$(sed -n 's|^// @log ||p' "$f")
  if ! actual=$("$VL" run "$f" --compiler "$SEED" 2>/dev/null); then
    echo "RUNFAIL	$f" >> "$RESULTS"; return
  fi
  if [ "$actual" == "$expected" ]; then
    echo "PASS	$f" >> "$RESULTS"
  else
    echo "LOGDIFF	$f" >> "$RESULTS"
  fi
}
export -f classify

grep -rl '// @run' tests/cases --include='*.vl' | sort |
  xargs -P "$JOBS" -n 1 bash -c 'classify "$1"' _

for b in pass checkfail runfail logdiff; do : > "/tmp/sweep-$b.txt"; done
sort -k2 "$RESULTS" | while IFS=$'\t' read -r bucket f; do
  case "$bucket" in
    PASS) echo "$f" >> /tmp/sweep-pass.txt ;;
    CHECKFAIL) echo "$f" >> /tmp/sweep-checkfail.txt ;;
    RUNFAIL) echo "$f" >> /tmp/sweep-runfail.txt ;;
    LOGDIFF) echo "$f" >> /tmp/sweep-logdiff.txt ;;
  esac
done
pass=$(wc -l < /tmp/sweep-pass.txt)
checkfail=$(wc -l < /tmp/sweep-checkfail.txt)
runfail=$(wc -l < /tmp/sweep-runfail.txt)
logdiff=$(wc -l < /tmp/sweep-logdiff.txt)
echo "PASS=$pass CHECKFAIL=$checkfail RUNFAIL=$runfail LOGDIFF=$logdiff TOTAL=$((pass+checkfail+runfail+logdiff))"
