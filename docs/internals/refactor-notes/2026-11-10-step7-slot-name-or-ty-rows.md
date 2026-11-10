# Step 7 slot layer: `structRowOfNameOrTy` is deleted, 2026-11-10

This is family C of `2026-11-10-step7-struct-name-rungs-measured.md` (#7105). `structRowOfNameOrTy`
(`emit_shape_rows.vl`) answered a declared struct by name, else the row of the type's non-null
part. #7105 found 13 programs where a type-only answer differs. All 13 are layout twins. Base is
master `163c7e61` (#7113). Its fixpoint seed is 6,613,513 bytes.

## The callers and the row each needs

| caller | what it decides | row now |
| --- | --- | --- |
| `promoteLitFieldToAtom`, `demoteLitFieldToString` (`emit_collect.vl`) | which struct row's field code moves with arm `vi`'s | `variantStructHeapTwinAt(vi)`: the row sharing the arm's heap type, which is the one whose layout must agree |
| the map-value slot interner (`emit_union_atoms.vl`, `MVK_STRUCT`) | the struct row a record-valued slot stores | `structRowOfRecordTy(nonNullTy(ty))`: the canonical type's row, under the one-row-per-canonical-type ruling (#7009) |

## Measurement

A probe compiler was built by the base seed into scratch and never refreshed into `build/`. It
compared the old answer with the new one at each caller. The sweep covered the whole population
(`scripts/sweep.vl`, 23,866 programs):

- **Literal-field callers: 0 programs differ.** The heap twin is the row the name answered.
- **Map-value slot: 13 programs differ, every one with both answers ≥ 0.** These are the spelled
  `{r:{[string]:i32}}` (8), `{r:{[string]:{n:i32}}}` (2) and `{r:i32}` (2) value rows, and one more
  `{r:{[string]:i32}}` at a third row. The name picks the row interned under the spelling, and the
  type picks the canonical one.

## The price, measured

`sweep.vl diff` of base against the candidate's fixpoint seed: 23,862 same, **4 bytes-only movers**,
0 output movers, 0 `runs → not-runs`, 0 new compiler traps. The movers are:

- `tests/cases/maps/map-value-layout-twin-heap-merge.vl`;
- `tests/cases/unions/struct-holding-arm-with-record-map-value.vl`;
- the `D627` and `D15098` witnesses.

Each was disassembled under both seeds (`wasm-dis`). The comparison found:

- the same module size;
- the same type count;
- the same multiset of type definitions;
- function bodies identical once type indices are erased.

**The type section is permuted, nothing else.** The slot's row is now asked earlier in mint order,
so its struct takes a different index.

## Proof

- Refresh ×2 is a fixpoint at 6,613,294 bytes (−219).
- lint-self is clean and rep-fuzz is exact.
- The seed-size, late-demands (6), dead-export, render-parse, pin-helper and plumb-shape budgets are
  ok.
- cases_wasm passes (7,418).
- The inventory refs/rows tests, `vl_probe_rollback_test.ts` and `vl_scaling_shape_test.ts` pass.
- `check-filed-witnesses --strict` on both inventories: 4,700 as filed, 0 moved.

Family B (`structRowOfNameTy`, 381 programs) remains in the struct bank. Its name carries the
declaration fact "declared as an arm", which the type does not carry yet (#7105).
