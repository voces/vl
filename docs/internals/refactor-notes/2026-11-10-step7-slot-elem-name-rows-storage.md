# Step 7 slot layer: `structIdxOfElemNameTy` is deleted, and its two callers read storage, 2026-11-10

This is family A of `2026-11-10-step7-struct-name-rungs-measured.md` (#7105). `structIdxOfElemNameTy`
(`emit_nullable_rets.vl`) keyed a struct row by an element's rendered name, else by its type. #7105
measured it against a type-only answer and found 4 programs that differ, all layout twins. This
change does not choose between name and type. It asks, at each caller, which row the emitter used to
**build the storage** the caller reads, and reads that row. Base is master `2e71e5a1` (#7107). Its
fixpoint seed is 6,610,894 bytes.

## The two callers and their storage

| caller | what it reads | the storage row |
| --- | --- | --- |
| `forInVarStructIdx`'s ref-list arm (`emit_classify.vl`) | the element of list row `rs` | `rlElemStructRow(rs)`, the row whose `sHeapIdx` the heap pass gave the list's element (`rlTwinSigOf`) |
| `variantNestedRow` (`wasmEmit.vl`, variant equality) | variant `vi`'s nested-struct field | `uFieldTgtStructIdx(vi, fj)`, the row `uFieldStorageSlot` gives the type section |

`variantNestedRow` was keyed by the flat field row alone. Its six callers on the variant-equality
path (`variantFieldComparable`, `variantFieldCodeComparable`, `emitVariantFieldEqCore{,At}`,
`emitNestedShapeEq`) now pass `vi`, which each caller already held. Its inline-shape intern
fallback stays.

## Measurement

A probe compiler (built by the base seed into scratch, never refreshed into `build/`) computed the old
answer and the storage row at both callers. It recorded an `emitFail` where they differed. The sweep
covers the whole population (`scripts/sweep.vl`, 23,862 programs):

- `variantNestedRow`: **0** programs differ.
- for-in: **1** program, `tests/cases/closures/loop-var-inline-record-handed-to-param.vl`. The name
  `{p:{x:f64},s:f64}` picks one twin and the list's storage picks the other. Both twins have **the
  same heap type**.

## Proof

- `sweep.vl diff` of base against the final fixpoint seed: **23,862 same, 0 bytes-only movers, 0 output
  movers**.
- Refresh ×2: fixpoint, 6,610,903 bytes (+9).
- Also run, all passing:
  - lint-self is clean;
  - rep-fuzz is exact;
  - seed-size, late-demands (6), dead-export, render-parse, pin-helper and plumb-shape budgets are ok;
  - cases_wasm: 7,415 passed;
  - inventory refs/rows, `vl_probe_rollback_test.ts` and `vl_scaling_shape_test.ts` pass;
  - `check-filed-witnesses --strict` on both inventories: 4,699 as filed.

The census's struct name producers drop by one (`structIdxOfElemNameTy`).
