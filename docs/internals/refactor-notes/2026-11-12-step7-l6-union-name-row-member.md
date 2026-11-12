# Step 7 L6: a member read of a variant field hands back its element union's row, 2026-11-12

This is step B, part 4, of the `unNames` spelling readers. Part 3's census found the member
rung answering with no row in 2,027 programs. In 105 of them the read's node type keyed another
row than its name. A probe tagged each `memberUnionFieldName` and `armFieldUnionName` return by
its path, and compared the field's recorded element type's row against the name's row
(`unMemRowOfName`).

| path | programs | agree | differ |
| --- | --- | --- | --- |
| narrowed variant field, or declared or nullable arm | 668 | 668 | 0 |
| struct field | 1,209 | 1,207 | 2 |
| read narrowed to a box (`memReadBoxNarrowName`) | 291 | — | — |

The node-type disagreements were the narrowed reads, whose name is the read's own box rather
than the field's. Those record no row. The two struct-field disagreements are shared boxes by
design: `unions/record-arms-same-field-over-field.vl` (D4056) and
`unions/shared-nullable-scalar-field-read.vl` (D13280). Every record of the union stores the
field in one box, and the field's recorded name is that shared box, not the field type's own
row. Both run and print as expected, so neither is a defect.

## Changed

- `memVariantFieldName` records the row a variant field's element type keys to. Every variant
  return in `memberUnionFieldName` and `armFieldUnionName` names through it.
- `memberUnionFieldNameRead` saves and restores that slot per read, as `unionNameOfExpr` does,
  and the hub's `Member` arm records the completed read's row. Both slots are cleared per program.
- A struct field records none until the struct row says whether a field is a shared box.

In part 3, a row came back at `unionArmAtomsOfExpr` in 1,240 of 2,747 programs. It now comes back
in 1,810. The only rows that differ from the name's are the 7 member-order twins already named.

`monoTyParamOf` stays with `monoSubstAnn` behind the `gaeApplyFieldTy` floor: `monoSubstAnn`
calls it.

The base is master `fbe3d45b`, with a fixpoint seed on both sides. The population is the whole
sweep, 24,010 programs.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 24,010 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** `emitter-state-audit --check` is clean. `rep-fuzz-check.sh` is exact. `cases_wasm`
  passes 7,487 with 0 failed. lint-self is clean. The export budget, with findings, has 0 dead
  exports. Render-parse is flat at 13 renders and 55 parses.
