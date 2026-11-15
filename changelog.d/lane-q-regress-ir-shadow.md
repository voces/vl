## Infrastructure (Track F)

- **`scripts/silent-sweep/distilled/ir-shadow.vl`:** the IR shadow summed over every distilled
  cell, in about 15 s. It exits 1 on a verifier failure or on a mismatch class above
  `ir-shadow-baseline.txt`, and `--write-baseline` records the counts. It is not in `gate.sh`
  yet. `vl check --codegen` now prints the `[ir]` rows `vl build` prints.
