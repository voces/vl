# Step 7, lane H: five value-union questions ask the type they already hold, 2026-11-13

After D16062 (#7783, #7789), every value-union consumer that held a type asked
`valueBoxOfTy`. Eleven `isValueUnionName` calls were left. Five of them parse a
name while the type it names is in hand:

| site                                         | the name parsed                | the type asked instead                                       |
| -------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `unionNameOfCall` (emit_classify)            | `inferRetNameOf(irk)`          | `inferRetTyIxOf(irk)`                                        |
| `asgReadNarrowTy` (emit_classify)            | `unionNameOfRead(t)`           | `identUnionTyAt(sid, fnIx, t)`, already read two lines below |
| `anonNullFieldBox` (emit_collect)            | `regUnionNameOfTy(ft)`         | `ft`                                                         |
| `registerCloResultUnion` (emit_collect)      | `arenaEmitName(rt)`            | `rt`                                                         |
| `sharedFieldArmValueBox` (emit_obj_lit_fits) | `variantFieldElemName(vi, fi)` | `uFieldElemTyIxAt(vi, fi)`, the arm field's recorded type    |

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds, D16062 PR 2 against this): 24,216
  programs, all the same. 0 bytes-only movers, 0 output movers.
- **Census:** five `ty-source-parse` sites go: emit_classify 2 → 0, emit_collect
  2 → 0, emit_obj_lit_fits 2 → 1.

## The remaining six

- **`iisPushFieldElem` ×2** (emit_shape_intern): lane A's field-element slice.
- **`isValueUnionOfSet`** (wasmEmit): the fallback for an unsliced set, which
  goes with lane G's set readers.
- **Three check-time sites** (`litUnionArrayValueUnionRetName`,
  `cloArmValueUnionRetName`, `elemRefArmValueUnionListRetName`): none runs
  during emit, so they are filed as D16063, carried past step 7 as the checker's
  render→parse.
