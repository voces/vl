# IR: a map is a value rep (2026-11-19)

The builder's `valueRep` admitted scalars, atoms, boxes, records, closures and the nullable
niches, but not a map. So every function with a map parameter, a map local or a map result fell
back whole (`parameter rep map`, `local rep map`, `result rep map`, and `rep map` for a map-typed
expression), even where it only handed the map on.

## The change
- `valueRep` admits `RMap`. A map is a reference whose local run is the one legacy declares, so
  the lowering's frame check (`runAgrees`) needs nothing new, and reps compare as the arena
  shares them: every key kind stores in one `$mapStruct` family, keyed by the value's rep.
- The map operations still take a module global receiver only. A function that reads, tests or
  stores through a local or parameter map now misses on that operation (`map read receiver`,
  `map has receiver`, `map store receiver`) instead of on the variable's rep.

## Measured on fixpoint seeds: master `f4b395101` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed | 14,923 | 15,031 |
| self-compile `rep map`, alone | 162 | 0 |
| distilled functions claimed (`--claims`), all matched armed | 35,258 | 35,468 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,514 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 100,742,158,013 → 100,767,208,682 (+0.025%).
- **Lines:** +1 in `compiler/`. A coverage step: 108 self-compile and 210 distilled functions.

## What is left
- A map operation on a local or parameter receiver: on the self-compile, `map store receiver` 49
  alone, `map read receiver` 36 and `map has receiver` 24. The next step makes the receiver an
  operand, so a global and a local receiver lower through one path.
