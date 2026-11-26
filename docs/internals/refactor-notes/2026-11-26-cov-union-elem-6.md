# IR coverage: a box element narrowed to string literal arms (lane COV-UNION, 2026-11-26)

## box → atom

`if xs[0] is 1 { … } else { print(xs[0] + "!") }`, where `xs: (1 | "a" | "b")[]` (D4201,
`index-place-literal-else`'s four functions). The narrowed read's type is `"a" | "b"`, whose rep
is its atom. The box holds the literal's string, and legacy's tail unboxes the payload as a string
(`refListReadUnboxOf` gives the string kind, 2; `ref.cast` to the string heap). The builder refused
the box element at the atom.

- `buildIndex` (`ir_build_ref`): a non-nullable box element on the `ref` arm, read at an atom where
  legacy's unbox kind is the string's, is read at the string rep (`boxStr`, `irBStrRep`). The
  read's consumer takes the string, as it does for `strAtom`: a concat, a print, a compare, a return,
  and an argument at the literal set, which delivers the string to its atom.

## Measured

Class cut (the `index element coercion` programs plus the sweeps), elem-5's head before and this
tree after:
- `index element coercion` function rows: 11 → 2. The two left are the parked record → record and
  map → map layout rows (after I8).
- Claimed functions: 102 → 111 of 115. Programs fully claimed: 11 → 13.
- The D4201 witness is claimed.

Q58 sweep: `tests/cases/literal-unions/narrowed-box-element-string-arms-in-each-position.vl`
(concatenated, printed, compared, passed at the arms, returned). Its output equals master's. Master
reports `index element coercion` on it; this tree reports blockers none, and the claim takes it.
