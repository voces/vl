# Step 7 L2: the struct-field refusal decides "union arm" from the field's type, 2026-11-13

Lane E: the first of `nonNulBaseOf`'s callers outside the shape interner, by coordinator ruling.
`fieldTypeRefusalMsg(name)` (`emit_shape_rows`) builds the message for a struct field with no field
code. It peeled `| null` off the field's spelling with `nonNulBaseOf`, then asked `variantIndexOf`
of the result: was the field typed as a union arm? Each of its four callers holds the field's
type:

- `collectS`, by `recFieldTyOf`;
- the arm recorder, by `fldTy`;
- the variant field pass, by `recFieldTyOf`;
- the alias-shape coder, by `shapeFieldRowOf`.

## Changed

`fieldTypeRefusalMsg(name, ty)` makes the arm decision with `exactArmRowOfTy(tyPeelNul(ty))`, and
names the arm by `tyToNominalName`. `name` is only printed, in the general sentence. Its
`nonNulBaseOf` call and its two `variantIndexOf` reads are deleted.

## Reach

Neither sentence is reached by the sweep's 24,202 programs: 0 records carry either message. The
arm case's plainest program, a record field typed `Circle | null` beside `type Shape = Circle | Sq`,
now runs and prints `1` on both seeds. The arm sentence is therefore a message floor no corpus
program reaches, and the change moves its decision from the spelling to the type.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `c85dfd6f` against the candidate: 24,202 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass.
- Render-parse: unchanged at 2 parses. `nonNulBaseOf` keeps its other callers:
  - the 7 interner key producers and `genAppRidesTyParam`, which re-key with D6 step 2, lane E;
  - `elemNameIsDeclared` ×2 in `emit_union_atoms`, a label choice between two spellings of one
    type that D6 retires;
  - `rlElemStructRow`, lane F;
  - `fieldRefElemName` and `shapeFieldElemName`, lane F or lane H.
