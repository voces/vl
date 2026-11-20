# IR coverage: an object literal boxed as another variant arm (2026-11-20, lane IR4)

The `box literal arm` miss counted 22 self-compile functions and 45 in tests/cases. By origin:
unions 20, closures 6, generics 5, std 4, lists 3, and 1–2 each in types, inference, soundness,
records and objects.

It fired in `boxTemp` when the box plan's arm was `obj` but the literal's own variant layout
(`objLitVariantLayoutOf`) was not `p.hbKind`. An example is `{ t: 1, b: 4 }` delivered into
`AB | null`. Legacy's `emitHoleBox` `obj` arm writes three things:

- the tag, `uTags[hbKind]`;
- `emitVariantStruct(lit, hbKind)`, the literal built at the arm's row;
- `struct.new` of the box.

## What changed

- **`deliver` builds such a literal at the arm.** When a box is owed and `boxLitArmRow(ix)` names a
  row, the literal is built by `armLit` and boxed by `boxTempAt(…, row)`. `boxLitArmRow` holds when
  the node is an `ObjLit`, the plan arm is `obj`, and its row is not the literal's own layout.
  `armLit` calls `objLitAt(b, lit, repNodeOfTy(uVarTyIx[vi]), uVarTyIx[vi], vi, true)`, the call
  `mapVariantLit` makes for a map slot's variant row. `uVarTyIx` is the type the row was
  registered from.
- **An open row type misses.** In a generic instance, an arm row whose type still carries a
  variable misses `open box literal arm type`.
- **`boxTemp` is `boxTempAt(…, -1)`.** The layout check compares the row the record was built at,
  so `box literal arm` remains for any other disagreement.

## Why this is `emitVariantStruct`

- **Its plain layout writer and its order stash** are `objLitVariantLayoutAt(ix, vi)` and
  `objLitVariantStashAt(ix, vi)`, the two rows `objLitAt` takes.
- **Its drop path** (`variantLitDrops`) needs `objLitBuildVariantRow(ix) == vi`, so it is never
  taken at another arm. Both readers refuse a literal with a field outside the row, so the IR misses
  `object layout`.
- **The legacy hazard is unreachable.** Legacy's layout loop would skip such a field's initializer,
  but the checker refuses that literal first: "this object literal sets `c`, which B does not
  declare … a call there would never run".
- **Spread and shorthand.** VL has no object spread. A shorthand field (`{ t: 2, b }`) builds the box
  and then stops at the later `null test boxTag` miss.

## Grading

Fixpoint seeds: #9291's head (05c3140438) against this branch's head.

| | base | head |
|---|---|---|
| self covered = matched | 18,844 | 18,869 |
| self `box literal arm` | 22 | 0 |
| corpus covered / matched | 95,256 / 95,242 | 95,292 / 95,278 |
| corpus `box literal arm` | 45 | 0 |

The verifier-fail and claimable-unmatched rows are the same 15 on both sides.

Witnesses:

- **`object-literal-boxed-as-another-arm.matrix.vl`** runs 64/64 under both seeds: `box literal arm`
  5 → 0, covered 67 → 71, and no cell moves runs → not-runs, silent, trap or wrong value.
- **tests/cases/unions/box-literal-other-arm-generic-instances.vl**: both instances are matched.
- **tests/cases/unions/box-literal-other-arm-shorthand-field.vl** reaches the later named miss and
  runs.

| bar | result |
|---|---|
| `ir-identity --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity --cases` | identical 7,532, differ 0; witnesses 59/59 |
| base-vs-head tests/cases A/B | 7,600 programs, 7,532 built, differ 0 |
| mode 3 | identical; 18,853 claimed (base 18,825) |
| L2 fuel, candidate vs base fixpoint | +0.024% (104,128,197,308 → 104,153,324,904) |
| plumb-shape cost | ok |
