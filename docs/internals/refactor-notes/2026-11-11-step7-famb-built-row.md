# Step 7 slot layer, family B, 9a: a read of a value built at a wider record answers that record's row, 2026-11-11

This is stacked on #7226 (8c). The struct class of
`2026-11-11-step7-famb-struct-index-of-expr-graded.md` has a widened part (`tydiff`): the row a
value is stored at holds another record type than the value's own. D14512 is the shape:
`const wideJ: J = mk()` builds `mk`'s record at `J`, and a later `c = mk()` reads `{ f: i32 }`
while its storage is `J`'s row. The record the value is built at is a checker fact,
`callBuiltTy` (`check_store_rep`). This slice reads it.

## What changed

`structIndexOfRep` (`emit_classify`) is the rep's row of a node, which `structIndexOfExpr`'s
storage readers fall back to. For an `Ident` or `Call` read whose rep is a struct, it now answers
the row of the record `callBuiltTy` says the value is built at, when that record is not the
value's own type. It answers through `repStructRowOfTy`, so the row is canonical (8c).

## Measurement

- **Candidate against #7226's seed:** all 23,910 programs are the same, module bytes included.
- **`structIndexOfExpr` against the rep read** (the famb 5 probe on both seeds). Counts are
  **programs**:

  | | #7226 | this PR |
  | --- | --- | --- |
  | any arm differs | 1,633 | 1,567 |
  | struct class | 420 | 353 |
  | struct class, `tydiff` (widened) | 380 | 325 |
  | struct class, `tysame` | 81 | 31 |
  | variant class | 1,203 | 1,203 |

  `Call` rows fall the most: same-type 37 → 3, widened 32 → 1.
- **Index and Member reads gain nothing** when given the same read. `callBuiltTy` answers no
  record for them, so the condition names only `Ident` and `Call`.

## What is left of the struct class

353 programs. The largest parts, by arm and class:

- `Ident` widened, where the rep answers no row: 106. The read's store type has no struct row
  of its own, though its storage was built at a wider one.
- `Index` widened, no rep row: 89. An element read: `callBuiltTy` does not follow a container
  read to its elements' build.
- `Ident` widened, another row: 54.
- `Member` widened, no rep row: 44. A field read of a record built at a wider one.

These want the store column read as `repOf(storedTy)` for elements and fields. That is the
record that replaces the storage reader (`2026-11-11-step7-famb-struct-index-of-expr-graded.md`).

## Proof

- Refresh is at 6,623,897 bytes. It is byte-identical to the swept candidate.
- `regress.vl`: no runs lost.
- `cases_wasm_*`: 7,440 passed.
- `vl_check_codegen` and `vl_scaling_shape`: pass.
- `lint-self` and its budgets: clean. The dead-export budget: ok.
- Seed size: +0.5% on its baseline.
- The `sweep` label re-proves the population. Expected movers: none.
