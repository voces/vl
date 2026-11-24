# IR: a value a dead never read feeds (2026-11-24, lane IR-D1)

`pre-path dead never` blocked a function wherever a dead arm reads a `never` value
(`exprReadsDeadNever`, D16006): a call such as `f(fail())` in an arm the checker proved dead, or
a `never` instance of a generic. Legacy's `emitExpr` writes `unreachable` in the value's place,
and its consumer's code goes on.

## Mechanism

- `RDeadNever { dnAt }` (ir.vl) is the value of node `dnAt`. It lowers to `unreachable`
  (`fbUnreachable`) and pushes no operand, exactly as legacy does. It does not end the path, so
  the consumer's instructions follow, as legacy writes them.
- The builder makes the temp in `deliver` (rep = the destination's) and in `exprAtPre` (the
  node's own rep, else `i32`): `deadNeverTemp`. The string-op builder delivers a dead operand
  through `deliverStr`, so a concat operand is a temp at `str`.
- The verifier's `neverCallTemp` accepts the temp as it does a never call's: a `never` temp may
  take its consumer's rep. A `never` local bound from it at `i32` is still refused (rule 3, its
  rep is not its type's).

## Verifier

Keyed self-tests:
- `dead-never-temp-at-consumer-rep`: holds, 0;
- `dead-never-bound-to-non-temp`: refused, 3.

Swapping either expected rule (0 ↔ 3) reds the shadow suite.

## Readings

Master 34f66267 → head, fixpoint seeds:
- ir-i8 census `pre-path dead never`: distilled 6 → 0 (d16261 named cells); tests/cases
  4 → 0 functions.
- IR shadow, functions covered, verified and matched: tests/cases 79,465 → 79,471 of 80,755; corpus
  45,546 → 45,552 of 45,678.
- tests/cases fully IR-only: 6,003 of 7,169 → 6,004 of 7,170 (the new trap case is one).
- Identity: names, cases and claimless all show 0 differ.
- L2 self-compile fuel: +0.48% on the base's own L2.

One never instance per consumer kind is byte-identical on both seeds. Each writes `unreachable` in
the value's place, and its consumer's code goes on:
- drop: `(drop (unreachable))`;
- call argument: the call is itself dead, `(return (unreachable))`;
- member receiver: `print(z.f())` is `(call $__print_i32__ (unreachable))`;
- concat operand: `(call $__str_concat__ (global.get …) (unreachable))`.

None writes a conversion after `unreachable`.

## Legacy tails the IR calls

None new.
