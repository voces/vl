# IR: an order-stashed record field written in place (2026-11-21)

**The class.** `short-circuit field after another` blocks 7 self-compile functions alone at `4c186c33`, and 9 once #9352 lands:
`mkBinary`, `cexMake` and their kin. Each is a record literal under legacy's source-order stash
(#9247) whose later field is a valued `if` (a short-circuit or an `if` expression). Legacy writes
each field in source order, the value then `local.set` into the slot `objOrderStashSlot` opens for
it, and reads every slot back in layout order before `struct.new`. The IR builds the literal as one
`RMakeRec` whose fields are its operands, and the lowering writes each field and its `local.set`
inside `makeRecStashed`. A valued `if` in a later field is a statement before the `RMakeRec`, so
its out would be written before the earlier fields' sets. That is the miss.

Staging the earlier fields below the `if` (`irBStageLeads`, #9289; `stageLeadArgs`, #9276) does
not apply here. A staged lead waits on the stack, and under the stash each field's own
`local.set` sits between it and the next field, which the lowering's stack discipline refuses.

**The step: a stash set per field, the existing receiver-stage pattern.** This is a migration
`Rhs` beside `RListStage`, `RTagStash` and `RStage`. Like them, it writes into a slot legacy opens,
and a later node reads it.

- `RStashSet { ssV: Opnd, ssAt: i32, ssK: i32 }`, an `SEffect` built right after field `ssK`'s
  value in source order, for a literal built under the stash.
- **Lowering.** `irLOpnd(ssV)`, then `objOrderStashSlot` for that field (the call legacy makes, in
  legacy's order), then `local.set`. The slot is recorded per `(ssAt, ssK)`. `makeRecStashed`, for
  an `RMakeRec` whose fields were stash-set (`mrSet`), writes no field and reads the recorded slots
  in layout order.
- **Builder** (`objLitAt`). Under the stash, each field's value is followed by its `RStashSet`.
  A later field's valued `if` then lands after the earlier fields' sets, in legacy's order, so
  `short-circuit field after another` no longer applies there. Without the stash nothing changes.
- **Verifier.** Each `RStashSet` is paired with the one `RMakeRec` at its `ssAt`, and each field
  is set exactly once (the `stagePairsWhy` pattern). The set's operand rep is the field's.

`RMakeRec` is unchanged for a literal with no valued `if` in a later field, so byte identity and
the claim set do not move outside the class. The step is graded on the self-compile census, the
armed shadow over the corpus and `tests/cases`, `--claimless`, and A/B.

**Ruling and retirement.** The coordinator approved `RStashSet` as a migration node on the
`RListStage`, `RTagStash` and `RStage` precedent; the verifier's pairing with its `RMakeRec` is
what makes it safe. It retires at I8 with the other stage nodes, when bytes may move and the
order stash becomes the lowering's own choice.

**D17037 is a different mechanism.** In D17037's witness the IR builds the record with no stash
(`record(v4, v5)`). The byte difference is exactly two locals-vector entries. Legacy reserves two
order-stash scratch locals for that literal, an i32 and an i64, and still writes it plainly. The
fix is to find which legacy path opens those slots and reserve them in the same order. That is a
separate step after this one.

## As built

- **On demand.** The set form is used only for a literal that needs it. The fields are built as
  before; when a later field holds a valued `if` or a boxed `??`, every field built so far gets
  its `RStashSet` at the end of its own build, and each later field gets one after its value. A
  literal with no such field keeps the in-record stash (`makeRecStashFields`), so functions that
  already matched keep their bytes.
- **Leads.** An `RStashSet` is written in place: `inPlaceFrom` and `ifBelowLeadIn` count it. A
  node that writes a lead before its operand (a call's earlier argument, an operator's left side)
  therefore misses by its existing name rather than staging across the sets. A box whose plan
  writes a leading tag around a set-form record is `box of a stash-set record`: legacy writes the
  tag before the stash.

Measured on fixpoint seeds at merge-base `5d2c2b81`: self-compile 19,253 → 19,257 functions with
no blocker, covered = matched, claimed 19,146 → 19,150. `short-circuit field after another` 7 → 0:
four build, three stop at `box of a stash-set record` (`mkBinary`'s shape, boxed into `Node`),
and one joins `expression if ref struct`. Corpus 43,118 and `tests/cases` 57,491 / 57,480 are
unchanged, the same 11 fail or mismatch rows. L2 fuel +0.12%.

Legacy lines deleted: 0. Moved to `@ir`: 0.
