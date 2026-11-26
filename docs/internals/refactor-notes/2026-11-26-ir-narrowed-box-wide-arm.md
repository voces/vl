# IR box ladder: a narrowed box re-boxed under a wider arm (2026-11-26, lane COV-IS)

- **The miss**: `box ladder` where a box narrowed to one arm (`u: D | B` past `u is D`) is delivered
  into a union one of whose arms its record is wider than (`Pet = A | B`, `D` beginning with `A`'s
  fields). Legacy's `emitUnionWideArmBox` writes `A`'s tag, the box, its payload (`struct.get`) and
  a new box: the same reference under the arm it subtypes (`narrowBoxWideArmOf`).
- **What landed**: `holePassPlanOf` names a `narrowBox` arm (the wide arm in `hbKind`) where it
  laddered; legacy reads it as its ladder (`unionBoxArgLadders`), so its bytes do not move. The
  plan's head is the arm's tag and its tail the payload read and box. `deliver` reads such a name at
  its storage (`storageReadEnter`), the box, as legacy reads it.
- **Parity**: `ir-parity.vl --files` reads `same` on the sweep and on
  `objects/record-wider-than-union-arm-boxes-under-arm.vl`. Where legacy's ladder reaches its whole
  box retag first (D15057's tag test, re-boxing only a `D`), the IR re-boxes directly: the box is
  narrowed to `D`, so the test always takes that branch.
- **Q58 position sweep** (`tests/cases/unions/narrowed-box-reboxed-under-wider-arm-positions.vl`,
  new): bound, passed, returned, assigned, in a list and at the top level. Master: 5 functions and
  the start body `box ladder`; here all claimed.
- Left: `objects/record-wider-than-union-arm-boxes-under-arm.vl`'s start body moves on to `box niche
  with no arm`.
