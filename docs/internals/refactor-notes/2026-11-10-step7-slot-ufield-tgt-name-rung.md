# Step 7 slot layer: `uFieldTgtStructIdx`'s name rung is deleted, 2026-11-10

This is the variant twin of `2026-11-10-step7-slot-sfield-tgt-name-rung.md` (#7111).
`uFieldTgtStructIdx` (`emit_shape_rows.vl`) is the struct row of a variant's nested-struct field.
The type section reads it through `uFieldStorageSlot`. It had four rungs:

1. the row recording the field's element type;
2. the row its name keys;
3. the arm heap twin (`armFieldStructRow`);
4. a mint.

Base is master `163c7e61` (#7113), whose fixpoint seed is 6,613,513 bytes.

## Measurement

A probe compiler was built by the base seed into scratch and never refreshed into `build/`. Each of
rungs 2–4 recorded an `emitFail` when it answered. Each recording carried the field type's
canonical row (`repRowOfTyStruct`) beside it. The sweep covered the whole population
(`scripts/sweep.vl`, 23,866 programs):

| rung that answered | programs | canonical row |
| --- | --- | --- |
| name | 28 | the name's row in all 28 (the element type is given, and the row's own type maps back to it) |
| arm twin | 9 | the twin's row in all 9 |
| mint | 1 | answers, before the mint |

## The change

After the type rung, `uFieldTgtStructIdx` now asks the canonical row, as `sFieldTgtStructIdx` does
since #7111. The name rung is deleted. The arm-twin rung and the mint stay for a field the type
section reaches before its row exists.

A probe on the candidate recorded an `emitFail` where the name would answer after both type rungs
miss. It fires in **0 of 23,866** programs.

## Proof

- **Sweep.** `sweep.vl diff` of base against the candidate: **23,866 same, 0 bytes-only movers, 0
  output movers**. That includes the one program where the canonical row now answers before the
  mint.
- **Refresh ×2.** Fixpoint, 6,613,522 bytes (+9).
- **Lint and fuzz.** lint-self is clean; rep-fuzz is exact.
- **Budgets.** seed-size, late-demands (6), dead-export, render-parse, pin-helper and plumb-shape are
  ok.
- **Tests.** cases_wasm passes 7,418. The inventory refs/rows tests, `vl_probe_rollback_test.ts` and
  `vl_scaling_shape_test.ts` pass.
- **Witnesses.** `check-filed-witnesses --strict` on both inventories: 4,700 as filed.
