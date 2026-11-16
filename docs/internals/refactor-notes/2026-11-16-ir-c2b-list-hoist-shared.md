# IR cutover C2b: the list-header hoist is a shared decision, 2026-11-16

Lane IR-C. This is the second PR of the list-family plan, after C2a's shared frame. It meets the
ruling's second constraint: the IR's copy of the hoist decision (`hoistRowAny`, which refused what
it could not see) is replaced by legacy's own decision. The decision is asked at lowering time, in
the same place legacy asks it. `CLAIMED` stays empty. Measured on fixpoint seeds against C2a and its
master base (`b8bdd167`).

## What landed

- **A loop opens legacy's hoists.** The lowering of a while loop's block calls `loopHoistOpen` before
  the block and `loopHoistClose` after it, through two hooks. These are the calls legacy's
  `emitWhileLoop` makes. They scan the loop, mint the header rows into the shared lazy frame, write
  the prologue and mark the rows live.
- **A list read asks `liveHoistRow`.**
  - On a live row, it writes the index and `emitListIdxGuardHoisted`, as `emitIndexScalarList` does.
  - It skips the receiver, which the header holds. `irLSkip` takes a temp receiver's one use in order
    without writing it, as legacy never writes a global receiver's read.
  - Otherwise it writes the unhoisted guard, as before.
- **The read carries its node.** `RListGet.lgAt` is the `Index` node. The lowering reads the element
  kind and packed row from it, and the range proof reads the index from it. The builder's per-function
  read notes (`irRefGetNote`, `irRefNotesFor`, `noteOf` and their tables) are deleted. They were keyed
  by the receiver variable, so a second read of one list would have taken the first read's note.
- **Deleted:** `hoistRowAny`, and the build-time `index maybe hoisted` refusal. The build no longer
  reads state legacy fills while it lowers.
- **A fallback, and the shadow, reset the whole lazy frame** (`fbResetLazyFrame`), hoist rows
  included, not only the bounds-check rows.

## Measurements

| reading | C2a | this branch |
|---|---|---|
| self-compile, armed: covered / matched | 2,137 / 2,134 | 2,157 / 2,154 |
| self-compile mismatch classes | 2 `folded global read`, 1 `operand above a valued if's value` | the same |
| `ir-shadow.vl` over the distilled corpus | 12,267 of 12,267 matched | 12,603 of 12,603 matched |
| armed self-build byte-identical to the unarmed seed | yes | yes |
| self-build: fixpoint from the previous seed | yes | yes (second compile) |
| corpus identity against the base seed, 12,172 cells | 0 differ | 8,893 identical, 3,279 fail under both, 0 differ |
| L2 self-compile fuel (base 89,795,920,717) | 89,781,637,145 | 89,785,125,801 (−0.012% on base) |
| seed size | 6,348,832 | 6,348,151 (−681) |
| compiler lines against C2a | — | +89 / −134, net −45 |

**Mode 3 with `list` admitted**, from a throwaway build that differs from this branch only in that one predicate:

| population | C2a | this branch |
|---|---|---|
| corpus, claimed against unclaimed | 8,560 identical, 333 differ (every one a hoisted read), 0 fell back | 8,893 identical, 0 differ, 0 fell back |
| self-compile, claimed | — | 2,154 functions claimed. Output byte-identical to the seed; 3 fell back (the named misses above) |
| self-compile, plain mode 3 (no `list`) | — | 1,697 claimed, byte-identical; 2 fell back |

So the list read and its frame, hoists included, now give legacy's bytes when claimed as well as under
the shadow. That is the evidence the list-read op-seam slice needs.

## Next

The list-read op-seam slice routes legacy's `emitIndexScalarList` through the shared arm and deletes
its ladder. Before that, the per-occurrence count of list reads must show zero mismatches over the
self-compile and the corpus (constraint 3). The `index view` arm (`svDstOfKind`) stays a named miss
until the view read is shared.
