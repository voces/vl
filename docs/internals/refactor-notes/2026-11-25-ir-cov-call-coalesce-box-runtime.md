# COV-CALL: `??` over a null hole read before its fill (2026-11-25)

Lane COV-CALL; census class `coalesce boxRuntime` (`classes/coalesce-boxruntime.txt`).

## Mechanism

`let x = null`, filled later, leaves a read before the fill narrowed to `null`, while the value
lives in a union box at its storage (`readNarrowedBoxToNull`). Legacy's `boxRuntime` rung
(`emitCoalesceBoxRuntime`) reads the box at its storage, tests its tag against the null tag, and
then either unboxes the payload at the result's scalar kind or keeps the box for a box result. The
default runs on the absent arm. The IR missed it.

The builder now reads the operand under `storageReadEnter` and builds a tag-tested `SCoalBox`
(`coalBoxTagged`, shared with `boxStash`). A box result takes the existing `boxStash` arm, which
writes the same bytes as legacy's box path. A scalar result takes the new `boxRuntime` arm, which
the lowering writes itself: the box into the shared slot, the tag test opening the scalar `if`, the
payload unboxed, then the default in the else (`coalBoxRuntimeOpen`). Legacy now calls the same
open, so the two emitters share one writer. The kind lookup (`coalBoxRuntimeKind`) stays in
wasmEmit, which keeps the checker read out of `ir_lower`.

An earlier attempt routed the operand through the `valScalar` box arm. Legacy's typed box tails
read the null-narrowed type there and refused ("narrowed union atom has no value box"), which is
why this arm writes its own tag test.

## Proof

- **Census**, class programs on this branch: no `coalesce boxRuntime` row is left. The probe and
  the witness are fully claimed. The case's one remaining miss is `print boxNull`, a separate class.
- **Q58:** `tests/cases/types/coalesce-null-hole-positions.vl` places the hole's `??` at a `const`,
  an argument, a call's argument whose result is used, an interpolation hole, a compare operand, an
  arithmetic operand after another operand, a list element, a record field, an f64 hole, a returned
  binding, a lazy default with a call counter, and module scope. On the master seed three of its
  functions and one array row miss on `coalesce boxRuntime`; on this branch all 67 match, and the
  output equals its `@log` list.
