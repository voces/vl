# Step 7, lane H: the FC_STRUCT element name producers, 2026-11-13

Lane F handed over two FC_STRUCT name producers in `emit_shape_rows`. Each stripped a
spelling to its non-null base (`nonNulBaseOf`) when the type-based rung declined:

- **`fieldRefElemName(tyIx, code)`** (the node recorder) uses the spelling when the field's
  type has no struct row yet (`fieldBaseStructRow` < 0).
- **`shapeFieldElemName(ftxt, code, fty)`** (the shape-text recorder) uses it when
  `shapeFieldElemNameOfTy` names nothing.

## Probe

A scratch compiler ran over 24,070 programs, with a control tag on each. At each reach it
compared the stripped spelling with the field's non-null type's nominal name
(`fieldElemRowName(tyPeelNul(ty))`):

| producer | the same name | another name | no type |
| --- | --- | --- | --- |
| `fieldRefElemName` | 114 programs | 0 | 0 |
| `shapeFieldElemName` | 395 programs | about 75 programs | 0 |

`shapeFieldElemName`'s differences are all structural twins. The field's text is an inline
shape (`{v:i32}`, `{n:i32,next:O|null}`) while its type renders as a declared or applied name
(`A`, `O`, `Box<i32>`, `C<f64>`, `Pair<i32,string>`). The recorded name keys the row the field
is stored at, so naming the declared twin would move those fields to another row. That arm
stays until the row is keyed by type; it goes with lane F's D6 re-key.

## The change

`fieldRefElemName`'s FC_STRUCT arm names the field's non-null type. A field with no type is
unreached in the corpus, and now hits a loud floor (`emitFail`).

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `704a8ae6` against this, fixpoint seeds on both sides):
  24,203 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **The opaque-label instrument** (`$VL_OPAQUE_SNAMES=1`, armed on a host built from this
  tree; the shared binary predates #7661):
  - Arming moves 261 of the base's programs: 256 bytes-only, 5 output movers, 5 `runs →
    not-runs`, 3 new traps.
  - Armed, the candidate matches the armed base exactly: 24,203 same. This cut adds no
    label-reading decision and removes none of those five.
