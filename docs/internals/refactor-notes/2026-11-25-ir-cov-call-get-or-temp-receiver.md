# COV-CALL: `xs.get(i) ?? d` over a call receiver (2026-11-25)

Lane COV-CALL; census class `coalesce listGetOr staged operand`.

## Mechanism

Legacy's fused head (`listGetOrOpen`) reads the receiver and the index twice. A receiver it
cannot re-read (`optRecvReReadable` false: a call) is staged once in the `.get` stash by
`listGetStageMark`, written before the index (D3756). The IR refused any such receiver.

- **Builder.** `coalListGetOr` accepts a receiver that built only temp `let`s ending in its own
  (`tempsEndingAt`). A module-scope call's global argument is a temp of its own, so one temp is
  not enough.
- **Lowering.** `irGetRecvOnce` writes that temp into a ref local of the list's wrapper
  (`listGetRecvWrapOf`) before the index is consumed. The local is keyed by nesting depth
  (`irOnceRefSlotAt`). `irListGetRecvRead` returns it at each of the head's reads.
  `listGetRecvUnstage`/`Release` set legacy's `listGetRecvHeld` only around the head's open, so a
  nested fused read cannot clear it early, and `listGetStageMark` stages no receiver for that head.
- **Once-slots** (`irOnceSlotAt`) carry a holder tag beside the valtype (`liOnceTags`, reset with
  `liOnceVts`). Two holders of one valtype, one nested in the other's evaluation, then take two
  locals.

The IR's local differs from legacy's stash slot, so the locals prefix differs. Byte identity is
informational (#10171), and the armed runs match.

## Proof

- **Census**, the eight programs CENSUS listed for this class on master fcf003d9:
  `coalesce listGetOr staged operand` 8 → 0. `lists/get-or-default-receiver-first` and the D3756
  witness are fully claimed. The other six (`lists/list-get-nested-stash-*`,
  `list-pop-nested-stash-control`, D17381) now first-miss on `coalesce listGetOr after an operand`
  (or `popOr`'s). That is a fused read nested in the index or the receiver after an outer receiver
  temp, which needs the receiver staged before the inner `??` lowers: a further step.
- **Q58:** `tests/cases/lists/get-or-temp-receiver-positions.vl` puts a call receiver (with a call
  index, prints pinning the order) at a `const`, an argument, an interpolation hole, an f64 list, a
  miss's default, a returned value, an arithmetic operand and module scope. On the master seed two
  functions and the start body miss on `staged operand`; on this branch they are covered, and the
  armed run prints the `@log` list.
