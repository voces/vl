## Infrastructure (Track F)

- **`scripts/oracle/fuzz.sh` fails on COMPILED-BAD:** a cell whose compiled program traps, fails to load or prints a wrong value where the oracle runs now exits 1 unless `known.txt` lists it, as a new disagreement already did; `fuzz-sweep.sh`'s oracle leg keeps those cases in its artifact. The two oracle-side traps from the 2026-11-15 arith triage are listed.
