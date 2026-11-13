# Step 7 (lane D, D16032 (3b)): the member-set readers read the row only, 2026-11-13

`msSetOfRowOr(u, name)` read row `u`'s member set, else the set of the row `name` is bound to.
Once the hole binding's `T | null` box carried its row (#7877), the name path resolved nothing:
a probe of every call over the 24,070-record population found it taken in 246 programs (868
decisions), each finding no row by name either. When `msSetOfUnion(name)` misses, the result is
-1, the same as `msSetOfRow(u)`.

All 13 calls now read `msSetOfRow(row)`, and `msSetOfRowOr` is deleted. The thirteenth, in
`sharedUnionFieldPlan`, is lane G's; G asked for it to be folded in here. Names that only fed the
fallback go too: two bound-but-unread results in `exprHasStrOp`, and `njKindsOfUnion`'s
`unionName` parameter.

## Measurement

| probe | programs | decisions |
| --- | --- | --- |
| name path taken, finds a row (before #7877) | 7 sampled, all through `njKindsOfUnion` | 28 |
| name path taken, finds a row (after #7877) | 0 | 0 |
| name path taken, finds nothing (after #7877) | 246 | 868 |

**Byte comparison:** #7877's head against this change, 4,772 of 4,772 programs build identical.
They are the union of the populations reaching `emitUnionCoerceUnder` and `letNulScalarBoxName`.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`, the inventory tests.
