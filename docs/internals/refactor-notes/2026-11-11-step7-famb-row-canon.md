# Step 7 slot layer, family B, 8b: every struct row name answers its canonical row, 2026-11-11

This follows #7191 (8a, two same-shape declarations answer one row) and replaces its mechanism.
8a mapped only declared rows, in one pass at the end of `collectS`. This slice maps every row a
name answers, so declared, spelled-shape and `#anonN` rows all answer one row per canonical
record type and layout. Base is master `d9031606`, with #7191 merged.

## What changed

- **`sRowCanonOf(r)` (`emit_atom_kinds`)** is the first row that holds row `r`'s canonical
  record type at an identical layout (`sRowsTwin`), else `r` itself.
  - The layout is the field names in order, the field codes (`sFieldTypeAt`) and the element
    names.
  - The type is the row's own record type: an `#anonN` row's `sAnonOwnTy`, where its recorded
    `sTyIx` is a hole's context (D2762), else its `sTyIx`.
  - A reference row, or a row whose field rows are not all stored, answers itself.
- **`structIndexByName`** answers `sRowCanonOf` of the row the name was minted at.
- **8a's `declTwinRowsCanon` and `sNameCanon` are deleted.** The general map subsumes them.
- **The cost is bounded:** the answer is memoised per row. Candidates come from a bucket of rows
  keyed by field names, which a re-lay of a row's codes leaves alone. A row not laid out when
  first passed joins its bucket once it is.

## Two findings on the way

- **An `#anonN` row's `sTyIx` is not its type.** The first candidate compared `sTyIx`. It merged
  `{f: true}`'s row into `{f: 3}`'s: both recorded the hole context's type, and `boolean` and
  `i32` share field code 0. `tests/cases/closures/hole-closure-reads-param-field-per-pin.vl`
  then failed to validate. Reading `sAnonOwnTy` fixes it. This is the split w311 measured at the
  map-value mint (`sTyIx` against `anonRowTyOfName`, 80 `#anonN` programs).
- **A scan over every earlier row fails the scaling gate.** It took 6.5× fuel on "nested inline
  record types across functions" (`tests/vl_scaling_shape_test.ts`, bar 6). The bucket index
  passes.

## Measurement

- **The map answers a different row** in 239 programs, against 8a's 149. By the name asked and
  the row answered:

  | name asked → row answered | programs |
  | --- | --- |
  | declared → declared | 149 |
  | `#anon` → `#anon` | 46 |
  | declared → spelled | 28 |
  | spelled → declared | 8 |
  | spelled → `#anon` | 5 |
  | declared → `#anon` | 5 |

- **Candidate against a seed built from the same master:** all 23,909 programs are the same,
  module bytes included.

## What is left

- **Rows answered by a type, not a name, are not mapped yet:** `repStructRowOfTy`,
  `wholeShapeRowOf`, `structRowRecordingTy` and the shape scans. Mapping their answers is
  the next slice. It is the read `structIndexOfExpr`'s struct class compares against.
- **The mints still mint the twin row.** Answering the canonical row at the six mint sites
  (`collectS`, `#anon` literals, three in `emit_shape_intern`, `#ref` rows) comes after every
  reader maps.
- **`litIdRowOfSameTy` (#7171)** is a site-local instance of this map. It is deleted in the slice
  that maps the literal build, with D15701's fixture kept running.

## Proof

- Refresh is at 6,622,731 bytes.
- `regress.vl`: no runs lost.
- `cases_wasm_*`: 7,440 passed.
- `vl_check_codegen` and `vl_scaling_shape`: pass.
- `lint-self` and its budgets: clean. The dead-export budget: ok.
- Seed size: +0.5% on its baseline.
- `self-compile-time.sh`: ok. L2 fuel is 82.45e9, +17.2% on its baseline and under its 1.5×
  trip. This lane did not measure master's own reading.
- The `sweep` label re-proves the population. Expected movers: none.
