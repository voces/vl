# IR: a scalar map compare after a null test reads the probe's compare (2026-11-24, lane S1)

Legacy routes `m[k] == v` over a bare scalar-valued map read to the probe's compare
(`eqRouteOf` "scalarMap", `emitScalarMapReadOtherEq`) whatever its operands' types. The IR asked
that route only inside its compound-operand block, which a read the checker narrowed to its scalar
(`if m[k] != null { if m[k] == 41 { … } }`) never enters, so it built a plain `i32.eq` over
`__map_get_0__`. It now asks the route ahead of the plain operator, with the same call the
compound block makes (`scalarMapEq`, RMapEq), so the IR writes legacy's probe compare.

`scalar map compare route` (#9874's miss) stays as a guard ahead of the plain operator: it fires
only when legacy's route and the IR's disagree, and its count is 0.

`f64` and `i64` values route to the probe too; `scalarMapEq` builds kinds 0 and 1 (`i32`,
`boolean`) only, so they miss as `scalar map compare kind`, and run identically under the miss.

## Witnesses

`tests/cases/maps/scalar-map-compare-after-null-test.vl`: narrowed by `!= null`, by `== null`'s
else and by `!(m[k] == null)`; the read on either side; `==` and `!=`; `i32` and `boolean` values
at `string` and `i32` keys; a stored `0` and `false`; a miss; a write between the test and the
compare (re-read: `mutated`); the start body, a function, a closure and a generic instance; and the
`f64`/`i64` compares the named miss leaves to legacy. The corpus cells
`d16846_makergen_map_value_place_{ann,unann}` cover and match.

## Readings

On fixpoint `7885cb17…` (head `5c747e483`); the base is #9874's head `acb8a92d1`'s fixpoint,
each census arm run in a tree at its own commit.

| run | base | head |
|---|---|---|
| the two `d16846_makergen_map_value_place` cells under `VL_IR_SHADOW=6` | `scalar map compare route` | covered and matched |
| `ir-only-census.vl`, programs fully IR-only | 6239 of 7261 | 6239 of 7262 (the witness added) |
| `ir-only-census.vl`, `scalar map compare` rows | 1 (`pair`) | 2 (`pair`, and the witness's `kind`) |
| legacy A/B, tests/cases + probes, and `--names` | | differ 0 |
| self-compile fuel per PR, on master `f080c9665` | | +0.05% |

Two readings to keep apart. The census reads only `tests/cases`, so `scalar map compare route`
(the guard, whose only programs were the two corpus cells) never shows there; its census row
`scalar map compare pair` is `scalarMapEq`'s own miss for two map reads compared, in
`maps/scalar-read-miss-is-null-when-consumed.vl`'s start, present on the base too. And the cells'
`claimless differ 2` was on #9874's intermediate head `1569c0d0`, which covered their `print`
before the guard: on master the start is unclaimed and claimless-identical.

A first cut asked `eqRouteOf` on every primitive `==`/`!=` and cost +1.37% self-compile fuel; the
route is now asked only over a bare scalar map read, `scalarMapEqPlanOf`'s own precondition.
