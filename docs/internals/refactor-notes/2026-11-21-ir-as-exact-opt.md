# IR: an exact numeric `as?` through legacy's numeric cast tail, 2026-11-21

`asCastArmOf`'s `exact` arm (D1041) was the second `expression as` sub-shape: 42 tests/cases
functions, most of them `as? i32`. The IR already built the exact `as!` as `RNumCast` over
`numCastTail`, because legacy's `numCastKindOf` names its operand's kind. Every other mode
answered -1, so `as?` missed as `expression as`.

## The change

- **`numCastKindOf`** names the exact `as?`'s kind too (`numExactCastKind`). Legacy reads that
  gate only through `numCastTail`, so no legacy byte moves. `numExactCastTail` writes `as?`'s
  stash, test and valued `if`, yielding the value-union box or its null-tagged box.
- **The verifier's `RNumCast` rule** admits a box destination, or the boxed `T | null`, for a
  cast whose mode is `as?`. Every other numeric cast stays between scalars.
- **The propagating exact `as`** stays a named miss. Its miss returns the function's null through
  `emitReturnValue`, whose return sink an IR-claimed function does not open.
- **The shadow test** that proves a construct outside the set leaves its function uncovered now
  takes the propagating `as`. Its `as?` is inside the set.
