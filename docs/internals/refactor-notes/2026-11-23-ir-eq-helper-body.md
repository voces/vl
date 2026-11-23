# IR builds the structural-eq helper bodies (2026-11-23, lane IR-N8)

A struct row whose inline compare would read more than 32 leaf fields gets one compare helper,
`__eq_<row>__ (ref null $S, ref null $S) -> i32`, written at module level by `eqHelpFnCode`
(D9935). `ir-only-census` counted these as `legacy module: structural eq helper`: 5 tests/cases
programs, none in the self-compile.

## Design

- **`REqHelp { ehL, ehR, ehRow }`**: the helper's compare of its two parameters. The verifier holds
  both operands at references and the answer at i32. Family `scalar`, as `RStructEq`.
- **`buildEqHelp(si)`**: an `irHelper` function `@eq <row>`, with two raw `(ref null $S)`
  parameters at slots 0 and 1, one `REqHelp` temp, and its return.
- **The frame is legacy's.** The helper's locals are the scratch frames its compare stages in, so
  `irLowerEqHelper` lowers in the frame `eqHelpFnCode` opened (`fbBeginFunc(2, 0)`), from an
  empty lazy frame, and writes `fbEmitLocalsVec(…, 0)` as legacy does.
- **Seams:** `irClaimEqHelp` before legacy writes the helper. Under the shadow, `irShadowEqHelp`
  lowers BEFORE legacy, then `irShadowLowerEqHelper` takes its noted callees back and empties the
  lazy frame again, so legacy writes from exactly the state it has unarmed and nothing is left for
  what emits next; `irShadowEqHelpCheck` compares after legacy: `eq helper matched`,
  `eq helper uncovered <why>`, `mismatch bytes: eq helper`, control 3.
- **Verifier self-tests:** `eq-helper-of-records` holds; `eq-helper-of-i32` and
  `eq-helper-into-bool` are refused under rule 2.
- `ir-only-census`'s probe row moves past the claim, so it counts only what legacy still writes.

## Measured

Shadow mode over every tests/cases program, master d6341e57's tree on the merged seed: 23
`eq helper fns`, 23 `eq helper matched`, in `diamond-record-eq`, `diamond-record-eq-list-leaf`,
`recursive-nullable-field-equality` and the `runtime-helper-keys` modules. Under
`VL_IR_SHADOW=3` each of those programs claims every helper and builds byte-identical.

Row: `tests/ir-shadow-rows/eq-helper-body.vl`, 8 helpers, all matched. Its list leaves stage in
a lazy slot: a lowering that does not start from an empty lazy frame grows the locals vector and
misses. The armed build of each of the 5 programs is byte-identical to the unarmed one.

## Legacy tails the IR calls

- `eqHelpTail` (split out of `eqHelpFnBody`), in `eqHelp`: the null guard and `emitStructEqRec` over slots 0 and 1, the compare legacy's helper writes.
- `fbEmitLocalsVec(…, 0)`, in `irLowerEqHelper`: the helper's locals vector from legacy's scratch frame.
