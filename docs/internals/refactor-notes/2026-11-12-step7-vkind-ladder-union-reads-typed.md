# Step 7, lane H, cut 3: the field-code ladder reads no spelling, 2026-11-12

After cut 2 (`2026-11-12-step7-vkind-field-code-ladder-declined-only.md`, #7619), the field-code
ladder held two spelling reads. Both answer code 16, the union box:

- `isValueUnionName(t)`;
- `isUNameDeclAB(75, t)`.

Lane G (the union registry) named the typed readers. Lane G also handed over one caller of its
text parse `unionSetAtomsOf` in this lane's file: `mvUnionIsScalarNull` (`emit_map_value_slots.vl`).
This cut switches all three to the type.

It stacks on #7619. The base is #7619's head merged with master `1b63c74a`. Both seeds are
fixpoints.

## Census

The probe compiler was scratch, never refreshed into a seed. Its accumulator was emptied per
program and the channel was checked against a control. The population is the sweep's, 24,070
programs. Each count below is of programs, at the point the spelling read runs.

| read | programs | the spelling says | the candidate typed read says |
| --- | --- | --- | --- |
| `isValueUnionName(t)`, `t` = `i32\|null` | 9 | yes | `isValueUnionTyOr(fty) == 1`: **no**; with a nullable numeric literal set: yes |
| `isValueUnionName(t)`, `t` = `i64\|null` | 1 | yes | the same |
| `isValueUnionName(t)`, a literal set (`U`, `D`) | 2 | no | no |
| `isUNameDeclAB(75, t)` | 2 | yes | `isUNameAB(75, fty)`: yes; `unRowOfTyKey(fty) >= 0`: yes |
| `mvUnionIsScalarNull`'s split | 2 | yes | yes |

**The 10 disagreeing programs: literals.** In each, the field's type is
`(lit:int | lit:int) | null`, a nullable numeric literal set. Its spelling is the softened
`i32|null` or `i64|null`. `isValueUnionTyOr` keeps the literals, so it does not call this type a
value union. The spelling does, and the box is what the field stores, because a nullable number
is the value box. The rep descriptor declines this type: its nullable arm leaves a literal
member to the ladder. So the typed arm adds that case, `tyIsNulNumLitSet`.

## What changed

- **The ladder** (`nameFieldCode`, renamed `fieldCodeOfDeclinedTy(ty)`) takes no field text. Its
  box arms are:
  - `isValueUnionTyOr(ty) == 1 || tyIsNulNumLitSet(ty)`;
  - `isUNameAB(75, ty)`, which keeps the A/B site number.
- **`mvUnionIsScalarNull`** finds the scalar member from the map value's type: the non-null
  member of a nullable type, or of a two-member union with `null`. It grades that member with
  `tyValueAtomKindOf`, the file's typed twin of `valueAtomKind`. The `unionSetAtomsOf` split and
  the `valueAtomKind` read are gone.

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds on both sides): 24,178 same, 0 bytes-only movers,
  0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **Seed:** 6,722,350 → 6,722,879 bytes (+529), a fixpoint.
- **Callers:** `isValueUnionName` loses 1 (34 left), `isUNameDeclAB` loses 1 (7 left) and
  `unionSetAtomsOf` loses 1 (28 left).
- **rep-classifier-census:** NAME call sites 70 → 69; SPELLING call sites 9 → 8.
- **render-parse** is unchanged at 13 renders and 32 parses. `unionSetAtomsOf`'s parse is
  counted in its own body, which still has callers.

## What is left of the ladder

No arm reads a spelling. `nameFieldCodeTy` still takes the field text for one rung: the
structurally-equal union row (`unRowOfCanonFolded`), which keeps a spaced spelling off the
compact struct lookup. That rung is lane G's.
