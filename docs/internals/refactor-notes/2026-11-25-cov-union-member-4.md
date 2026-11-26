# IR coverage: `.length` of a call returning an open empty `[]` (lane COV-UNION, 2026-11-25)

## `member unsup`

`mk().length`, where `mk` returns an empty `[]` whose element no use fixes (D626's control,
`inferred-return-empty-through-binding`, `unannotated-empty-return-elem-rep`,
`lambda-empty-array-literal-return`, D14901). The call node's type is a list with an open
element, which reps as `unsup` (`list:hole`). `buildMember` takes its receiver's rep from that
type, so it fell through to `member unsup`.

The callee itself is covered: its result takes legacy's result descriptor where its type is open
(`resultFrameTy` → `resultDescTy`), and a call is built at that rep.

- Builder (`buildMember`): a `.length` whose receiver is a call with an `unsup` rep builds the call
  first. Where the built rep is a list (`refRepOk`), it reads the list's length (`RListLen`), the
  same node a typed list's `.length` builds.

## Measured

Class cut (the member-family programs, the earlier sweeps and this one), #10223's head before and
this tree after:
- `member unsup`: function rows 2 → 0, start rows 3 → 0, the D14901 witness's start 1 → 0.
- Claimed functions: 226 → 228 of 245. Start bodies: 21 → 24 of 30.
- Fully claimed programs: 12 → 16, plus one witness.

Q58 sweep: `tests/cases/arrays/open-empty-call-length-in-each-position.vl` (printed, arithmetic,
compared, passed, bound, returned). Its output equals master's. Master reports `member unsup` on
it; this tree reports blockers none.

## The member-read family after this

- `record-list-call-spread-beside-wider-part-runs`'s start read (`s4[0].x` with a narrow op):
  legacy lays `s4`'s records out at the widened row `{ x: f64 }` and reads the field back through
  `i32.trunc_f64_s` / `f64.convert_i32_s`, while the read's type is the i32 row. That is the
  row-rep versus legacy-layout disagreement, parked until after I8 (coordinator ruling,
  2026-11-25), with its `array spread source rep` beside it.
- `index element coercion` (the class #10184 moved units into) is the next re-grade.
