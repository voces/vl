# Rep ADT stage 4a: the heap-identity shadow, 2026-11-16 (lane REP)

Stage 4 of [the rep ADT design](2026-11-14-rep-adt-design.md) interns heap types by rep
(`heapOf`). Today emit keys its heap tables (struct rows, ref-list rows, map-value slots, union
rows) by spelling or name. `compiler/emit_heap_shadow.vl` is a default-off instrument
(`$VL_REP_SHADOW`). At the end of emit it groups each table's rows by the `tyRepId` of their arena
type and counts each row whose rep id an earlier row already has. That row is a merge a rep-keyed
`heapOf` would make. For struct rows, a merge is split by whether the two rows store the same
layout: field codes and element names, in order.

## Readings

Current master, armed, over `tests/cases`, `std` and the distilled `cells/` and `named/`:

| table | rows | merges, same layout | merges, **different** layout |
|---|---|---|---|
| struct | 22,498 | 1,016 in 491 files | **151 in 31 files** |
| ref list | 10,957 | 13 in 9 | 0 |
| map value | 3,786 | 32 in 32 | 0 |
| union | 18,754 | 0 | 0 |

The self-build has 6 struct and 3 map-value merges, all with the same layout.

**All 31 files with different-layout merges hold function sets inside records.** Examples:
- `d15209_nested_rec_dbl`, `_half`;
- `fn-nested-record-field-list-written`;
- `maker-returns-record-holding-bound-list-of-fn-records`;
- `hole-fn-records-of-different-results-set-into-map`.

In each, two rows share a `tyRepId` (the layout canon), but one stores a function field as a
closure and the other as a set id. `tyRepId` does not see function storage. This is D16721's gap
one level up.

**No merge changes bytes today.** The rows are still keyed by spelling, so nothing here is a
clause-1 finding. Lane HASH's 101 rep-id/rep-tree-node merges
(`recursive-nullable-alias-reassign`, `-list`, `litunion-nested-union-arm-module-global`,
`union-arg-into-generic-union-return-module-scope`) produce no emit-row merge.

## What this decides for stage 4

A heap identity of `tyRepId` alone would fuse the 151 different-layout pairs, which is clause 1 by
construction. Stage 4's flip therefore waits on lane SLOT's slot-store stage 3, which makes a
function field's `RClosure` or `RSetId` part of its rep (the same dependency as 3c-iv step B, 3e
and D16722). This counter then grades the flip:
- The different-layout count must reach 0 before any table is keyed by rep.
- The 1,061 same-layout merges (struct 1,016, ref list 13, map value 32) are the type-section
  movers the flip names.

## Cost

Unarmed, the sweep is one boolean test, and the seed reaches a fixpoint. The gate's distilled
corpus row checks the corpus.
