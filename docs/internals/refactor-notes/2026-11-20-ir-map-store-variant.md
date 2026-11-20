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
- **The row.** `objLitLayoutRowAt(objIx, si)` is the struct twin, which `objLitLayoutRowOf`
  delegates to. `RMakeRec.mrRow` names the row a destination builds the literal at, a variant's
  (`mrVariant`) or a struct's, -1 for the literal's own; the lowering writes that row's
  `variantStructNewTail` or `objStructNewTail`. DEAD's struct destination rows build on it.
- **The IR.** The map store takes the `variant` arm where `variantCoerceArmOf` is `struct`; its
  value is the object literal built at the slot's variant row (`objLitAt`, the object-literal
  builder at an explicit type and row), at the rep of the slot's value type (`mvValTyIxAt`).
  Every other coerce arm is a named miss (`map store value variant <arm>`).
- Each field still goes through the variant field writer's own arm (`fieldPlainWhy`), which DEAD
  owns; its non-plain arms are the layer this exposes.

## Measured on fixpoint seeds: master `9def19204` against this branch

| | master | this branch |
|---|---|---|
| distilled functions claimed (`--claims`), all matched armed | 39,211 | 39,556 |
| distilled `map store value variant`, alone / any | 694 / 755 | 0 / 0 |
| self-compile functions claimed | 17,271 | 17,271 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,516 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 101,190,932,169 → 101,230,491,001 (+0.04%).
- **Lines:** +90 / −14 in `compiler/`.

## What is left
- `object variant field box` / `f64` / `i64` (342 / 55 / 50 distilled alone): the variant field
  writer's non-plain arms, DEAD's.
- A temp built at a destination row whose type differs from the literal's own is typed at the
  literal's (`irBLetTemp`); no caller here differs, and DEAD's struct rows carry the fix.
- The other coerce arms (`bare`, `box`, `ifValue`) block nothing alone on the corpus today.
