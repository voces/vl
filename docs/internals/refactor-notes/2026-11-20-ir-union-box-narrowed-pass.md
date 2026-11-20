# A narrowed box delivered into a union as it stands (2026-11-20)

After #9213 the self-compile's last `box ladder` rows were 31 functions delivering a box local
narrowed to one record arm (`if vn is Ident { … vn … }`) into the union it came from. The box
plan's `pass` arm refused every value typed as a record (`TyObj`).

## Shape
- **The refusal named one rung.** Of legacy's ladder, only `emitUnionWideArmBox`'s narrowed-box
  rung treats such a value differently: where no arm of the destination holds the record's heap,
  it re-boxes the payload under the arm the record's row subtypes. `narrowBoxWideArmOf` is that
  decision; the legacy rung calls it, and the `pass` plan declines only where it answers an arm.
- **The builder reads the box.** A narrowed box read is unboxed to its record for a record
  destination; at a box destination legacy reads the local itself. `deliver` takes a `pass` plan
  over a narrowed box local (`narrowedBoxVariantPlain`) as its box local (`irBBoxLocal`).

## Measured
See the PR body.
