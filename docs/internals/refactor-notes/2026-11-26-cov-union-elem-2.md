# IR coverage: a literal set's element stored as its string (lane COV-UNION, 2026-11-26)

## `index element coercion`, str → atom

`if a is K[] { print(a[0]) }`, where `a` is a hole parameter, `K = "x" | "y"`, and the argument is
a string list (D4916, `inferred-string-list-is-atom-list` ×3,
`string-cell-narrowed-to-literal-set-reads-its-string`). The list stores strings; the read's type
is the literal set, whose rep is its atom. Legacy reads the string as stored and its consumers take
the string. The builder refused the element read at the atom.

- `buildIndex` (`ir_build_ref`): a string element read as a literal set's atom on the `str` arm is
  read at the string it is (`strAtom`). This is the same view the member read takes for a literal
  set stored as its string. The read's consumer takes the string temp: a print, a compare, a
  concat, a return, and an argument at the set, which delivers the string to its atom.

## Measured

Class cut (the `index element coercion` programs plus both sweeps), #10234's head before and this
tree after:
- `index element coercion` function rows: 18 → 9.
- Claimed functions: 70 → 79 of 91. Programs fully claimed: 2 → 4.
- The D4916 witness is claimed.

Q58 sweep: `tests/cases/literal-unions/narrowed-string-list-element-as-atom-in-each-position.vl`
(printed, bound and compared, compared directly, passed at the set, concatenated, returned). Its
output equals master's. Master reports `index element coercion` on it; this tree reports blockers
none.

## Left in the class

nullable(closure) → closure (2), atom → str (1), nullable(bool) → null (1), and D4201's box → atom.
D4201's box stores the literal arm's string, which legacy reads with `ref.cast` to the string
heap. The record → record and map → map rows are parked until after I8.
