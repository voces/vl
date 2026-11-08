# The box record's write order, graded; variant fields read it (2026-11-08)

Step 5, union boxing round 3. Follows `2026-11-08-unionbox-record-leak-arguments.md` (#6759).

## The shadow carries each node's write history

`scripts/box-dst-shadow/probe.sh` now also patches the probe's checker. Every `boxTyStampOne`
write is logged in order, per program (`nodeBoxTyIx`) and per instance capture (`elabCapBox`,
banked under the instance key). Each write is tagged with its recorder: `ctx` (a contextual
stamp), `join` (`recordBoxTy`, a `??` operand) or `exit` (`boxExitsStamp`). Where the node a
delivery reads holds more than one union, the row gets `| hist first= last= join= any= : <trail>`:
whether the first write, the last write, and the join of every write each agree with the site's
union. The site's union is what the emitted delivery uses today, and the sweep runs it.
The VL half is `hist.vl.in`.

## The grade (fixed seed, 111,367 deliveries, 23,615 programs)

Of 56,702 top-level deliveries, **513 in 166 files** read a node written with more than one union.
Of those 513 (`ctx>ctx` means two contextual stamps in a row):

| writes | deliveries |
|---|---|
| `ctx>ctx` (or longer) | 470 |
| involve a `join` | 22 |
| last write agrees with the site | 469 |
| last write misses the site | 43 |

When the last write misses, the earlier write is usually the one that agrees:
- **27**: a later write names an open type parameter and renders empty, after a closed one
  (`generics/union-list-literal-to-generic-union-param`, `list-param-union-with-type-param-length`).
- **7**: values already a box, so never boxed (6 a `??` join after a contextual stamp).
- **9** disagree: 8 an inline literal union spelled through its alias (`string|i32` against
  `K|i32`, `D6950`) or a closed union after an empty write; 1 a real member conflict, `f64|null`
  then `i32|null` (`lists/list-literal-eq-across-element-storages`).

First-write fails about 300 of the 469 deliveries where the last write agrees, and a join about
280: the later write is a refinement (`i32|string` then `i64|string`, `string|i32` then `K|i32`).
**So last-write is the only one of the three policies the delivered unions support.** A per-role
record does not separate the conflicts, because 470 of 513 are the same recorder twice: they are
re-checks, not two roles.

Decision needed (not made here): make the record "the final check's", which is what last-write
already computes for every refinement row. That still needs a rule for the misses: a write naming an open type parameter must not replace
a closed record (27), and the `f64|null` conflict needs its own ablation.

## Which positions are affected

Positions where no delivery reads a node with history do not depend on the policy at all.
The positions in this lane with 0 history rows are variant fields (1,100), `emitAssignIdent`
(425), struct-field store (202), map default (49), fn-tag dispatch (29) and const-cell init
(1,812). The ones that do depend on it are returns (30 rows), struct-field value (42), arm-to-pair
(112), array elements (305) and `emitUnionIfArm` (11).

## Variant fields read the table

`emitVariantFieldValueUnder` and `emitVariantFieldStoreVal` share `emitVariantFieldBox`. It calls
`emitDelivered` where `boxOwedAt` holds, and otherwise uses the field's own union. A first cut with
no floor lost 2 programs (`inventory/D4268`, `unions/shared-nullable-literal-field-read`): a
nullable-literal field (`v: 1 | null`) is recorded `i32 | null`, which `boxOwedAt` reads as a
nullable niche, while the variant stores a box. **The shadow's `agree` does not imply
`boxOwedAt`.** The shadow re-run gives the floor exactly: 4 deliveries in those 2 files. The
other 1,096 are boxed by the table. Union-box call sites deleted: 0 (two become one floor call).

## Proof

Fixpoint seed 6,499,782 bytes (+38 against the base fixpoint, 6,499,744 at #6759 merged; refresh
twice, byte-identical). Sweep base against candidate: 23,615 same, 0 bytes-only, 0 `runs → not-runs`,
0 new traps. Shadow class totals unchanged except one row moving from `agree up to spelling` to
`agree`.
