# IR coverage: a literal-union string part at a string rep, through the delivery's atom decode (2026-11-24, lane IR-N7)

| Mechanism | Change | blocker class, tests/cases functions, before → after |
|---|---|---|
| string atom part route (case B) | `buildStrBin` no longer refuses an `exprIsLitAtom` part whose type's rep is a string (a value narrowed to one string member of a wider set); every such part takes `deliverStr`'s decode, as legacy's `emitStrValue` sends it to `emitAtomToStr` | `string atom part route` 12 → 0 functions (11 to none, 1 to `member record`), and 4 → 0 `start` functions (3 matched, 1 still uncovered in other classes) |

`partReadsAtomCell` is deleted with the guard. `letBindIsNulAtom` and `atomNullable` were exported
only for it and are private again.

Witness: `tests/cases/literal-unions/atom-string-rep-part-positions.vl`. Each case B spelling
prints a distinct string, and every set holds more than one member, `null` among them, so a wrong
decode prints the wrong text: a literal test and `is string` out of a set that also holds `null`,
an overlap test onto one member and its else, and a generic call's result read in a closure. A
set beside an integer is boxed instead, not case B; it is the neighbour, and it still prints its
string.

Moves on to another lane's class:
- `field` in `literal-unions/is-literal-set-overlap-narrows-to-meet.vl` (`"nf \{s.m}"`) moves to
  `member record` (lane IR-N8).
- `unions/discriminant-mixed-litunion-bare-literal-arm.vl`'s `start` stays uncovered in
  `atom cell local rep + member record + narrowed field read coercion`.
- Correction for #9820's note: its `start` in `unions/discriminant-set-beside-base-alias-arm.vl`
  went on to `atom tower place + member record + narrowed field read coercion`, not to none.

## Measured

Class census: fixpoint seeds master 93c14a765 (which carries #9820) and head a920dbd98.
- tests/cases functions with no blocker: 81,147 → 81,158; `start` matched 7,140 → 7,143.
- `--cases` identical 7,788, differ 0, after the mechanical merge of 93c14a765.

Full proof: head 41040ddc5 against master 03e8302f8, which predates #9820, so it also measures
#9820's change.
- `--cases` identical 7,773, differ 0; witnesses 61 / 0; `--claimless` identical 14,455, differ 0.
- tests/cases covered = verified = matched, 80,295 → 80,326. Corpus 46,828 matched, unchanged.
  Self-compile 20,512, unchanged; self ir misses 0.
- A/B over tests/cases: same 7,492, differ 0, built under one only 0.
- L2 fuel −0.02% per PR; late demands 9 / 9; late tag rows 307 / 307.

Position sweep: `scripts/capability-probes/matrix/atom-narrowed-to-one-string-member-joined.matrix.vl`.
- It runs 78 of 78 graded cells under both seeds.
- Under `VL_IR_SHADOW=6`, all 78 programs match: 228 functions and 80 `start`s covered and matched.
  On the base seed, 78 of them stop in `string atom part route`.
- All 78 are `--claimless` identical.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `exprIsLitAtom` (existing) | `emitStrValue`'s split between `emitAtomToStr` and `emitExpr` |

## Legacy tails the IR calls

None new.
