#!/usr/bin/env bash
# Native corpus sweep — the ground-truth counterpart of the TS harness's corpus
# tiers: every `// @run` file under tests/cases is checked + run through the
# NATIVE pipeline (`vl check` / `vl run` against the self-hosted compiler seed),
# stdout diffed against the file's ordered `// @log` directives. Buckets land in
# /tmp/sweep-{pass,checkfail,runfail,logdiff}.txt for triage.
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

VL="${VL:-scripts/vl-host/target/release/vl}"
SEED="${SEED:-build/vl-compiler.wasm}"
pass=0; checkfail=0; runfail=0; logdiff=0
: > /tmp/sweep-pass.txt; : > /tmp/sweep-checkfail.txt
: > /tmp/sweep-runfail.txt; : > /tmp/sweep-logdiff.txt
for f in $(grep -rl '// @run' tests/cases --include='*.vl' | sort); do
  if ! "$VL" check "$f" --compiler "$SEED" >/dev/null 2>&1; then
    checkfail=$((checkfail+1)); echo "$f" >> /tmp/sweep-checkfail.txt; continue
  fi
  expected=$(sed -n 's|^// @log ||p' "$f")
  actual=$("$VL" run "$f" --compiler "$SEED" 2>/dev/null)
  if [ $? -ne 0 ]; then
    runfail=$((runfail+1)); echo "$f" >> /tmp/sweep-runfail.txt; continue
  fi
  if [ "$actual" == "$expected" ]; then
    pass=$((pass+1)); echo "$f" >> /tmp/sweep-pass.txt
  else
    logdiff=$((logdiff+1)); echo "$f" >> /tmp/sweep-logdiff.txt
  fi
done
echo "PASS=$pass CHECKFAIL=$checkfail RUNFAIL=$runfail LOGDIFF=$logdiff TOTAL=$((pass+checkfail+runfail+logdiff))"
