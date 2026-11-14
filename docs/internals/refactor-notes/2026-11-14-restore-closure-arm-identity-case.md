# Restore D1098's closure-arm compare case under `===`, 2026-11-14

Lane E, tests only. #7979 made `==` on two function-holding operands a check error and deleted
`tests/cases/unions/union-closure-arm-equality.vl` with no successor. That file was D1098's pin:
a closure arm tags by signature, so only a file with two or three closure-armed unions can see a
compare that reads the flat kind-11 offset (a wrong answer, or a `ref.cast` trap).
`closure-arm-narrow-tag-agreement.vl` pins the narrowing tag, not the compare.

## Restored, respelled to `===` / `!==`

- **Two closure arms in one union** (`pick`): all six rows, unchanged apart from the operator.
- **Three signatures across closure-armed unions:** the old sections used `u0`/`u1`/`u2`, each a
  closure arm beside an `i32` arm. A union with a scalar arm is ruled out under both spellings
  (`==` by the ruling, `===` because a scalar has no identity), so those rows cannot be kept as
  written. They are replaced by three all-function unions (`U01`, `U12`, `U20`) spanning the
  same three signatures, each compared against the concrete function, another function, itself
  and the other arm, in both operand orders. That keeps "the second closure-armed union tests its
  own tag".
- **A capturing closure** (`mkAdder`): the four `(id, env)` rows, with the box now
  `((i32) => i32) | (() => i32)`, since `boxIt`'s scalar arm is ruled out the same way.

## Cut, illegal in both spellings

- The `u0`/`u1`/`u2` and `boxIt` rows as written (union with an `i32` arm).
- The `mix` section (a closure arm beside a record arm). That is D16039, refused under `===` until
  its per-arm core lands (lane F), which should restore these rows.

The case runs: 25 answers, each checked against its meaning. A seed with the flat-offset read
reinstated was not built for this restore.
