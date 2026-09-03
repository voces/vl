#!/usr/bin/env bash
# EXACT count + argv of every `vl` subprocess the ci-native step launches.
# The tests hard-code `$ROOT/scripts/vl-host/target/release/vl`, and in a
# worktree that `target` is a SYMLINK into the main repo — so this replaces the
# WORKTREE's symlink with a real dir whose `release/vl` logs and execs the shared
# binary, then restores it. The shared binary is never written.
#   scripts/perf/count-vl-spawns.sh <outdir>
set -u
cd "$(dirname "$0")/../.."
OUT="${1:?usage: count-vl-spawns.sh <outdir>}"; mkdir -p "$OUT"
LINK=scripts/vl-host/target
[ -L "$LINK" ] || { echo "$LINK is not a symlink — refusing" >&2; exit 1; }
REAL=$(readlink -f "$LINK")
LOG="$(cd "$OUT" && pwd)/spawns.tsv"; : > "$LOG"
restore() { rm -rf "$LINK"; ln -sfn "$REAL" "$LINK"; }
trap restore EXIT
rm "$LINK"; mkdir -p "$LINK/release"
{ echo '#!/bin/bash'
  echo "s=\$(date +%s.%N)"
  echo "\"$REAL/release/vl\" \"\$@\"; rc=\$?"
  echo "printf '%s\t%s\t%s\n' \"\$(echo \"\$(date +%s.%N) - \$s\" | bc)\" \"\$rc\" \"\$*\" >> '$LOG'"
  echo 'exit $rc'; } > "$LINK/release/vl"
chmod +x "$LINK/release/vl"
export VL_STD="$PWD/std" SELFHOST_NATIVE_ALIGN=1
/usr/bin/time -f "spawn-instrumented\twall=%e\tuser=%U\tsys=%S" -o "$OUT/step.time" \
  deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts \
  > "$OUT/step.log" 2>&1
cat "$OUT/step.time"
awk -F'\t' '{n++; t+=$1} END{printf "vl spawns: %d   summed child wall: %.1fs   mean %.0f ms\n", n, t, 1000*t/n}' "$LOG"
echo "--- by subcommand"
awk -F'\t' '{split($3,a," "); c[a[1]]++; s[a[1]]+=$1}
  END{for (k in c) printf "%8d  %8.1fs  %s\n", c[k], s[k], k}' "$LOG" | sort -rn
