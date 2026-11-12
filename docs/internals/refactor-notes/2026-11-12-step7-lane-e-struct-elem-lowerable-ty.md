# Step 7 L2: a closure-result list field's element is judged by its type (28 → 27 parses), 2026-11-12

Lane E, cut E3. `structElemArrayLowerable(t, ty)` (`emit_shape_intern`) decides whether a ref-list
field of a closure-result record lowers: is the element a declared plain struct, or an inline
shape that `funcTypeShapeLowerable` admits? It answered from the field's spelling. It cut the
`[]` off the spelling, peeled grouping parens, then peeled a `| null` with `nullablePartOf`, one
render-parse site. Its only caller is `funcTypeShapeLowerable`, which holds the field's recorded
type `fTy`.

## Probe

A scratch compiler, never refreshed into a seed, computed both answers at the call. It raised a
distinctive `emitFail` on every reach, and another on any disagreement. The typed answer took the
element type with any nullable peeled. Its name was the nominal name, or else the walk key
(`shapeWalkKeyOf`). An inline shape went to `funcTypeShapeLowerable`, and a name went to
`nameIsStructDecl` and `variantIndexOf`.

Over the sweep's 24,186 programs, the site is reached in 12. The first draft asked "has a nominal
name" before "is an inline shape". It disagreed in 4 of the 12: `tyToNominalName` answers an
anonymous record's own spelling, so `{f: f64}` read as a declared name. With the shape test first,
the two answers agree in all 12.

## Changed

`structElemArrayLowerable(ty)` takes only the field's type. Its spelling peels, and its
`nullablePartOf`, are deleted.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `b08c0903` against the candidate: 24,186 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass, on the branch and on the tree merged with master `46ebbb50`.
- Render-parse with `--findings`: 13 renders, 28 → 27 parses (`emit_shape_intern` 2 → 1). The
  `--write-baseline` is in this PR.

## What stays in `emit_shape_intern`

- **`iisPushFieldElem`'s `refArrElemName`.** It records `sFieldElemName`, the name a ref-list
  slot is found by. That is the ref-list key's owner (lane F).
- **The three renders.** These are `internShapeDeepOfTy`, `shapeWalkKeyOf` and
  `internArmShapeRow`. They stand while the struct table `sNames` keys rows by name.
