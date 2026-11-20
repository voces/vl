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
  collection wrapper at the `coll` niche arm, the closure struct at `clo`, the nullable reference's
  own heap past the boxed arms (`identBox`), and -1 for the niche arms with their own lowerings.
  Past the boxed arms it reads `nulNicheValueHeap`, the box stash's heap function, now the one
  copy. **A deliberate legacy change:** a variant index past `uVarRow` now falls through to the
  struct check, as the `??` rung did, where `emitUnionBoxNulNiche` answered -1. Such an index
  cannot arise: `mAssignUnionHeaps` fills `uVarRow` with one row per variant before emit, so an
  index past it would be a checker/emit desync. The per-file `tests/cases` A/B at differ 0 shows
  the edge unreached on that corpus.
  Legacy's three sites read it (the `coll` and `clo` arms and `emitCoalesceNullableRefs`); the IR
  reads the same function. A `?.` chain's closure or map leaf stays its own decision: its heap is
  the field leaf's, not the operand's.
- **One rung decision.** `coalNulRefRungReached` (a name, or a call that is neither call niche)
  says when `coalBoxArmOf`'s `next` reaches the nullable-reference rungs with no arm between;
  legacy's `next` arm goes straight to `emitCoalesceNullableRefs` on it, and the IR builder reads
  it.
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

Fixpoint seeds of this branch and of its merge base, master `5331d4690` (after #9259's shared
member read), each building this branch's source:

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions covered | 18,502 | 18,502 |
| corpus functions covered (45,678) | 40,788 | 40,834 (+46) |

On the earlier base `f2ec7aa7c` the same branch read +45; the plain block alone +8. An earlier
+15 / +119 for the plain block compared against an older master than the branch's base and is
withdrawn.

#9259 did not release the functions whose `??` this branch builds and whose last miss was
`member box`: 118 corpus functions are still blocked by `member box` alone on this branch, the
receiver shapes #9259 leaves for its follow-ups (stashed receivers and the unbox tails). Remaining
`??` blockers: `coalesce nulRef heap` 18, `coalesce nulRef operand temp` 12 (a plain block over a
call), `coalesce box next` 2 alone and 9 with `member box`.

- **Join default:** legacy writes it with `emitUnionBoxAtRecord`. The IR builds only its
  recorded-box branch (`boxOwedAt`, which `deliver` shares); a default already of a union, or one
  boxed at no site type, misses as `coalesce nulRef join default`.
- **The staged slot:** `optRecvSlot` is the function's reserved local (`fnUses.optRecv`); the
  builder reads the function's own flags, since `irClaimFn` runs after `fnDetectScratch(fnIx)` in
  `emitFuncCode`. A join
  nested in the default re-tees it only on the outer null path, where the outer present arm never
  reads it, and a join inside the operand finishes before the outer tee.
- **Witnesses** (`vl_ir_shadow_test`), covered and matched where master misses: the plain block
  (six functions, a call default that runs once), and the join (a name, a call whose default runs
  once, and a join nested in the default; prints 52, 73, 1, 55).
- **Byte proof:** mode 3 identical; `ir-identity` corpus 9,037 identical, differ 0, self-compile
  identical; `--cases` 7,523 identical, differ 0, witnesses 59 same; per-file `tests/cases` A/B
  7,237 same, differ 0.
- **Ratchets:** late demands 9 (baseline 9); late tag rows 307 (baseline 307, 0 gone); seed
  6,900,357 bytes (+0.1% on 6,894,207; master's seed at the base is 6,896,934); phase-state
  `ir_selftest.vl` surface 6 → 7 (`mkNullableTy`).
- **L2 fuel:** +0.1% on the 103.31G baseline.
- **Compiler lines:** +295 / −72 against the merge base.
