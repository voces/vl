# A shared field read whose arms box (2026-11-20)

After #9267 the IR took a shared field read whose every arm was the plain read. The corpus's
remaining `member box` rows were mostly arms that box: the members store the field at different
atoms (`{v: i32} | {v: string}`), so each scalar arm is boxed under its atom's tag.

## Shape
- **Arms.** `sharedArmIsBox` is the subset of `emitSharedFieldArm`'s box path the IR takes: a
  scalar atom, or a non-null ref under its tag; never a `null` member, an atom set, a nullable ref
  or a conversion. Its bytes are `sharedArmBoxHead` (the tag, before the receiver) and
  `sharedArmBoxTail` (the value box and the union box), which legacy's arm writes too. The
  lowering asks each arm `sharedArmIsPlain`, then `sharedArmIsBox`, and misses on neither.
- **Tail.** `sharedReadTailOf` is the one decision of what follows the dispatch: an atom unbox, the
  narrow unbox, the `string | null` recover, or nothing (a narrow unbox that writes nothing,
  `unionFieldNarrowUnboxWritesNone`, is nothing). `sharedReadTail` writes it for both emitters;
  the builder checks the read's rep against it (`irBAtomKindRep` for an unbox) and misses on the
  narrow unbox that writes.
- **Audit.** Under `sharedReadTail` and `sharedArmBox*`: `emitUnionUnboxTail`,
  `emitUnionFieldNarrowUnbox`, `emitPlaceNarrowContainerUnbox`, `emitUnionFieldTagDispatch`,
  `emitNarrowStoredAtomKind`, `emitConvertAtomKind`, `sharedArmPayloadRead`. None calls
  `emitExpr`, `emitWidened` or `emitAtomToStr`: they are leaf bytes of the read alone.
- **Slot.** The stash slot (scratch code 7) is reused by `emitUnionFieldTagDispatch` under the
  narrow unbox, only after the dispatch's last read of the stashed receiver.

## Measured
See the PR body.
