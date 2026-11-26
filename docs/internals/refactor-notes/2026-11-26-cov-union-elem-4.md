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

- `buildIndex`: a nullable element read at the `null` unit (`nulDropped`) is the element read as
  stored and dropped, then the bottom ref (`RNullOf`, no `nuRead`). The verifier admits `nuRead`
  only where legacy's own pre-path names a null-unit place read, and that predicate is false for a
  `nulbool` element.
- Read at its storage, it is the element as stored. `nulNoneEffect` builds an element operand at
  its storage, since it drops the value, and `print`'s nullable arms (`nulBool`, `nulStr`) read a
  null-narrowed element at its storage, as legacy prints the stored niche.

## A clause-1 defect this closes (coordinator ruling, 2026-11-26)

Passing `a[0]` at a `null` parameter, with `a[0]` narrowed to `null` over a `(boolean | null)[]`:
master delivers the element's i32 niche and the module fails to validate
(`type mismatch: expected nullref, found i32`), though `vl check` passes. The IR now claims the
function and delivers the unit.

The guard is `tests/cases/null/narrowed-null-element-delivered-runs.vl` (passed, bound, printed,
passed again after binding), which runs under the default build with its `@log`. It is listed in
`scripts/silent-sweep/distilled/claims-off-skip.txt`, with the reason, because the claims-off
shadow modes let legacy emit the function. The row leaves at I8.

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
