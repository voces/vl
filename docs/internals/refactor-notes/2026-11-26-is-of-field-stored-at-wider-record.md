# `is` over a field stored at a wider record's row (2026-11-26, lane COV-IS)

- **The defect** (clause 1, found bisecting CENSUS's box-ladder start bodies): `const o = { v: x }`
  with `x: i32 | f32 = 1.5`, stored into a `{[string]: D}` map where `D = { v: i64 | f64 }`, so
  `o` is built at `D`'s row and its field holds the box widened (`f32` as `f64`). `o.v is f32`
  printed `false`, and `o.v is i32` `false` too. A read binds the box rebuilt at the receiver's
  own members (`memReadBoxNarrowTy`, D3006), but `tagIsArmOf`'s `memStruct` arm read the raw slot
  (`struct.get`) and tested the own member's tag against the widened one.
- **Fix** (shared plan, `tagIsArmOf`): `memStruct` declines where the field's box is rebuilt
  (`memReadBoxNarrowTy`) or ambiguous, so the `box` arm reads the field as every other consumer
  does, rebuilt, and tests that tag.
- **Sweep** (`tests/cases/soundness/is-of-field-stored-at-wider-record-positions.vl`, new): printed,
  in an `if`, bound, returned, negated and at the top level. Master's legacy printed 6 of its 7
  lines wrong; here all are right. The IR claims none of these (`box ladder`: the rebuilt read is
  its own gap, in the box-ladder family), so legacy's output is what ships.
