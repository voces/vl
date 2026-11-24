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

## Cost

`deliver` and `exprAtPre` each asked `exprReadsDeadNever` of every expression. `exprAtPre` now
reads the pre-path's answer, whose first check is the same walk; its two callers that pass no
answer are inside `deliver`, past its own check, and the two past a coercion follow a `pre-path
coercion` answer, which rules dead never out. L2 self-compile fuel, each head seed compiling the
base tree (master 0319020c, base 124,879,107,582):

| variant | L2 | vs base |
|---|---:|---:|
| a per-function flag (any name read as `never`), skipping both walks | 125,258,337,653 | +0.30% |
| floor: the flag forced false, no walk | 124,909,771,072 | +0.025% |
| V2, shipped: `exprAtPre` reads the pre-path; `deliver` walks | 125,010,122,654 | +0.105% |
| V3: V2, `deliver` walking only off the expression's own rep | 125,245,433,179 | +0.29% |

The flag's pass, a `nodeTyAt` per name over every function body, cost what it skipped, and
`exprRepOf` costs more than the walk it would guard.

## Verifier

Keyed self-tests:
- `dead-never-temp-at-consumer-rep`: holds, 0;
- `dead-never-bound-to-non-temp`: refused, 3.

Swapping either expected rule (0 ↔ 3) reds the shadow suite.

## Readings

Master 0319020c → head, fixpoint seeds:
- ir-i8 census `pre-path dead never`: distilled 6 → 0 (d16261 named cells); tests/cases
  4 → 0 functions; no claimed function lost in any population.
- IR shadow, functions covered, verified and matched: tests/cases 79,501 → 79,507 of 80,791; corpus
  46,789 → 46,795 of 46,958.
- Identity: names 9,433, cases 7,755 and claimless 14,453 identical, 0 differ; A/B 7,817 same.
- L2 self-compile fuel: +0.29% on the base's own L2, the PR's source included; +0.105% for the
  head seed compiling the base tree.

One never instance per consumer kind is byte-identical on both seeds. Each writes `unreachable` in
the value's place, and its consumer's code goes on:
- drop: `(drop (unreachable))`;
- call argument: the call is itself dead, `(return (unreachable))`;
- member receiver: `print(z.f())` is `(call $__print_i32__ (unreachable))`;
- concat operand: `(call $__str_concat__ (global.get …) (unreachable))`.

None writes a conversion after `unreachable`.

The Q58 sweep (`tests/ir-shadow-rows/dead-never-positions*.vl`) reads the never value at each
delivery position in a hole lambda's face and a null-bound type parameter's. Every claimed
position matches and prints as claimless; `void return value` and `print nulNone` keep four
null-bound positions; the sweep's `return` of a null-bound parameter found invalid wasm on
master, fixed in its own express PR.

## Legacy tails the IR calls

None new.
