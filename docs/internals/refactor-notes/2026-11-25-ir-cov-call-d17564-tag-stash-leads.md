# COV-CALL: an operand before a tag dispatch's stash (D17564) (2026-11-25)

Lane COV-CALL. D17564 (filed by SOUND from COV-START's Q58 sweep) is check-clean invalid wasm under
`VL_IR_STRICT=1`: `print("i=\{f(5)}")` with `f` read from a `Map()`.

## Mechanism

`f(5)` is a tagged set's dispatch (`emitFnTagDispatch`): the callee's set id stashed, then the
member's call. Legacy writes every operand in place. In `"i=" + toString(f(5))` it writes the
literal, then the union box's tag, then the stash, the call and the payload. The IR's stash is a
statement (`RTagStash`). `irBStageLeads` staged an earlier operand only below a valued `if`, a
`??` or a field stash, so the stash landed above the literal. Where a box over the dispatch leads
it (`irBoxLeadBox`, written by `dispatchBoxHead`), the box's head landed above the literal too.

- **The same gap on master, valid but not byte-identical:** an unboxed tagged call after an
  operand (`"k=" + f("x")`, `sum(1, f(8))`, `1 + f(11)`). The IR wrote the stash first. It was
  claimed, with an armed-shadow mismatch.
- **Fix (builder only):**
  - `tagStashFrom` joins `irBStageLeads`' stash test, so an earlier operand is staged below the
    stash. `tagStashEffect` already writes staged roots first.
  - `dispatchBoxFrom` (a tag stash under a led box) declines, since the box head would still lead
    the staged operand. Each caller then misses with its own reason.
  - Binary arithmetic stages its left operand on a tag stash, as on a valued `if`.

## Proof

- Under `VL_IR_STRICT=1`, `tests/cases/closures/tag-dispatch-call-after-an-operand-positions.vl`
  runs: the D17564 witness, a boxed concatenation, a string concatenation, a union and a plain
  argument, a list element, a record field, a right operand, and the hole at module scope. On
  master it is invalid inside `hole`.
- Under `VL_IR_SHADOW=2` the sweep shows no mismatch. The boxed positions are `uncovered` under
  their callers' misses; the rest are claimed.
- Byte identity against current master's seed (default build, equal exit codes): `tests/cases` 0 of
  9,422, distilled + capability probes + witnesses 0 of 18,150, and the self-compile is identical. A
  default build already fell back on the mismatched claims; strict and the armed shadow are where
  they showed.
