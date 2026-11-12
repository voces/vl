# Step 7 L6 (step C9): the ref-array arm test takes the union's type; the ref `??` join reads no member set, 2026-11-12

This follows w317's #7496, which fixed D4937 and D15762.

## Changed

- **`unionHasRefArrayArmSlot(ty, slot)`** reads `unionTyArms(ty)`, the C5 reader, for its arms.
  Its four callers drop their names: `emitUnionCoerce`'s ref-array guards and `coalNicheBoxTag`.
- **`coalNicheBoxTag(ty, ..)`** takes no set.
- **The ref `??` join (`emitCoalesceNulRefJoin`)** no longer builds `unionMemberSetOf(joinN)`.
  With C6, no `??` join reads a member set.
- **Deleted:** `unionArmMemberTysOfTy`.

## Census

C5's census over the cases and cells already had the type's arms agreeing with today's on all
357 calls. C5 refused the cut because D4937's witness then reached an invalid instance body.
That is now fixed (#7496), and the witnesses run:
- D4937 prints `1`;
- D15762 prints `0`;
- D15763 prints `1`;
- D4912 prints `1`.

## Proof

**Witnesses:** `check-filed-witnesses --strict` on the four rows: all as filed.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,509 passed.
- emitter-state audit: passes.

**The full sweep:** CI's `sweep` label.
