# IR-N3: the assignment-value box rep (2026-11-24, lane IR-N3)

An assignment used as a value whose target is a union box and whose value the checker types at the
member written (`return x = { s: "b" }`, `let x: A | B`): legacy's value is the target's re-read
(`asgReadNode` names the target), the box, and each delivery owing a member unboxes it at its own
heap (`armClose` → `emitNarrowedArmUnboxTo`). The IR built the re-read at the member rep and
missed — `global read coercion` for a global target, `narrowed read` for a local one.

## The lowering (`asgBoxRep`, `exprAt`, `assignValue`)

`asgBoxRep` is the one decision: legacy's `reRead` arm (`asgValueArmOf`), its value node the
target (`asgReadNode`), the value a union (`exprUnion`), and the target held as a box. `exprAt`
builds the assignment at that rep, so `assignValue` re-reads the target as it stands. A re-read
after an operand already built misses (`assignment value box after an operand`): the store would
put that operand out of stack order, as `assignValueLit`'s does.

## The wiring (`armUnboxOwed`, `armUnboxTemp`, `armUnbox`)

A delivery owing the member (`narrowedArmNeedsUnbox`, legacy's own) takes such an assignment as it
takes a narrowed box local: `RArmUnbox` over the box built by `exprAt`, its destination in
`uaDst`. The lowering casts an assignment's box at the destination's heap
(`emitNarrowedArmUnboxTo`, now exported), as legacy's position does; a narrowed read keeps its arm
record's cast.

## Grading — the position matrix (both templates, fixpoint seeds on master ec119adc0, each built in its own tree)

`scripts/capability-probes/matrix/assignment-value-union-box-{global,local}-at-member.matrix.vl`,
66 graded cells each (two_instances skipped), RUNS 66 of 66 before and after. Shadow mode 4 per cell:

| cells (each template) | before | after |
|---|---|---|
| 46 (binding, argument, return, fn_body, closure_capture, blocks, global_*, local_assign, the TEST-gated is_in_* / else_if / early_return_guard / *_place reads, other_member) | `global read coercion` (global) / `narrowed read` in a function (local) | covered, matched |
| 2 `array_push` | `global read coercion` | `assignment value box after an operand` |
| 6 `struct_field_*` | `object field arm unbox` | unchanged — its own class: a narrowed box local into a record field misses the same |
| 6 `map_*` | `map store value variant box` | unchanged — its own class (the narrowed-local twin misses the same) |
| 6 `array_element*` | `array ref` | unchanged — its own class (the narrowed-local twin misses the same) |

Mode 1 per cell: covered and matched 92 → 138 (of 138) in each template, 0 mismatch, 0 fail. Q58: the
134 kept cells are claimless-identical under both seeds (`ir-identity --claimless`, identical 134,
differ 0); `capability-matrix.vl --before/--after` reads runs 66 of 66 in both, 0 runs → not-runs.

tests/cases (mode 1, master ec119adc0): covered and matched 74,999 → 75,001; `uncovered global read coercion` 3 → 1
(`closures/closure-store-struct-union-global`, `functions/return-assign-expression-global` now
covered, matched).

## Legacy tails the IR calls

`emitNarrowedArmUnboxTo` (exported, unchanged): the site-heap unbox legacy's position writes.

## Measured (fixpoint seeds on both sides)

Full proof on base master ec119adc0: byte A/B 20,555 programs 0 moved; `ir-identity --cases`,
`--claimless`, `--names` differ 0 / differ 0 / self-compile identical; mode 3 self byte-identical;
corpus shadow 46,847 matched, 0 order rows; self-compile guest fuel 125,888,720,293 →
125,920,525,950 (+0.03%).
