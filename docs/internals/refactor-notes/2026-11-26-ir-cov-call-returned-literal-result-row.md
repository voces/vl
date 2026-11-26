# IR: a returned struct literal is built at the function's result row (2026-11-26, COV-CALL)

This is part of the records part of the "place reads at storage" series: D17671, D17666's maker
spelling.

**Mechanism.** In `function mk() { return { r: { f: inc0 }, s: { f: dbl } } }`, the literal is laid out
at one struct row (`objLitLayoutRowOf`) and the function's result is declared at another
(`fRetStructIdx`). The rows lie on different struct heaps. The return built the literal at its own
row and then found no retag to the result's rep (`convert record -> record`). Legacy writes the same
mismatch, so its module fails to validate.

Construction follows the destination, as the case-(e) ruling has it for literals: no field-wise
copy. `retLitRow` names the result's row where the returned value is a struct literal laid out
elsewhere and the result's rep is that row's (`rowRep`). The return then builds the literal there,
through `objLitAt`, the same entry D17666's nested literal uses (`nestedLitTargetRow`).

**Witnesses.**

| program | branch | merge-base probe |
| --- | --- | --- |
| D17671's repro | prints `7` under `VL_IR_REQUIRE_CLAIM=1` | `mk` misses `convert record -> record` |
| the Q58 test | prints `2 7` under `VL_IR_REQUIRE_CLAIM=1` | `mk` misses `convert record -> record` |

Claims off, legacy is wrong for both, so they carry a `claims-off-skip.txt` row and `legacy-wrong`
divergence rows, as D17665's and D17666's do.

**Q58.** `tests/cases/lists/maker-returned-hole-fn-record-literal-at-result-row-positions.vl`: a list
of the maker's results read by row, inside a function and at top level.

**Not covered.**

- D17677: a call result bound to a `let`, or a reassigned-let maker's results stored into a list at
  another row. The value is a place, not a literal, so it cannot be built at the destination.
- A direct field read off a call result (`mk().r.f(3)`) misses `member record with no row`: the
  call's temp is not noted at its declared result row. That note is the producer side, COV-START's
  `irVarRow` contract.
