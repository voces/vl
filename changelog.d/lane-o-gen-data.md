## Infrastructure (Track F)

- **The oracle gains a data generator:** `scripts/oracle/gen_data.ts` (`fuzz.sh --gen data`, and `--gen all` in fuzz-sweep's `oracle` leg) generates records, lists, maps, closures, loops, strings and evaluation-order probes. 10,000 programs all build, run and agree with the oracle; the sweep fixed the oracle's own plain-assignment order (place before value, E10.1) and its trailing-empty-line reading.
