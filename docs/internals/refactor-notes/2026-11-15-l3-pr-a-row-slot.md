# L3 PR A: the record-width rewrite gives a record parameter a bound row slot

Owner ruling L3, option A (a record-typed parameter is specialised per concrete row), design (1)
(an implicit row variable `R` bounded by `P`), built lazily (option C of the coordinator's call,
2026-11-15).

## Change

- **The slot.** D3992's rewrite (`check_width.vl`) re-checked `f(p: P)` as `f<__W0>(p: __W0)`.
  It now spells the type parameter `__R<decl>_<k>__<P>` (`rowParamName`, new
  `check_row_param.vl`). Where the slot is minted, `fnDeclPushTyParams` and the annotation
  resolver call `rowParamBind`. It reads the record off the name and records it with lane H's
  `tvSlotSet` (moved here with its first caller), printed as `P`. The name carries the record, so a
  resumed check of a rewritten tree re-derives the bound with no table to keep.
- **The hold.** A call into a rewritten parameter is still held to `P`. `callFtyArgAssign` reads
  `rowSlotBound` beside `wsOrigTyOf`, and a member call's receiver is held the same way at
  `ufcsCheckRecvSeam`.
- **UFCS.** The receiver seam notes a width candidate at the callee's declaration
  (`wsCandidateAt` / `wsNotePendingAt`, the declaration-keyed core of `wsCandidate` /
  `wsNotePending`), and the candidate rule no longer excludes `self`.
- **Inferred returns.** The rule no longer requires an un-annotated return to be a primitive, or a
  declared one not to name the record. An instance that refuses its row still undoes the rewrite.
  `wsInferredRetPrim` is deleted, and so is `wsVarTy`'s `__W` prefix test (it now reads the slot
  name).

## Measured

MEASURED_TABLE

## What eager desugaring showed (not shipped)

The first attempt desugared every declared record parameter before the first check pass, so a
function called only at `P` would be one instance at `R := P`.
- On hand programs it ran every position.
- It did not self-build the compiler. Four checker paths read a type-variable receiver as an
  open hole: `placeFieldTy`, `writesHoleField`, `objTysMayAlias`, and the receiver-overload pick.
- After those were patched, write-effect summaries went opaque. Calls in a desugared body resolved
  into callees whose bodies were not yet checked, ~60 low-level helpers reached through `tErr`.
- `progCheckCalleeFirst` orders a body's direct callees correctly (instrumented: every one is
  `done`), so no ordering fix applies. The closure the summaries walk changes with it.

Binding `p` at `P` inside the body, with only the signature generic, gave invalid wasm at the wide
instance: a template node typed at the closed `P` keeps `P` in every instance (`nodeTyInOf`), so
no conversion is built. `R` has to reach the body.

## Still refused

| position | row | where it goes |
| --- | --- | --- |
| `generic_fwd` (both faces), `hole_fwd` | D16219 | A2: the parameter-position column on the pin's argument row |
| `lambda_param` | D16380 | A2: note the lambda a binding holds |
| `returned` at a declared `: P` | D16381 | A2 decides: keep the row in the result, or a storage position |
| `nested_field` | D16382 | the storage view |

## The named set (`l3-record-param-width`)

The 8 un-annotated cells of `record-param-width-before` that the rewrite carries. An earlier
ablation, with the rewrite applied but never written, left 5 of them check-clean invalid wasm.
None is silent on master or after this PR: all 8 run, with the same output on both seeds. The set
pins them: with the candidate test disabled, `regress.vl` blocks on 3 of them (`loop`,
`two_rows`, `nine_rows`, runs → loud check reject), and no other corpus cell moves.

## Size

NET_LINES net compiler lines; pin-helper delta 0 (`emit_mono.vl` untouched).
