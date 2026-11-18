## Infrastructure (Track F)

- **One freshness question for converting copies, step 1:** `deliveryFresh` (check_fit_rules.vl) answers whether a delivered list is one nothing else holds: a literal that builds every value it holds, a fresh call, or a `const` of such a literal read nowhere else. The nested copy (D2196) and a callee-local `const` now ask it. The list-copy and record-copy recorders are one walk, and adoption's predicate is renamed `recLitOnlyDeclOf` so the two cannot be confused. No program changes behaviour.
