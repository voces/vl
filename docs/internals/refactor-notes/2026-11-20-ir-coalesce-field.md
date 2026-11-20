# IR coverage step: a value-union record field's `??`, 2026-11-20

Lane F2. A coverage step under `ir-design-2026-11.md` §10 on the `SCoalBox` node, stacked on the
fused-pop arm (#9236), to IR-REV's design. Measured on fixpoint seeds of this branch and #9236's
head after its master merge.

## Why this class

`coalBoxArmOf`'s residual arm `next` was one IR miss, `coalesce box next`, for every `??` past
legacy's boxed arms. Legacy's `emitCoalesceUnionField` handles the record-field member of that
residue, `o.v ?? d` over a value-union field:

1. It resolves where the box lives: a row, a variant, a box receiver narrowed to one arm (cast to
   the arm's heap), or a null-tested nullable arm (asserted non-null).
2. It reads the box and tests its tag for `null`, opening an `if` at the box or at the result's
   value type.
3. The null arm writes the default.
4. The present arm re-reads the receiver and keeps the box, or unboxes its one residual atom and
   widens it to the result kind.

That is `SCoalBox`'s shape: a legacy-written head and present arm, a lazy default, a valued out.

## What landed

- **Legacy split (byte-identical).** `emitCoalesceUnionField` becomes:
  - `coalFieldPlanOf`, a `CoalFieldPlan` (receiver, cast, heap, field, the box's name and type);
    null where legacy fell through to `emitCoalesceOptMember`;
  - `coalFieldResidualKind`, the value-union, has-`null` and one-residual-atom test;
  - `coalFieldOpen` (cast, box, null test, `if`) and `coalFieldPresent` (cast, box, then the
    unbox and widen for a scalar result);
  - `coalFieldResultKind`, the checker's result kind.

  `emitCoalArmRecv`, whose only caller this was, folds into the tails.
- **One refusal decision.** `coalFieldRefusedWhy` returns the sentence legacy refuses with, or "":
  a box at a wider record two members widen to (anchored at the read, as every such refusal is), a
  box rebuilt at a narrower union, or an unbanked set. `coalFieldUnboxWhy` is the scalar arm's
  missing value box. Legacy fails with the returned sentence at the same point; the builder misses
  on any non-empty one, so a refused read cannot be claimed.
- **A dead call deleted.** Legacy wrote `const munTy = mphysTy`, then
  `if msSetOfTyAny(munTy) != msSetOfTyAny(mphysTy) { emitBoxAtomRetag(...) }` in both present arms.
  The comparison is of one value with itself, so the retag never ran; it is gone. The per-file
  `tests/cases` A/B and the corpus identity below are the byte proof.
- **The node's arm.** `CoalValArm` gains `fieldBox` and `fieldScalar`. `coalValBoxArm` maps both
  to null; their `irNodeFamily` is `box`; the lowering's dispatch and its result-kind choice are
  `_`-less matches.
- **Builder.** On arm `next`, `coalField` requires the plan, no refusal, a residual atom, a result
  that is a box exactly when legacy keeps the box, `endsInTemp` clear, and a receiver that is a
  non-temp variable, since the present arm re-reads it. A receiver the plan casts is read at its
  own rep, unnarrowed, as legacy reads it. The default is built into the null arm at the out's rep.
- **Lowering.** The receiver, `coalFieldOpen`, the default into the slotless out, `else`, the
  receiver re-read, `coalFieldPresent`, `end`.
- **Verifier.** A field `??` re-reads a non-temp variable, and its out is a box exactly when its
  arm is `fieldBox`. Hand-built negatives in `ir_selftest`:

  | case | breaks | rule it fails |
  | --- | --- | ---: |
  | 15 | keeps the box into an `i32` out | 2 |
  | 16 | re-reads an immediate | 2 |

- **The residue's miss, split.** `coalesce box next` now names the operand: `call`, `name`,
  `index`, `member`, `optional member`, and `field kind` for a field plan with no residual atom.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 17,892 | 18,202 |
| corpus functions covered (45,678) | 39,986 | 39,986 |

The corpus does not move: its `coalesce box next` population is call and name operands, not
record fields. Blocker census on this branch's seed, functions whose blockers name the residue:

| operand | alone | with other blockers |
| --- | ---: | ---: |
| call | 48 | 120 |
| name | 46 | 23 |
| index | 0 | 9 |
| member | 1 | 0 |

- **Shadow mode 1:** everything covered is verified and matched.
- **Mode-3 self-compile:** byte-identical.
- **`ir-identity.sh` (#9236's seed against this branch's):** corpus identical 9,037, differ 0,
  self-compile identical. `--cases`: identical 7,516, differ 0; witnesses same 59.
- **Per-file `tests/cases` A/B:** same 7,231, fail under both 67, differ 0.
- **Witnesses** (`vl_ir_shadow_test`), all covered and matched: an unboxed atom, a widened `f64`
  default, a box kept for a nullable default, a default that reassigns the receiver the present arm
  re-reads (`r.v ?? (r = q2).w`, prints 64 as legacy does), and a loop variable narrowed by `is` to
  one arm.
- **L2 fuel:** 103,368,054,977 against #9236's 103,307,117,294 on the same master, +0.06% own;
  +1.0% on the shared 102.31G baseline, the rest being #9236 and master drift.

## Open

- A receiver narrowed by a null test (`if r != null { r.v ?? 1 }`) is read through a recovering
  temp, which the present arm cannot re-read: `coalesce field receiver place`.
- D17026 (unfiled: D17026, filed by #9238), found while probing receivers: an `is`-narrowed arm in a valued `if` delivered to an
  `A | null` binding writes the union box.
