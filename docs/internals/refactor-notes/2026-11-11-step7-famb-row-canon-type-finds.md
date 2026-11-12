# Step 7 slot layer, family B, 8c: the type-keyed row finds and `structIndexOfExpr` answer the canonical row, 2026-11-11

This is stacked on #7214 (8b, `sRowCanonOf`: every row name answers its canonical row). That
slice mapped the rows a name answers. This one maps the rows a type answers, and the row
`structIndexOfExpr` answers. So both sides of the struct-class comparison
(`2026-11-11-step7-famb-struct-index-of-expr-graded.md`) read canonical rows. Base is #7214's
seed.

## What changed

Each answer below is passed through `sRowCanonOf`:

- `repStructRowOfTy` (`emit_shape_rows`), the rep's struct read;
- `structRowOfRecordTy`, the row of a record type;
- `structIndexOfExpr` (`emit_classify`).

Each body keeps its name with a `Go` suffix.

## Measurement

- **Candidate against #7214's seed:** 23,910 programs.
  - 23,903 are the same.
  - 7 move in module bytes only: `D627`'s witness, `d301w_second_declared_name_of_one_layout`,
    and five cases on layout twins (`map-value-layout-twin-heap-merge`,
    `map-value-twin-second-declared-name-of-one-layout`, `object-shape-identical-alias-flows`,
    `map-field-arm-shares-its-layout-twins-heap`, `arms-name-one-record-shape-twice`).
  - 0 output movers, so the 7 now build at the canonical twin.
- **`structIndexOfExpr` against the rep read** (the famb 5 probe, both seeds probed the same
  way). Counts are **programs**:

  | | #7214 | this PR |
  | --- | --- | --- |
  | any arm differs | 1,712 | 1,633 |
  | variant class | 1,203 | 1,203 |
  | struct class | 505 | 420 |
  | struct class, the row's type is the value's (`tysame`) | 164 | 81 |
  | struct class, the row's type is not the value's (`tydiff`) | 383 | 380 |

  A program can count under both struct parts.

- **Mapping only the type finds moves the disagreements around.** That intermediate candidate
  gave `ObjLit` same-type rows 18 → 101 and `Index` 30 → 11. Both sides have to be canonical.

## What is left

- **81 same-type programs** (`Call` 37, `Ident` 15 among the row disagreements). The two rows
  hold one type at different layouts, or one of them was not laid out when asked. This is the
  16-program layout census of 8a's note, plus late-laid rows.
- **380 widened builds:** famb 9. The row is the type the value is built at (the landing
  record), read as `repOf(builtTy)`.
- **The variant class, 1,203:** graded in famb 5's note.
- **The mints still mint the twin.** `litIdRowOfSameTy` goes when the literal build answers
  the canonical row.

## Proof

- Refresh is at 6,622,719 bytes.
- `regress.vl`: no runs lost.
- `cases_wasm_*`: 7,440 passed.
- `vl_check_codegen` and `vl_scaling_shape`: pass.
- `lint-self` and its budgets: clean. The dead-export budget: ok.
- Seed size: +0.5% on its baseline.
- The `sweep` label re-proves the population. Expected movers: the 7 bytes-only programs above.
