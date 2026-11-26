# START-2: `global read coercion` (2026-11-26)

Regeneration 10 assigned START-2 six units:
- `closures/producers-of-fn-widened-holder-built-at-its-row-runs.vl`
- `functions/return-literal-twin-nested.vl`
- `literal-unions/asg-into-nullable-atom-local-value-runs.vl`
- `maps/null-test-of-map-read-const-before-decl.vl`
- D17125's witness
- D17385's witness

An instrumented miss naming the cell rep and the read rep split them into four mechanisms:

| cell → read | programs | change |
| --- | --- | --- |
| nullable ref → `null` | null-test-of-map-read, D17125 | read the cell at the binding's row, as a read narrowed to its stored null is |
| nullable atom → atom, narrowing `held` | asg-into-nullable-atom | the global takes `nullNarrowArmOf`'s `held` arm, typed at `recoveredReadTyOf`, as `narrowedLocalRead` does |
| struct → rowless record | producers-of-fn-widened-holder | the row type is `irTyOpen` but closed at its rep (`irTyHeldOpen`); `globalStoreTy` and `globalCellRowReadTy` take that row |
| twin record (holder) | return-literal-twin-nested, D17385 | not built: the cell holds `mk`'s result row, a twin with a nullable field, which needs the conversion `return coercion nested twin` also lacks |

Reading the twin and converting it through `irConvert` only renames the miss (`convert record ->
record`), so it stays `global read coercion`: 6 → 1.

`ir-parity --behaviour-only`: byte-identical on the four programs, on both witnesses and on the
sweep, `globals/global-read-at-cell-row-positions.vl`. Master misses the sweep four times: three
functions and `@start`.
