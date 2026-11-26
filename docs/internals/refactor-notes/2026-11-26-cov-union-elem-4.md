# IR coverage: an element narrowed to one literal, or to `null` (lane COV-UNION, 2026-11-26)

## atom → str

`if ks[0] == "y" { return onlyY(ks[0]) }`, where `ks: ("x" | "y")[]` (`eq-literal-narrows-boxed`'s
`element`). The narrowed read's type is the one literal `"y"`, which reps as its string; the list
stores the atom. A field narrowed alike is read at its atom and decoded by its consumer
(`atomStr`, `buildMember`). The element read refused.

- `buildIndex` (`ir_build_ref`): an atom element read as its literal's string (`exprIsLitAtom`) is
  read at the atom (`atomStr`).

## nullable(bool) → null

`if a[0] is boolean { … } else { a[0] == zi }`, where `a: (boolean | null)[]`
(`narrowed-null-field-elem-compared-with-other-nullable`'s `elem`). The `null` side of a name's
null test is built for its effect and dropped (`nulNoneEffect`). Its element read at the `null`
unit refused over the `nulbool` element.

- `buildIndex`: a nullable element read at the `null` unit is read as stored (`nulDropped`). A
  consumer that keeps the value checks its rep and misses: `const q = a[0]` reports
  `declaration coercion`, and an argument at a `null` parameter reports `argument coercion`.

## A clause-1 defect seen beside it (legacy, no row by the brief)

`const q = a[0]` (or passing `a[0]` at a `null` parameter, or `print(a[0])`) with `a[0]` narrowed
to `null` over a `(boolean | null)[]`: master emits a module that fails to validate inside the
function (`type mismatch: expected nullref, found i32`). The IR does not claim those functions, so
it stays legacy's.

## Measured

Class cut (the `index element coercion` programs plus the sweeps), #10252's head before and this
tree after:
- `index element coercion` function rows: 12 → 6.
- Claimed functions: 91 → 97 of 105. Programs fully claimed: 6 → 9.
- `narrowed-null-field-elem-compared-with-other-nullable` is fully claimed.

Q58 sweep: `tests/cases/literal-unions/narrowed-element-sole-literal-and-null-in-each-position.vl`
(passed at the literal, concatenated, compared, returned; the null element on either side of a
compare). Its output equals master's. Master reports `index element coercion` on it; this tree
reports blockers none.

## Left in the class

D4201's box → atom, `narrowed-fn-arm-place-call`'s box → closure, and the parked record → record
and map → map rows (after I8). COV-START took the nullable(box) → v128 and simd rows.
