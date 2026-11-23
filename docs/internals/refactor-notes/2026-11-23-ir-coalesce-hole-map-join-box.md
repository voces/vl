# IR coverage: `??` over hole map reads joined into a union box (2026-11-23, lane IR-N2)

These are the d3127 cells IR-N6 and IR-N9 handed over: `p.a[k] ?? p.b[k]` and `(m[k] ?? m[k]) ?? d`
in a hole instance. Legacy writes each as a null-test `if` whose arms box into the join's union.

## Design

- **Box plan.** `holeBoxPlanOf`'s map rung returned `mapReadBoxPlanOf`'s `ladder` for every map
  read it did not box as a scalar. Legacy's map-get rung takes only a union-valued map
  (`unionBoxArgGoMapRead`). A read of no union value (`!exprUnion`) now takes the plan's
  rungs below, as legacy's ladder does. #9662 opened this only for a literal-union read.
- **Boolean niche atom.** The plan's atom rung admits a `boolean | null` read at the boolean atom
  (its niche's 0/1), as legacy's writer boxes it.
- **Union `if` arm.** `unionIfArm` boxes an arm that `deliver` leaves unboxed, with
  `boxTempIn` at the `if`'s union, as legacy's `emitUnionIfValue` boxes every arm
  (`emitUnionBoxArg`). The checker records no box for an inner `??` operand.

The box plan is shared with legacy, so 9 programs' legacy bytes move. Each prints as before; they
are listed in `2026-11-23-ir-coalesce-hole-map-join-box.moved.txt`. A bare map read that misses
still boxes as `null`.

## Legacy tails the IR calls

- None new. `boxTempIn` writes through the existing `RToBox` lowering.

## Measured

To be filled in from the proof.

Open: 11 cells stop at `rep ?`, a minted node with no type in the hole instance. 4 stop at
`coalesce mapScalarJoin`.
