# Step 7 L2 §7: the four name-keyed ref-list producers, measured; the frame-leaf row asks the type, 2026-11-11

`2026-11-11-step7-closing-census-2.md` lists four ref-list producers that find or mint a row by name:
`calleeAnnRetRefListSlot`, `rlRowOfNameMinted`, `rlSlotByName` and `rlSlotByNameK`. This PR converts
the one caller that holds a type, and names the rest as floors. Base is master `1d517770`. Counts
are **programs** over the sweep's 23,885.

## The callers

| producer and caller | what keys it | after this PR |
| --- | --- | --- |
| `collectFrameLeafRow`, `rlSlotByName(pn)` with `pn` one of `string[]`, `f64[]`, `i64[]` | the frame's leaf spelling | **the type**: the lead inner literal's type in that frame (`litRepTyAt(arrLitLeadInner(a), fnIx)`), through `rlSlotOfTy`, and the mint passes it |
| `rlRowOfNameMinted`, the template-field mint | a field whose element is a type parameter | floor: there is no type |
| `sFieldRefSlot`'s untyped arm (`rlNameMint`, then `rlSlotByName`) | the same template field | floor: there is no type |
| `rlSlotByNameK` | the body of `rlSlotByName` | stays for the two floors above |
| `calleeAnnRetRefListSlot` | the callee *function's* identifier, resolved in scope, then the row banked on its return annotation (`annBareRefArrSlot`) | floor by kind: a symbol lookup, not a type spelling. No row is found by a rendered name. Unchanged, as `2026-11-11-step7-slot-variant-name-rows.md` rules |

## Measured

The probe was an `emitFail` at `collectFrameLeafRow` comparing the name key with the type key. The
first type tried was the outer literal's stamp (`litRepTyAt(ix, fnIx)`). It agreed in 95 programs
and differed in 10 (nullable lists, `f32[]`, unions): it answers the outer list, while the name comes
from the inner literal's leaf. With the lead inner literal's own frame type, the keys agree in 102
programs and differ in 3. Two are `f64[]` named over an `f32[]` type, and one is `string[]` over
`(boolean | string)[]`. Those 3 and 17 sampled agreeing programs build byte-identical wasm against
the base seed, with the same output.

## Proof

- One refresh, at 6,621,959 bytes.
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse, seed-size, late-demands, rep-fuzz (exact), `cases_wasm`,
  `vl_check_codegen` and `vl_scaling_shape`.
- The full population is graded by CI's Sweep job.
