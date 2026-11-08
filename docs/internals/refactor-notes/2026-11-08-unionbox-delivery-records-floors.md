# A `??` join yields to a delivery's record; 18 more positions read the table; named floors (2026-11-08)

Step 5, union boxing round 6. Follows `2026-11-08-unionbox-instance-coalesce-join.md` (#6790).

## A node's box record is its delivery's

`recordBoxTy(binLeft, join)` overwrote the record the left operand's own delivery had written
(the 20 last-write misses #6790 counted). It is now `recordJoinBoxTy`: a join's write yields to
a standing delivery record, and a later join still replaces an earlier join's
(`nodeBoxJoin` / `elabCapBoxJoin` mark which kind wrote it), so an instance's pinned join still
wins over its template's. Alone: sweep byte-identical.

## The shadow grades unswitched positions only

A position the table serves (`emitUnionBoxOwed`) is graded by the sweep. Its deliveries count as
`table`, or as `floor: <why>` (`boxFloorWhy`: already a box, never returns, no record, `rep <kind>`
for a niche or literal-set record, no row), via `boxDstShadowAs`. `run.sh` fails on a floor that
`scripts/box-dst-shadow/floors.tsv` does not list for its position, and prints listed floors no
longer seen, so a floor leaves the list in the PR whose record covers it.

## fn-tag dispatch: the record had no registry row

All 29 deliveries agreed but floored. The reason was not `instTyOrSelf`: `string|i32` is a
call-result union no declaration registers, so `unRowOfRecordTy` is -1 and `boxRecordNameOf` "".
A value union boxes by its members' tags alone, so `boxRecordNameOf` now falls back to its
spelling (`unionSpellingOfTy`). A nullable function set, whose value is its member tag, names
`i32|null`. That removed the 182 global-init and 117 let-init "renders empty" floors (record
`((_) => _) | null`, site `i32|null`). All of it was byte-identical.

## Positions switched

18 site-union calls now go through `emitUnionBoxOwed`: `emitNulMapArmBox`, `emitMapGetOrUnionBox`,
`emitMapGetOrScalarBox`, `emitMapSetValExpr`, `emitNulArmToLocal`, `emitAssignIdent` (the
`emitUnionCoerce` branch), `emitLetInitValue`, `emitPrintValueUnion`, `njStash`,
`emitDirectArgValue`, `emitCapturedCall`, `emitCoalesceBoxRuntime`, `emitOptCoalesceBoxLeaf`,
`emitCoalesceValUnionIdent`, `emitCoalesceCallStash` (2), `emitCoalesceUnionField` and
`emitCoalesceNullableRefs`. What calls the helpers now:

| helper | callers |
|---|---|
| `emitUnionBoxArg` | `emitCoerced` (the table), the floor of `emitUnionBoxOwed`, `emitUnionBoxAtRecord` ×2 |
| `emitUnionCoerce` | `emitUnionBoxArgGo`'s last rung |
| `emitVariantCoerce` | 8 sites that BUILD a bare variant. That is a build, not a coercion, so it stays outside the table |

The 7 `emitUnionBoxAtRecord` positions read the record first. Their own-union and site floors
are not tagged yet. One of them still grades `no record` (`emitIdxStoreValue`, `v128|null`, 10).

## Floors that stand (shadow, 116,531 deliveries)

23 rows in `floors.tsv`: already a box 193 + 79 + 57 + 20 + 8 + 4 + 2 + 2; never returns 75 + 5 + 5 + 2;
`rep i32` (an `i32|null` niche record) 122 + 4 + 4 + 4 + 2; `rep nulbool` 5; `rep nulvariant` 1;
no record 16 + 10 + 2; no row 5 (`K|i32|null` 4, `i32|AB|null` 1, at `emitDirectArgValue`). The
floors are niche, literal-set, already-box or never-returns records. Only the 5 rows with no row
and the 28 with no record are record gaps.

## What the unbox side needs

The narrowed-arm unbox (`emitNarrowedArmUnboxTo`, 16 calls) is handed a heap index that each site
derives. It needs a record of the arm each narrowed read unboxes to, beside `elabCapNarrowed`'s
storage type, and a shadow that compares the site's heap with that arm's heap. Atom→string
(`emitAtomToStr`, 18 calls, and `emitAtomToStrChain`, 10) decodes tags against a union each site
names. It needs a SOURCE recorder: the union a read's box was built at, the read-side twin of
`boxDstTyAt`. It needs a shadow too.

## Proof

Fixpoint seed 6,516,920 bytes. Base, master `3ede28b4` at its fixpoint, is 6,515,515 (+1,405).
Refresh twice, byte-identical. Sweep base against candidate: 23,649 same, 1 bytes-only, 0 output
movers, 0 `runs → not-runs`, 0 new traps. The mover is
`named/d3127_r2_g1_F4_i32_ab_1_943_i32_print_hole.vl` (`p.a[9] ?? p.a[4] ?? p.b[3]`). A nested
delivery under the chain was boxed at its site's `i32|null` while its record says `i32|AB|null`.
The table now boxes it at the record. The output is the same, and the module is +32 bytes.
