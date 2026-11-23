# IR: a `.map`/`.filter` callback yielded by a call (2026-11-23, lane IR-N1)

The follow-on to #9709, from `map callback expression` (8 functions, 5 start bodies). Splitting
the miss by callback node gave a call for 6 rows and an `if` for 5.

## What landed

- `mapFilterRhs` builds a callback that is a call and a plain function value (`fnValuePlain`, the
  condition under which legacy's `emitMfCallbackValue` writes `emitExpr`) as an ordinary operand.
  The `RMapFilter` lowering writes it after the receiver's store, as legacy does.
- A callback chosen by an `if` stays a named miss: the IR would write the `if` ahead of the
  receiver, against legacy's order.

## Legacy tails the IR calls

None new.

## Bytes and coverage

- `--names`: self-compile identical. `--cases`: identical 7,707, differ 0. `--claimless`:
  identical 14,037, differ 0. `tests/cases` A/B: same 8,822, differ 0. The moved list is empty.
- `tests/cases`: `map callback expression` 8 / 5 falls to 6 / 1. Covered = matched goes from 79,007
  to 79,009 functions and from 6,775 to 6,778 start bodies; one start body moves on to
  `short-circuit closure argument`. The corpus and the self-compile census are unchanged.

## Fuel

L2 self-compile, +0.00% on base b292d7ef.
