# D16007: a negated `is` guard registers its `else` arm's alternative (2026-11-13)

`if !(p is A) { print(p.y) } else { print(p.x) }` over an un-annotated `p`, called with `A | B`,
was refused: "argument 1: expected {y: _}, got A | B". The positive spelling runs since D16004:
the guard registers `A` as an alternative, and #7892 lets a union argument meet the demand
member by member.

## The change (check_statements.vl, check_node_rules.vl, check_narrow_paths.vl)

1. **The alternative.** `checkIfHead` registered alternatives from the then-narrows only. Under
   `!`, `A` is the `else` arm's narrowing. A closed else-narrow of a hole is now registered as
   the alternative the `else` arm takes (`IfChk.elseAltRows`), and its demanded-field tail is
   closed on the `else` arm's divergence, as a then-arm alternative's is on the `then` arm's. An
   open else-narrow is not registered. That is the `HD_GNOT` remainder an ordinary `is T` gives
   a hole, and it names no type an argument could be held to.
2. **The elaboration's dead arm.** An instance's elaboration notes an `is` test that is always
   true, or dead, at its pin. `checkIfHead` read "always true" as "the `else` arm is dead". Under
   `!` that is the arm that runs, so the `then` arm's read (`v.bar` at a `{foo: string}` pin) was
   checked and refused. A condition that is `!(…)` now reads the two signals with the arms
   swapped.

## Position matrix

| program | master | this change |
| --- | --- | --- |
| `!(p is A) { p.y } else { p.x }` over `A \| B` (witness) | refused | `yy` |
| the same, then `p.kind` after the `if` | refused | `yy b` |
| no `else` | refused | `yy 0` |
| `then` arm returns; pins `A \| B` and `A` | refused | `yy 4` |
| `foobar` negated, `{bar}` and `{foo}` pins | refused | `b f` |
| `foobar` negated, `{baz}` pin | refused | refused, now with the positive spelling's message |
| pin `A \| B \| C`, `C` with no `y` | refused | refused at the argument |
| `else` arm reads a field `A` lacks | refused | refused, `no field 'w' on A` |
| the guard-alternative soundness net | three refusals | three refusals |

## Measurement

The sweep against a fixpoint of the merge base: 24,255 programs the same, with 0 bytes-only
movers, 3 output movers (the witness and the two fixtures) and 0 runs → not-runs. The polarity
correction moves nothing else in the corpus.
