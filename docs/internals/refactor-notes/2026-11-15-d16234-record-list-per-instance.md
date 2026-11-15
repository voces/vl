# D16234, D16236: a generic instance's record-list literal at its own slot fact

`monoHeldRecordListAt` (emit_mono.vl) types an un-annotated list literal of records of functions.
A generic instance read only the elaboration's rep stamp on the literal, and gave up on any element
write or re-pointed literal. The elaboration leaves no stamp on a bound list, so the literal fell to
the program-level pin. Both instances then built it at one element type: a trap where a write kept
the second instance's pushed element apart (D16234), and a missing-signature emit refusal where
nothing did (D16236).

The change, net -3 lines:

- With no stamp, an instance takes the slot fact for its own binding (`elabSlotTyAt(at, ["e"],
  ctx)`), under the same `monoHeldReadsBuiltAt` guard the non-generic branch uses.
- An instance gives up only when the literal is not its own, or a stored value comes from another
  frame. Writes its own body makes are typed with the literal.

`emit_mono` function count is unchanged.

D16235, the annotated push of the same record, is not this mechanism. The instance re-check types
`{ f: id }` at the first instance's `(i32) => i32` at both instances (`checkNodeHook` in the `push`
arm of check_member_call.vl), and it stays open.
