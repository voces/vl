## Codegen, memory & runtime (Track B)

- **I8 red list as a script:** `scripts/ir-i8-census/red.sh` joins `census.sh` and `ir-i8-sweep.sh keep` into the per-program, per-unit red list (pop, program, first stub, unit, class, owner) with a summary line and deltas against a previous list; `owners.tsv` is the owner registry by class. It reproduces regen-9 (530 programs, 703 units, 192 classes) byte for byte.
