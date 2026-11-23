# IR: a map under its map arm's tag (2026-11-21, lane IR-N2)

The second `box ladder` rung by size is a value with no primitive type. Of its functions, maps
are 42 alone and 28 more in combinations (corpus and `tests/cases`). Legacy boxes a map through
`emitUnionMapArmBox`, after the map-read rung: the map arm's tag (`mapBoxTagOf`), the map, then
`struct.new`.

## The change

- **Plan.** `HoleBoxArm` gains `map`. `holeBoxPlanOf` answers it, right after the map-read rung,
  for a map whose shape has an arm slot in the union (`unionHasMapArmSlot`). Its `hbKind` is the
  union type. The plan reads no tag: that is minted where it is written.
- **Shared writer.** `holeBoxHead`'s `map` arm is `mapArmBoxHead`, the tag through
  `mapBoxTagOf`. `emitUnionMapArmBox` writes its non-null case through the same head, so legacy's
  bytes are unchanged; its nullable case is as it was.
- **IR.** `boxPlanWhy` takes a map rep for the arm, and `boxOp` reads the operand between head and
  tail.
- **`box of an assignment`.** `tests/cases/maps/join-of-two-map-types.vl` boxes `ga = mkA()`.
  Legacy writes the tag ahead of the store. The builder writes the store as a statement first. That
  holds for every arm that writes a tag, so such a value is a named miss for all of them.

## Witness

`tests/cases/unions/map-boxed-under-its-map-arm.vl`: a map returned into and bound to a
`{[string]: i32} | i32`. Row file `tests/ir-shadow-rows/map-box-arm.vl`.
