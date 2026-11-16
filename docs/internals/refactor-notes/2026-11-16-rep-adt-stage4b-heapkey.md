# Rep ADT 4b, part 2: the struct heap key as one bucketed pass, 2026-11-16 (lane REP)

Ruled shape (coordinator, after part 1's trace): key the struct table by `repHeapId` plus layout,
byte-identical by construction. `structFieldCodesEq` is a coinductive equivalence (an element row
pair being compared counts as twins), so a hashable layout key could equate or split recursive
rows differently. The form identical by construction buckets rows by key and keeps the in-order
guard.

## The change

- `twinChain` (the variant pass's key buckets) moves to `emit_rep.vl`, exported.
- `buildStructTwins` walks each row's key bucket in ascending order instead of every earlier row.
  The first twin found is the same smallest earlier row, so `sTwin` is unchanged.
- `structHeapKeyDeclined`: under `$VL_REP_SHADOW`, a same-key pair that `structFieldCodesEq`
  declines must fall in a kept class (a field one row stores as a closure, a row at a type
  variable, a row that may hold a function), else `emitFail`. Unarmed, it is one boolean test.
- `repRowsFnFieldDiffer` moves from the heap shadow to `emit_rep.vl`, so the shadow's
  `function field` class and the key's check are one predicate.

## Proof

- `corpuscmp` against a master fixpoint seed (12121cdbe): 8,424 modules, 0 DIFFER, 0 LOST.
- The probe, armed, over the 20,588-file corpus: fires on none.
- Failing control: with the three class exemptions removed, it fires on
  `tests/cases/closures/hole-fn-nested-list-in-record-field.vl` (a same-key pair the element
  descent declines), where the candidate is silent.
- Seed fixpoint.

## The map-value table's 32 merges

The heap shadow counted 32 map-value merges in 32 files (one value type, two map heap types). All
32 are a string-keyed and an i32-keyed map of one value type, measured by splitting each merge on
`mvSlotKeyKind`. A map's keys list is part of its struct, so the two stay apart, rightly. The
shadow now keys a map-value row by its key kind as well as its value's rep id, and those 32 read
as distinct rows.

## Cost

None measurable: the struct twin pass was about 0% of the self-compile before
(`2026-11-16-rr-names-key-memo.md`).
