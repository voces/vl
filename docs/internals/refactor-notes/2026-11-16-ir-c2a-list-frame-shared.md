# IR cutover C2a: the list frame is a shared decision, 2026-11-16

Lane IR-C. This is the first PR of the list-family plan the coordinator ruled after C1. It makes the frame a
decision the IR and legacy share, then the list-read op-seam slice, then `emitArr*` family by family.
The frame becomes one decision that legacy and the IR both make, so no slot is renumbered (moving
`vSlot` to an IR allocator stays I8's named mover). `CLAIMED` stays empty. Measured on fixpoint seeds of
this branch and its master base (`b8bdd167`).

## What landed

- **The locals vector is legacy's writer.** The lowering writes its body first, then the locals
  vector with `fbEmitLocalsVec`, the same writer `emitFuncCode` uses. Deleted from the IR:
  - its own `localsVec` and `localRun`, which required every slot after the parameters to be an IR variable;
  - `runBytes` and `refValtype`, which copied legacy's run bytes out after the fact;
  - the `irRefValtypeHook`.

  One guard is kept: a scalar variable holding a declared slot must carry the valtype legacy
  declared there (`runAgrees`), or the lowering misses with `locals layout`.
- **The lazy list frame grows through the shared find-or-append.** A list read asks
  `listIdxWrapSlot`, the call legacy's `emitIndexScalarList` makes. Before, it read the slot
  read-only out of the frame legacy had already grown (`wrapSlotFound`).
  - The builder no longer binds the frame's rows as variables: `bindScratchFrame`, `slotVar` and
    `irRefScratchNote` are deleted.
  - Under the shadow, the lowering starts from an empty lazy frame and grows its own, so the dual
    emit compares two frames built independently, not one frame twice. Legacy's frame is spent by
    then, and the next function's `fbBeginFunc` resets it. It is not saved and restored, which the
    phase-state ratchet counts as a hidden argument. The armed self-build staying byte-identical shows
    that nothing reads it in between.
- **The claim seam moved after `fbBeginFunc`**, so a claimed lowering runs in the frame legacy lays
  out, its eager scratch included.
  - A claim closes the frame with `fbEndFunc`.
  - A claim that falls back pops the lazy rows it added.
  - A lifted function with extra results (`fbRetExtra`) is never claimed.

## Measurements

| reading | base | this branch |
|---|---|---|
| self-compile, armed: covered / verified / matched | 2,137 / 2,137 / 2,134 | 2,137 / 2,137 / 2,134 |
| self-compile mismatch classes | 2 `folded global read`, 1 `operand above a valued if's value` | the same |
| `ir-shadow.vl` over the distilled corpus | 12,267 of 12,267 matched | 12,267 of 12,267 matched |
| armed self-build byte-identical to the unarmed seed | yes | yes |
| self-build: base seed and this seed from this source | — | identical (fixpoint at the second compile) |
| corpus identity, base seed against this seed, 12,172 cells | — | 8,893 identical, 3,279 fail under both, 0 differ |
| mode 3 (claims `scalar`, `control`, `call`, `global`) over the corpus | — | 8,893 identical to unclaimed, 0 differ, 0 fell back |
| L2 self-compile fuel | 89,795,920,717 | 89,781,637,145 (−0.016%) |
| seed size | 6,350,898 | 6,348,832 (−2,066) |
| compiler lines | — | +78 / −211 over five files, net −133 |

**Failing control.** A copy of the lowering that requested one extra lazy row before each list read
turned 207 matched self-compile functions into `prefix or locals` byte mismatches. Matched fell
from 2,134 to 1,927. So 207 covered self-compile functions exercise the shared lazy frame.

## What the frame unblocks, and what still blocks `list`

A copy of the claim compiler with `list` admitted to mode 3 was built only for this measurement.
Its claims no longer fall back: before, list mode 3 fell back in 399 cells, on `locals layout` and
`list read wrapper slot`. It still differs from unclaimed in 333 cells. Each of the 333 holds a
read the armed shadow reports as `index maybe hoisted`.

`hoistRowAny` reads the hoist tables legacy fills while it lowers a loop. At claim time, before
legacy runs, they are empty, so a claimed read in a hoisting loop takes the unhoisted guard. Its
answer depends on when it is asked. That is the ruling's second constraint, and the next PR's work:
replace it with the shared `liveHoistRow` decision, with the loop lowering minting the hoist rows as
legacy's does.
