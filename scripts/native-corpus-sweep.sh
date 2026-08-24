#!/usr/bin/env bash
# Native corpus sweep — the ground-truth counterpart of the TS harness's corpus
# tiers: every `// @run` file under tests/cases is checked + run through the
# NATIVE pipeline (`vl check` / `vl run` against the self-hosted compiler seed),
# stdout diffed against the file's ordered `// @log` directives. Buckets land in
# /tmp/sweep-{pass,checkfail,runfail,logdiff}.txt for triage.
#
# PARALLEL: files fan out over `JOBS` workers (default: every core) via xargs;
# each worker classifies one file and appends a single `BUCKET\tfile` line to a
# shared results file (O_APPEND single-line writes are atomic). Wall-clock scales
# roughly with core count; the results file is sorted before bucketing, so the
# buckets and summary are deterministic regardless of worker scheduling.
#
# NOTE: matches files containing the literal `// @run` ANYWHERE — ONE soundness
# @check file mentions `// @run` in a prose comment and shows up as CHECKFAIL noise
# (xfail-false-reject-seq-guard-residual); read the directive line before chasing it.
# Its former neighbour (xfail-false-reject-elseif-chain-residual) is gone: that gap
# closed and the file is a genuine `@run` case now, so the expected count is 1, not 2.
#
# Prereqs: scripts/vl-host built (cargo build --release) and a fresh seed
# (bash scripts/refresh-compiler.sh).
set -uo pipefail
cd "$(dirname "$0")/.."

export VL="${VL:-scripts/vl-host/target/release/vl}"
export SEED="${SEED:-build/vl-compiler.wasm}"
# Pin the std dir to THIS tree: agent worktrees symlink the cargo target into
# the main checkout, so the binary's exe-relative std/ fallback (resolved via
# /proc/self/exe, which follows symlinks) would point at the wrong checkout
# there. $VL_STD is the first hit in the host's std-dir resolution.
export VL_STD="${VL_STD:-$PWD/std}"
JOBS="${JOBS:-$(nproc)}"

RESULTS="$(mktemp)"
trap 'rm -f "$RESULTS"' EXIT
export RESULTS

classify() {
  f="$1"
  if ! "$VL" check "$f" --compiler "$SEED" >/dev/null 2>&1; then
    echo "CHECKFAIL	$f" >> "$RESULTS"; return
  fi
  # Leading whitespace is STRIPPED before matching, because the TS harness does
  # `raw.trim()` before it looks for `//` (tests/cases_wasm_test.ts) — so a fixture
  # may put its `@log` directives INLINE and INDENTED next to the code they describe,
  # and many do. Anchoring this to column 0 made every such file look like a runtime
  # mismatch: the sweep read only the unindented subset as "expected" and diffed it
  # against the program's FULL stdout. Four corpus files bucketed LOGDIFF for exactly
  # that reason with nothing wrong with them. The two directive parsers must agree.
  expected=$(sed -n 's|^[[:space:]]*// @log ||p' "$f")
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
