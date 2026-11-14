# L3, the parameter half: a record-typed parameter specialised per concrete row — design

Owner ruling L3, option A (`engineering-review-2026-11.md` §6). Design only; no compiler change.
Measured against master `27a6484a0`, fixpoint seed.

## Baseline (`record-param-width-{before,between,after}.matrix.vl`, new, 15 cells × 2 faces)

| extra field sorts | runs | not running |
| --- | --- | --- |
| after (a prefix) | 30 / 30 | — |
| before | 21 / 30 | 7 annotated-face refusals, `generic_fwd` in both faces, `lambda_param` un-annotated a compiler trap (D16215) |
| between | 21 / 30 | the same 9 |

The refused cells (annotated face: the value's binding spells its own wide type) are `ufcs`,
`generic_fwd`, `hole_fwd`, `nested_field`, `returned`, `returned_inferred` and `lambda_param`.
Each is `objShapeDropUnsupportedErr` (`check_fit_rules.vl`), the "type-valid (structural width
subtyping) but not yet supported by codegen" sentence. No emit-side site concedes type-validity
here (`emit-refusal-sites.vl`: 20 conceding sites, none about record width). `nine_rows`, nine
distinct rows into one function, runs in all three today.

## What exists

1. **Prefix subtyping** (D622): `objWidthPrefix` exempts a pair whose fields are the first of
   the source's in layout order; `emitTypeSection` declares a WasmGC `sub` edge. That is why
   "after" runs everywhere.
2. **The record-width rewrite** (D3992, `check_width.vl`, 366 lines; slot face
   `check_width_slot.vl`, 828 lines; the `width` phase of `check_pins.vl`). A wider record at a
   direct call's argument (`callFtyArgAssign`, `wsSuppress`) notes the parameter; between check
   passes the arena is rewritten to `f<__W0>(p: __W0)` and re-checked, so each instance takes
   its argument's layout and reads it with direct `struct.get`. A slot (annotated binding or
   return) drops its annotation and re-checks. This is the "wider rows" machinery. It is a source
   rewrite with up to 8 re-check rounds, and it is reached only from a direct call's argument,
   which is why UFCS, forwarding, nested fields, returns and lambdas miss it.

## Proposal

**The instance key gets the concrete row in the elaboration**, as D16134 keyed a callback.
A declared record parameter `p: P` takes a delivered-row entry `#r.<i>` at each call whose
argument's row is wider than `P` and is not a prefix of it (`elabRowEntries`, today only for
un-annotated parameters, extended to declared record ones). Every position that reaches a call
in the elaboration (direct, UFCS, a generic's or a hole's instance forwarding, recursion, a
loop) gives the entry from the argument's closed type at that instance, so no position needs
its own wiring. The body stays typed at `P`; only the parameter's storage is the row, which the
emitter already lowers (a read typed narrower than its storage, as D16134's callback does).
Mono reads the entry (`elabCallParamRowTy`, D15173's reader) and decides nothing. The check's
refusal narrows to storage positions (an annotated binding, a field, a list element), the
accessor-view half the ruling defers.

**Returns.** `function pass(p: P): P { p }` returns the row the instance takes. The instance's
result storage is the parameter's row where the body returns the parameter, a second fact the
same key carries (`ekRetWide`, the wider-result note, exists for this).

**The cap.** Ruled: at least twice the corpus maximum. Measured with a counter build (not
committed) over `tests/cases`, the distilled census cells and the capability probes, about
20,000 programs: 11 reach D3992's width instances, and the most distinct rows one parameter is
instanced at is 4 (`records-of-generics-at-two-types-into-one-narrower-param.vl`,
`record-with-generic-fn-field-into-narrower-declared-param.vl`). The cap is 16: twice that would
be 8, which refuses the template's `nine_rows` cell, a program that runs today. The elaboration
counts distinct `#r.<i>` rows per declaration and parameter as it enqueues, and the 17th row is
refused by a sentence naming the contract: a record-typed parameter is specialised at most 16
concrete rows.

**Three mechanisms exist, and this folds two.** Beside D622's prefix edge and D3992's rewrite,
D14532 already instances a declared record parameter per rep: `recAnnArgTakesRep`
(`check_fit_rules.vl`) notes the argument's rep (`recArgRepNote`), and `monoIsGenericDecl` makes the
callee a template (`recRepFnHas`). Its note is per argument node, so a call inside a generic or a
hole instance, whose one template argument carries a different row per instance, cannot use it.
The `#r.<i>` entry is per instance. Mono's template test then reads "the elaboration keyed an
instance of this declaration by a row" in place of `recRepFnHas`, and the D15173 pin arm
(`monoPinHoleParam`) reads the entry for an annotated parameter too.

**What it deletes.** Once the entry serves every call position: `check_width.vl` (the parameter
face of D3992) and its `width` pin phase, the `wsSuppress` path of `callFtyArgAssign`, and the
re-check rounds it costs. `check_width_slot.vl` is the storage face and stays until the view.
Estimate: −400 lines for the parameter face, before the code that replaces it.

## Next

Code after the coordinator's go and the cap ruling: the `#r.<i>` entry for declared record
parameters, the mono read, the refusal narrowed, D3992's parameter face deleted, graded on the
three templates (`--before`/`--after` fixpoint) and D16215's witness.
