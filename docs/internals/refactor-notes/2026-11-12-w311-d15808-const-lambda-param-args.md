# D15808: a `const` lambda's parameter is judged at its calls, 2026-11-12

The D15802/D15807 judgment refuses an `if`, or a list of records, whose function field holds
functions that return different types at the call through it. It reads the parameter's
arguments through `cwParamArgCalls` (`check_write_scan.vl`), which walks the occurrences of the
function declaring the parameter. A lambda is called through the `const` that holds it, and its
name is still empty at check, so the walk declined and nothing judged the values. The program
then reached runtime: a trap inline, an invalid module as a list. A lambda that is the
initialiser of an unwritten `const` (`cwLambdaConstOf`) now has that binding's reads as its
calls. The judgment therefore refuses the lambda's spellings as it refuses the named function's.

## Measurement

| program | master | this |
| --- | --- | --- |
| D15808 (the `if` inline) | runtime trap, `vl check` clean | loud check reject, D15807's sentence |
| the list literal | invalid module | loud check reject |
| the record bound first | loud emit reject | the same (D15775, filed; the named function runs it) |
| the named function (D15807) | loud check reject | the same |

The distilled corpus (`regress.vl`) reads the same on this seed as on master's: no runs lost and
no cell moved. CI's sweep is the proof for the whole population.
