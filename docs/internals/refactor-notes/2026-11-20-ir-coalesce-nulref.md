# IR coverage step: a nullable reference's `??`, phase 1, 2026-11-20

Lane F2, to IR-REV's design. A coverage step under `ir-design-2026-11.md` §10 on the `SCoalBox` node.
Measured on fixpoint seeds of this branch and of master, both building this branch's source.

## Why this class

A scratch probe split master's `coalesce box next` miss by the legacy core it reaches. In the
corpus, most of it is legacy's `emitCoalesceNulRef`: a block typed at the reference, the operand
evaluated once, `br_on_non_null` out of the block, and the default as the fall-through, so it runs
only on `null`. The same core serves the `coll` and `clo` niche arms.

| core (corpus, master) | alone | with other blockers |
| --- | ---: | ---: |
| nullable union arm `V \| null` (name 38, call 19) | 57 | ~149 |
| nullable record `S \| null` (call 11, name 8) | 19 | 1 |
| a call's value-union box stash | 18 | 0 |

## What landed

- **One heap decision.** `coalNulRefHeapOf` names the heap the block carries, or -1: the
  collection wrapper at the `coll` niche arm, the closure struct at `clo`, otherwise the last rungs
  of the ladder (`coalNulRefTailHeap`: a nullable union arm's variant heap, then a nullable record's
  struct heap). Legacy's four sites read it; the IR reads the same function.
- **The node's arm.** `CoalValArm` gains `nulRef` (family `box`); `coalValBoxArm` maps it to null,
  and the lowering's dispatch is a `_`-less match.
- **Builder.** At the `coll`/`clo` niche arms, and at `coalBoxArmOf`'s `next` when the operand is a
  name (which reaches the last rungs directly). It requires the heap, `coalNulRefArmOf == plain`,
  `endsInTemp` clear, an operand that is a non-temp variable (the block opens before the operand,
  so a temp written ahead of it would sit below the block), a result at the operand's rep or its
  inner by the default's nullability, and a default already at that rep (else
  `coalesce nulRef default rep`): legacy writes the default as itself.
- **Lowering.** `coalNulRefOpen`, the operand, `coalNulRefBranch`, the default into the slotless
  out, `end`.
- **Verifier.** A nullable reference's `??` reads a nullable reference (not a box) and its out is
  that reference or its inner. Selftest cases 16 (an `i32` operand) and 17 (a non-null list) fail
  rule 2.

## Coverage

MEASUREMENTS PENDING
