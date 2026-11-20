# IR: an object literal's struct field arms, and a literal built at its destination's row, 2026-11-20

`fieldPlainWhy` took only `structFieldArmOf`'s `plain` arm. Every other arm missed as
`object field <arm>`. In the corpus census on master `c13255ce8`, the arms that block a function
alone are union 107, armDelivery 102, explicitNull 87, f64 62, f32 19 and i64 17, spread over
many origin grids.

## The change

- `fieldArmDelivers` admits the `union`, `f64`, `i64` and `f32` arms. Each is built by `deliver`,
  which widens through `widenPlanOf` (legacy's `emitWidened`) and boxes through the hole box plan
  (legacy's `emitUnionBoxOwed`, by `emitDelivered` or `emitUnionBoxArg`).
- `fieldArmRepFits`, an exhaustive match over `StructFieldArm`, requires the literal's field rep to
  be the slot the arm writes. A literal can be built at its destination's row, and that row boxes
  or widens where the literal's own type does not.
- A box value into another union's box field stays legacy's ("object field box from a box"): legacy
  converts the members, and the box plan's `pass` would keep the wrong tag.
- A struct literal legacy builds at its destination's row is built at that row through #9220's
  `objLitAt(…, row, false)`, at the row's own type `sTyIx[row]`.
- `objLitAt` with an explicit row types its temp at that row's type (verifier rule 3); STORE asked
  this branch to carry it.

Compiler lines are about +65 −17 against #9220's head, all in `ir_build.vl`. No legacy line is
deleted or moved.

## Readings (base #9220's `4a300d8c9`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| self-compile functions claimed (mode 5) | 17,271 | 17,279 (+8) |
| corpus covered = verified = matched (shadow) | 39,609 of 45,678 | 39,735 (+126) |
| corpus `object field union` / `f64` / `f32` alone | 107 / 71 / 20 | 0 / 0 / 0 |
| L2 self-compile fuel | 101,230,721,025 | 101,235,276,813 (+0.005%) |
| seed size | 6,862,607 | 6,863,360 (+753 bytes) |

Before `fieldArmRepFits`, `ir-identity --cases` showed 20 differ: 19 failed to validate and one hit
a cast-failure trap.
