# IR: an object literal stored into an arm-valued map (2026-11-20)

`map store value variant` was the largest unowned corpus class alone (662 on master `9b1c4a05a`):
a map store whose map holds one variant arm (`mapSetValArmOf` `variant`), which legacy writes
through `emitVariantCoerce`. Split by the coerce's arm (`variantCoerceArmOf`, #9209), every
function alone was the `struct` arm, `m[k] = { …literal… }`. On its own such a literal mostly
builds as a struct (`objLitArmOf` `struct`), but the coerce builds it at the slot's variant row
(`emitVariantStruct(ix, mvValVariantOf(slot))`).

## The change
- **The row.** `objLitVariantLayoutAt(objIx, vi)` is `objLitVariantLayoutOf`'s layout check at a
  given row; `objLitVariantLayoutOf` now delegates to it, so legacy's bytes are unchanged.
- **The IR.** The map store takes the `variant` arm where `variantCoerceArmOf` is `struct`; its
  value is the object literal built at the slot's variant row (`objLitAt`, the object-literal
  builder at an explicit type and row), at the rep of the slot's value type (`mvValTyIxAt`).
  `RMakeRec.mrRow` carries the row to the lowering, which writes `variantStructNewTail` of it.
  Every other coerce arm is a named miss (`map store value variant <arm>`).
- Each field still goes through the variant field writer's own arm (`fieldPlainWhy`), which DEAD
  owns; its non-plain arms are the layer this exposes.

## Measured on fixpoint seeds: master against this branch
MEASURE

## What is left
- `object variant field box` / `f64` / `i64`: the variant field writer's non-plain arms (DEAD).
- The other coerce arms (`bare`, `box`, `ifValue`) block nothing alone on the corpus today.
