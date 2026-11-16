# The record-row union scan keys each member once, 2026-11-16 (lane REP)

Found while sizing rep ADT 4b part 2. In the self-compile profile, the struct twin pass
(`buildStructTwins`) is about 0% of the time. `mAssignTypeIndices` is 1.2%, and nearly all of it
is `buildVariantTwins` → `variantStructHeapTwinAt` → `recordRowClassOf` → `rrArmKey` →
`rrUnionsOf`'s one-time arena scan. For each union holding two or more records, `rrUnionIsNew`
rebuilt every record member's sorted field-name key (`fieldNameOrder` plus concatenation). A
member recurs across the arena's union copies, so the same key was rebuilt many times.

`rrNamesKeyOf` memoizes the key per type, reset with the class memo in `recordRowsReset`. The key
depends only on the type's field names, so the change is exact.

| reading | value |
|---|---|
| L2 self-compile fuel, base 868f9c296 | 97,463,483,076 |
| with the memo | 96,622,437,521 (−0.841G, −0.86%) |
| corpus identity (`corpuscmp` vs a base fixpoint seed) | 8,413 modules, 0 DIFFER, 0 LOST |

Rep ADT 4b part 2 (the struct table keyed by `repHeapId` and layout) has no fuel to recover:
`structFieldCodesEq` is a coinductive equivalence, so its byte-identical form buckets rows by key
and keeps the in-order guard. That refactor stands on the `heapOf` API, not on cost.
