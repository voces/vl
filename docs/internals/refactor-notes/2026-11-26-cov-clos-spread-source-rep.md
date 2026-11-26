# IR: a spread literal is built at its built type's list (2026-11-26, lane COV-CLOS)

## Defect

`spreadLit` built a spread literal at the rep its consumer handed it. For an un-annotated literal,
that is the checker's own type: `i32[][]` for `[...[[1, 2]]]`. But legacy types a fresh nested
source at its holder's element (D4871, `elabSpreadNote`). So `[[1, 2]]` is built at `f64[][]`
beside an `f64[][]` destination, and the literal's built type (`arrLitBuiltTyOf`) is `f64[][]`. The
source's rep was not the literal's, and the build missed (`array spread source rep`).

## Fix

When the built type's list differs from the handed rep, `spreadLit` builds at the built type's
list, and the consumer meets that rep, as it meets a call's callee rep. A twin of the handed rep
(`listRetag`, or apart only in a hole) keeps the handed rep. Its source is already retagged to it,
and taking the twin made `pUnion` in `tests/cases/arrays/spread-source-retag-positions.vl` miss.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,618 | 114,623 |
| lost | — | 0 |
| `array spread source rep` | 3 | 0 |
| `array spread conversion` | 3 | 1 |

Five units are gained. They are `ret` and the start body in
`arrays/spread-fresh-nested-literal-runs.vl`, and the start bodies of
`arrays/spread-fresh-call-record-list-runs.vl`, `lists/spread-element-type-fits.vl` and
`lists/spread-int-list-into-float-literal-converts.vl`. Two of those start bodies were conversion
misses: their group was built at the literal's own list, not the converted one.

## Positions

`tests/cases/lists/spread-fresh-nested-literal-built-type-positions.vl` covers annotated `const`,
argument, `return`, record field, assignment, list element and a third level. Base misses
`array spread source rep` twice; head claims every function, and the output is the same with claims
on and off.
