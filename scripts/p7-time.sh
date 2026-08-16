#!/usr/bin/env bash
# Interleaved min-of-N timer over prebuilt .wasm modules — the general A/B rig.
#   p7-time.sh <reps> <mod.wasm> [mod2.wasm ...]
# Reports MIN and MEDIAN of (user+sys) CPU MILLISECONDS, which is far less
# contention-sensitive than wall clock on this shared box, plus min wall.
# Asserts every module's stdout is identical before timing.
#
# CPU time is the load-bearing choice, not an incidental one. `bench/README.md`
# records this box swinging up to 2.5x under contention even with `taskset`, so a
# wall-clock A/B cannot separate a real regression from a busy neighbour — the same
# ambiguity that makes a wall-clock ratio unusable as a gate. Interleaving the
# modules within a rep spreads any drift across both sides rather than one.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VL="$ROOT/scripts/vl-host/target/release/vl"
PIN="${P7_PIN:-taskset -c 2-5}"
REPS="$1"; shift
MODS=("$@")
TMP="$(mktemp -d)"
TIMEFORMAT='%3R %3U %3S'
REF=""
for m in "${MODS[@]}"; do
  o="$($PIN "$VL" run "$m" 2>/dev/null)"
  if [ -z "$REF" ]; then REF="$o"; elif [ "$o" != "$REF" ]; then echo "OUTPUT-MISMATCH: $m"; fi
  : > "$TMP/$(basename "$m").cpu"
  : > "$TMP/$(basename "$m").wall"
done
echo "  output-equality checked across ${#MODS[@]} modules" >&2
for ((r=0;r<REPS;r++)); do
  for m in "${MODS[@]}"; do
    b="$(basename "$m")"
    { time $PIN "$VL" run "$m" >/dev/null 2>/dev/null ; } 2> "$TMP/t"
    awk '{printf "%d\n", ($2+$3)*1000; printf "%d\n", $1*1000 > "'"$TMP/w1"'"}' "$TMP/t" >> "$TMP/$b.cpu"
    cat "$TMP/w1" >> "$TMP/$b.wall"
  done
  echo "  rep $((r+1))/$REPS  load=$(cut -d' ' -f1 /proc/loadavg)" >&2
done
for m in "${MODS[@]}"; do
  b="$(basename "$m")"
  sort -n "$TMP/$b.cpu" > "$TMP/s"; c=$(wc -l < "$TMP/s")
  cmin=$(head -1 "$TMP/s"); cmed=$(sed -n "$(( (c+1)/2 ))p" "$TMP/s")
  wmin=$(sort -n "$TMP/$b.wall" | head -1)
  echo "$b cpu_min=${cmin}ms cpu_med=${cmed}ms wall_min=${wmin}ms  cpu=[$(tr '\n' ' ' < "$TMP/$b.cpu")]"
done
echo "load: $(cut -d' ' -f1-3 /proc/loadavg)"
rm -rf "$TMP"
