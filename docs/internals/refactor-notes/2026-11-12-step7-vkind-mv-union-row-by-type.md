# Step 7, lane H: a map's union value slot by its row, 2026-11-12

`mvShapeOfValNameArmTyGo` (`emit_union_atoms`) interns a map's value slot. For a union value,
it looked up the row its value type keys (`unRowOfTyAB`) and the row its spelling names
(`unRowOfName`). It kept the spelling when both named the same row, and otherwise took the
type's row name. The slice came from lane G's split.

## Probe

A scratch compiler ran over 24,070 programs, with a control tag on each:

| the type's row | the spelling's row | programs |
| --- | --- | --- |
| found | the same row, spelled as the row's name | 185 |
| found | none | 95 |
| found | the same row, spelled otherwise (the spelling was kept) | 63 |
| found | another row | 0 |
| none | — | 0 |

## The change

The slot always takes the name of the row its type keys. With no row (unreached in the corpus),
it falls back to the canonical row of the value's type, as before, without first asking the
spelling. `unRowOfName` leaves the function.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `819f4093` against this, fixpoint seeds on both sides):
  0 output movers, 0 `runs → not-runs`, 0 new compiler traps, and 5 bytes-only movers:
  - `maps/inferred-map-literal-record-list-union-narrowed`
  - `soundness/narrowed-write-join-keeps-numeric-members`
  - `unions/narrowed-container-read-unboxes-at-checker-type`
  - `unions/nullable-collection-of-variant-box-arm-field-union`
  - `unions/value-union-niche-survivor-delivery`
- **The movers, built alone and disassembled:** each module is the same size, and the type
  section holds the same types in another order. The slot's union label is now the row's name
  rather than the kept spelling, which changes the order its types are interned in.
