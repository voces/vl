## Testing

- **The self-compile's IR misses are a ratchet.** `vl run scripts/self-ir-misses.vl -- --check` checks `compiler/entry.vl` once under the blocker census and fails when the functions the IR misses rise above `scripts/self-ir-misses-baseline.txt` (0); `--write-baseline` only lowers it. A `gate.sh` row (`self ir misses`, ~61 CPU-s) runs it, so a compiler feature the IR does not cover reds instead of reopening I8's strictest population.
