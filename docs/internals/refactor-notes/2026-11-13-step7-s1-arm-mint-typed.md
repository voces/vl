# S1: an arm mint interns its row at the arm's type, 2026-11-13

Lane A, S1 of the step-7 close: the union-arm mints that reached the inline-shape interner with
no type (`tyIx` -1). After #7768, `internArmShapeRow` mints only when the arm's type has no row
yet, and that fresh mint was the only caller passing -1 (confirmed with lane E). Emit only.

**The change.** The fresh mint calls `internInlineShapeTy(nm, aty)`, so the row is interned at the
arm's type, as every other mint's is. Before, it called `internInlineShapeFieldsTy(nm, -1, aty)`.
The D34 comment that kept the type out of the row is deleted. An arm is now a reference to its
type's row (`uVarRow`), so a row banked at the arm's type no longer turns off D34's map-value
decline: D34's witness prints `7` under this change.

**Probe.** Each decision in `internInlineShapeTyGo` that reads `tyIx` was computed both ways at
every arm mint (`aty` against -1), over 24,140 programs: 2,986 arm mints in 2,287 programs.

| decision | mints that differ |
|---|---|
| `shapeFieldsRideTyParam` | 0 |
| `annShapeLayoutRowOf` | 0 |
| `annSameTypeRowOf` | 0 |
| `structTyIxAlias` on a found row | 2 |
| `shapeIsAVariant` (gates the wider-row merge) | 2,984 |
| the `sTyIx` banked at the push | 2,984 |

`shapeIsAVariant` flips at every mint, but it only gates the wider-row lookup, which never
answered for an arm mint (all 2,984 reached the push). The banked `sTyIx` is the intended change.

**Sweeps.** Fixpoint seeds on both sides, 24,215 programs.

| sweep | same | bytes-only movers | output movers | runs → not-runs | new compiler traps |
|---|---|---|---|---|---|
| plain | 24,201 | 14 | 0 | 0 | 0 |
| armed (`VL_OPAQUE_SNAMES=1`) | 24,179 | 33 | 3, all now running | 0 | 0 |

The 14 plain byte movers reorder the type section only: the same type count and module size, with
two types exchanging indices. They are the D411, D741, D814 and D851 distilled cells,
`spread-boxes-nested-and-pushed`, `inferred-return-narrowed-arm` and the two
`nullable-variant-list-element-inferred` cases. The armed sweep ran on a host built after #7661;
D12340's witness builds to different bytes armed and unarmed and prints `6` both ways.

Armed, the three output movers are programs that failed before and now run:
- D15151's witness and `unions/struct-holding-arm-with-record-map-value` were invalid modules.
- `maps/narrowed-map-place-object-value` was refused as `map-value layout twins resolved different
  vals wrappers`.

Each now prints its expected output, armed and unarmed. With opaque labels, an arm's unlabelled
row was the one the map-value and twin lookups could not find by type; a row carrying its type is
found. The 33 armed byte movers are the same type-section reordering as the plain ones.
