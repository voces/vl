## Type system (Track A)

- **A pending function result is no fit:** `fnSlotAssignable` refuses a result still being
  inferred (`RET_PENDING`) instead of reaching `assignable`'s negative-type accept, and a
  `.filter` predicate still being inferred is left to the call's re-check. Shape C of the
  negative-type sentinel census; corpus and distilled outcomes unchanged.
