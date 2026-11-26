# IR box ladder: a numeric union re-boxed at a wider union (2026-11-26, lane COV-IS)

- **The miss**: `box ladder` where a numeric union's box is delivered into a union that lacks one of
  its members but holds the member it widens to (`i32 | f32` into `i64 | f64`), legacy's
  `emitNumUnionRebox`. It shows where a record literal `{ v: x }` is built at a wider record's row
  (`o` stored into a `{[string]: D}` map, `D = { v: i64 | f64 }`) and its field is then read back.
- **What landed**: `holePassPlanOf` names a `numRebox` arm (`numUnionReboxes`) in place of the
  ladder; legacy reads it as its ladder (`unionBoxArgLadders`), so its bytes do not move. The IR
  lowers it as `RNumUnionConvert` does: the box stashed (`numUnionStashTail`), then legacy's member
  dispatch (`numUnionReboxTail`, `njReboxArm`).
- **Field read**: a box stored at a wider record's members is read typed at the read's own union
  (`memReadBoxNarrowTy`, D3006), which legacy's field tail rebuilds; a storage read of such a field
  (an `is` receiver's raw slot) is a named miss, `storage read of a wider row's box`, where it failed
  the verifier.
- **Parity**: `ir-parity.vl --files` reads `same` on the sweep and on
  `objects/record-literal-widened-box-two-members.vl` (its start body now claimed); the bytes differ
  in the stash and locals only.
- **Q58 position sweep** (`tests/cases/unions/numeric-union-reboxed-at-wider-row-positions.vl`, new):
  the read bound, passed, returned, from a parameter and at the top level. Master: 4 functions and
  the start body `box ladder`; here all claimed.
