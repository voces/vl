# IR coverage: atom map reads into a hole box, field casts, the boolean join (2026-11-23, lane IR-N2)

A second coalesce batch, one commit per mechanism. It starts from IR-N9's box-ladder cells.

## Design

- **Atom map read into a box.**
  - `holeBoxPlanOf` answered `ladder` for every map read that `mapReadBoxPlanOf` does not box
    as a scalar.
  - Legacy's map-get rung takes only a union-valued map (`unionBoxArgGoMapRead`), so a
    literal-union read reaches its atom rungs (`atomAsStr` / `atomStr`). The plan now
    continues there too.
  - The verifier's `RMapGet` admits a boxed scalar read (`mtBox`) at the box of the union it
    delivers to.
- **`holeMap`.** The arm builds `coalHoleMapIfOf`, legacy's `coalHoleMapReadNullTest`, as a
  valued `if`, plain or delivered into a box.
- **Field cast.**
  - `coalArmRecvCast`, split out of `emitCoalArmRecv`, follows each receiver read in
    `coalUnionField`: a narrowed box's payload is cast to its arm, and a null-tested nullable
    record is asserted non-null.
  - The builder reads such a box at its storage (`storageReadOf`).
  - The verifier's field arms admit a box or a nullable record receiver.
- **`nulBoolJoin`, a new `CoalValArm`.**
  - `emitCoalesceNulBoolJoin` splits, byte-identically, into `coalNulBoolJoinWhy`, a reserve,
    an open and a present-arm writer.
  - The lowering writes them around the IR's own box delivery of the default.

Each relaxed or new verifier rule has a negative self-test that it refuses:
`map-get-boxed-scalar-into-bool`, `field-coalesce-of-i32-receiver` and
`bool-join-coalesce-of-i32`.

## Measured

Against master `23841230e` at its fixpoint seed, before the merge of `930dc5c5a`:
- tests/cases: covered = verified 70,792 → 70,817, matched 70,791 → 70,816 (+25). No new
  fail or differ row.
- IR-N9's list (12 named d3127 cells and 9 tests/cases programs): covered = matched 103 → 115.

Open:
- The remaining `box ladder` cells are `??` chains over maps of mixed union values.
- A union-box `?.` leaf (`coalesce optional record field`) is `emitOptCoalesceBoxLeaf`'s.
- The string-niche operand inside a valued `if` (`coalesce of a valued if`) waits on #9650's
  `nulStr` arm.
