# IR: the held-open rule as a positive contract, 2026-11-20

A follow-up to the open-type containers (#9223), from IR-REV's review of it.

## Why

#9223 held a container open type where every type variable sat under a function type and the rep
held no closure. That is a negative test. `closedRep` reads only a rep's top node, and `RUnsup` and
`RRaw` are closure-free too, so a function slot at one of them would have been admitted. The
contract is positive: each function-typed part is the tagged set's `i32` id.

## The change

- **`tyOpenHeldAsIds(ty, rep, path)`** (`emit_classify.vl`) walks the type and its rep together:
  - a closed part holds at any rep;
  - a function type holds at an `i32`, or a nullable `i32`;
  - a nullable, a list element, a map value (over a closed key) and each record field, in the
    type's field order (`repRecordKidOf`'s order), at its own kid;
  - a bare type variable, a union or a negation does not hold.
  The walk ends by its path.
- **`irTyHeldOpen`** is now `irTyOpen(ty) && !tyOpenHeldAsIds(ty, rep, [])`. The function-type
  special case, `tyIsFnValue`, `tyOpenOutsideFns` and `repHoldsClosure` are gone.

Compiler lines: +44 −49, 5 net fewer.

## Readings (fixpoint seeds, against #9223's head)

Coverage is unchanged: 39,579 corpus functions with no blocker; `open local type` 22 and
`open temp type` 40 alone; covered = verified = matched.
