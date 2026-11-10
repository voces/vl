# `boxTyNamesNothing` answers from the type's structure, 2026-11-10

`boxTyKeeps` (check_fit_rules.vl) asks of every stamped node whether the union it boxes to has no
emit name. It rendered the whole type to find out, and the render doubles in length per level of
a record that holds one record twice. The answer now comes from `tyEmitNameNonEmpty`, which walks
each arena node once and decides each of `tyToEmitName`'s `""` conditions arm by arm. The render
and its last-type memo remain only for the walk's cycle answer (-1).

Fuel is `$VL_FUEL=1` guest fuel. CPU seconds are not used, because the box is a shared cloud VM.
`vl_scaling_shape_test.ts`, master `2f2fcb62` against this branch:

| axis | before | after |
| --- | ---: | ---: |
| diamond record depth (many arm) | 71.71M fuel, ratio 4.372 | 69.88M fuel, ratio 4.265 (bar 4.45) |
| the other four diamond axes | unchanged | unchanged |

This removes part of the excess, not all of it: at the test's depth this question is a small share
of the many arm. The plumb units and the L2 self-compile move by under 0.01%.

**Output is unchanged.** The seed is a byte-identical fixpoint (6,599,776 bytes). All 7,687
`tests/cases/**/*.vl` files build to identical wasm, diagnostics and exit code under the two seeds.
