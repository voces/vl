# IR: a retag or call-result temp is typed at its delivery's own type (2026-11-24, lane IR-N11, D17280)

D17280: an intersection `M` over a recursive `Node`, with `Node` also in a union with another
record (`Node | R`), failed verifier rule 3 (a value's rep must be its type's) wherever the IR
retagged it. The claim fell back to legacy, so the output was right. The ablation: drop the
intersection, the recursion or the `Node | R` union and it holds; the call is not needed.

The temps were typed through `repTyOf(dst)`, the type that first minted the rep node. For the twin
row a recursive cycle or a hash-cons hit had redirected that type's memo to another node, so
`repNodeOfTy(repTyOf(dst)) != dst`.

- **`repTempTy` (ir_build.vl)** types a temp at a given type when its rep is `dst`, else at
  `repTyOf(dst)` as before. `repTemp` is `repTempTy` at `repTyOf`.
- **A direct call's argument retag** is typed at the parameter's `pt` (`pr = repNodeOfTy(pt)`), and
  **a return's retag** at `irRetTy`.
- **A direct call's result**, built at the callee's rep, is typed at the callee's result type
  (`calleeResultTyAt`, the `resultTy` `exprTyOf` already answers a call with).

The rhs is unchanged, so the bytes are too. The retag rule is untouched: the self-test
`record-retag-field-other-valtype` types its temp at its delivery's own type and retags to a row
that does not lower alike, and the verifier still refuses it (rule 2).

## Measured

Base 1a89630a, both seeds fixpoints. Every program below runs alike claimed and claimless.

- Sweep of the delivery sites with the `M`/`Node`/`R` family (call argument, union argument, let,
  return, list element, global initializer, if arm, record field, map value):
  - Base: all 9 fail rule 3, in `mkM`'s return and, at a call argument, in `@start`.
  - Head: 0. The map value is uncovered on both seeds at `map store value variant pass`, a class
    this change does not touch.
- Witness: base `fail rule 3` in `f` and `@start`; head 4 covered, 4 matched.

Pins: `tests/cases/records/intersection-recursive-twin-row-retag-{witness,positions}.vl`.
Row: `tests/ir-shadow-rows/intersection-recursive-twin-row-retag.vl`.

## Legacy tails the IR calls

None new: `resultTy`, which the builder already calls for its own result and for a call's type.
