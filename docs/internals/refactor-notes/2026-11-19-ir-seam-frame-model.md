# IR seam: one frame model for the re-entries and for legacy→IR calls (2026-11-19, lane IR4)

§10.1 stage 2 retires the IR's re-entries into `emitExpr`. IR2's family slices need the mirror:
a legacy dispatch arm that calls the IR's lowering for one node. This note fixes the frame both
directions share, before the first re-entry (`emitBoxAroundHole`) is built.

## The frame is legacy's, in both directions

The IR already lowers inside legacy's frame. `fbBeginFunc` opens it, and the claim lowering writes
legacy's locals vector (`framedLocals`). A declared variable's slot is
`declaredIndexAt(fnIx, declaredSlotOfDecl(d))`, the slot `localIndexOf` answers. Scratch comes from
legacy's reservations (`scratchSlot`, `strScratchBase`, `listIdxScratchBase`). An IR temp is consumed on
the stack at its one use and takes no local. So the seam adds no new frame. It adds three rules on
the state each side keeps beside it.

1. **IR → legacy (the re-entries): the operand is the IR's.** A shared arm splits around its
   operand, as in STORE's union compare (`unionUnionEqTail`) and C2c's `scalarListHoistOf` /
   `scalarListGetTail`:
   - a decision half that writes nothing (`*PlanOf`);
   - a head half that writes the bytes before the operand;
   - the operand, written by the caller (legacy's `emitExpr`, or the IR's `irLOpnd`);
   - a tail half that writes the bytes after it.

   Legacy's own arm calls the same halves around its own `emitExpr`. The decision is then shared
   by construction, not mirrored, and the corpus identity diff against master proves the halves
   reproduce the ladder they replace. The halves take no callbacks, and no ambient node (the value
   hole) names the operand. An arm whose operand is read twice, or not at all, is a plan arm of its
   own (an immediate the head writes itself), or a named builder miss. It never falls back
   silently.
2. **Legacy → IR (op-seam slices): one node, onto the current buffer.**
   `irLowerNodeIn(ix, fnIx): i32` builds node `ix` as an expression fragment of function `fnIx`,
   verifies it, and lowers it onto the current `wTarget` buffer at legacy's stack position. It
   returns 0 or -1, as a legacy writer does. The fragment rules:
   - **Variables.** A variable resolves to legacy's live slot (`localIndexOf`, which covers a
     scoped binding), not only to the declared slot. A read with no slot (a capture, a global
     cell) is a builder miss.
   - **No temp locals.** A fragment that would need a local misses, so the locals header is
     legacy's.
   - **Rows.** Element-read and span rows bank at absolute offsets in legacy's buffer, under
     legacy's `fnPos`.
   - **A miss is loud.** Once the legacy arm is deleted, a miss is `emitFail(<the IR's why>)`.
     Before then, the slice runs the IR fragment under the armed shadow and compares its bytes
     with the legacy arm's (the per-occurrence count of §10).
3. **Nesting saves and restores the lowering's state.** While re-entries remain,
   IR → legacy → IR can nest: the value hole runs legacy's box ladder, which may reach a family arm
   that calls back into the IR. The lowering's per-function state (`lw`, the temp and stack
   vectors, `lwSeq`, `lwFrames`, the row vectors, `lwMiss`) and the builder's (`ib`, `ibFnIx`,
   `ibDeclVar`, the loop and label stacks, `ibMiss`) move into one record, held in a frame stack:
   - `irLowerNodeIn` pushes a fresh record and pops it, restoring the outer one exactly, on a miss
     as well;
   - the claim and shadow entries take the bottom record.

   `ctrlDepth` is legacy's and is shared. A fragment opens and closes its own blocks, so it hands
   the depth back as it found it, which the claim entry already asserts for a whole function.
   Legacy's ambient seats (`numSeat`, `coerceHeld`, `boxSeat`, `armSeat`, `armServed`, `atomSeat`,
   the lazy list frame, the loop-hoist frames) are read by neither half and set by neither entry.
   A fragment whose lowering would need one is a miss, until I8 makes it an op at the delivery.

## What each re-entry becomes

| re-entry | operand the IR takes over | halves |
|---|---|---|
| `emitBoxAroundHole` | the boxed value | `holeBoxPlanOf` + head / tail per arm (below) |
| `mapGetOrHelperRoute` | the default, read as the IR's immediate | the plan takes the default's constant from the operand; no scratch emit of `emitMonoMapDefault` |
| `forInLoopOpen` | the hoisted walk's unrolled copies (a body re-emit) | the IR builds the copies; `forInLoopOpen` splits at `emitForInCopies` |
| `strEqTail` | the literal operand under the length test | `emitStrEqLit` splits at its `emitStrValue` |
| `popDropTail` | the receiver read inside `pushTake*` | a receiver-in-local half only |
| `emitStaticLitAtom` | a non-literal static side, evaluated for effect | the IR writes the operand and its `drop`; legacy keeps only `fbI32Rel` |

## The value hole's arms, measured

On master e1419277f (fixpoint seed), the armed shadow over the distilled corpus (12,301 cells) took
3,821 boxes through the hole; the self-compile took 20. Byte shapes around the value, with the
`i32.const` immediates folded:

| arm | boxes | bytes |
|---|---|---|
| `null`: a `null` literal, value unread | 2,555 | tag, `ref.null none`, `struct.new $box` |
| scalar payload | 984 | tag, value, `struct.new $cell`, `struct.new $box` (a widen op ahead of the cell for 2) |
| union passthrough | 180 | value only |
| string payload | 73 | tag, value, `struct.new $box` |
| a `K \| null` atom widened to its member string | 21 | value, then the stash, select and member chain |
| an `f32` literal written at width, value unread | 8 | tag, `f32.const`, cell, box |

Every one is a `T | null` box (`boxedNullable`, discipline 4), because that is the only box the
builder delivers into. `holeBoxPlanOf` covers these arms, and every other path of
`emitUnionBoxArg` stays the ladder's. The builder misses `box arm ladder` where the plan says so.
