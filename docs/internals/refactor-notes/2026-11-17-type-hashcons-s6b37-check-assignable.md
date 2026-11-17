# Type hash-cons stage 6b, tier 2: check_assignable.vl's type and literal walks (lane HASH), 2026-11-17

`check_assignable.vl` goes 9 → 3. This covers the census-reached `fvaValueRowWalk` (row 8) and
`genFnValueCstrsAt` (row 4), and the file's other type and literal walks.

| function | was | now |
| --- | --- | --- |
| `fvaValueRowWalk` | `depth` 4 | (source, destination) pairs walked |
| `genFnValueCstrsAt` | `depth > 8` of nested literals | the literal tree's own end |
| `listArmIn` | `depth` 6 of nested unions | unions searched |
| `fnShapeClash` | `depth > 8` | pairs walked: a revisit answered false first time, or is a cycle |
| `dstOpenFnSlotsNaming` | `depth < 8` of nested record literals | the literal tree's own end |
| `fvaValueIsCallResult` | `depth > 8` of `const` copies | bindings seen |

## Not attempted

Three call-graph walks are not attempted: `fvaHoleDeclOf` (`depth` 4), `fvaRelayValueCalls`
(`depth > 4`) and `fvaRelayTwinInner` (`depth > 8`). None is census-reached. Each follows a
function's returned values into the functions they call, the shape that made `callBuiltTy`
exponential, then quadratic, without its bound (s6b32, s6b35). Each answers conservatively at the
cut (-1 or false). They belong to the cross-question memo design item, not to this conversion.

## Grading (fixpoint seeds, master `b2b754548` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- `tests/vl_scaling_shape_test.ts`: passes.
- Self-compile fuel: 94,223.2M against master's 94,146.0M (+0.08%).
- `walk-limit` baseline: 519.
