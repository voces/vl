# IR: an un-annotated function's result rep is its recorded result (2026-11-21, lane IR-N2)

`return coercion` misses where the value a `return` delivers is not at the function's result
rep. In the corpus it was mostly `record to record`. An un-annotated function whose literal the
checker builds at the record its one call delivers it to (`recFnBuiltAtDst`) returns that
record. Legacy's functype names the recorded result (`fRecRetTy`, read by `cloRetValSlot`). The
IR's `resultTy` asked the checker's inferred result first (`fnCheckedRetTy`), which is still the
function's own row.

## The change

`resultTy` (`ir_build.vl`) takes the annotation, else the recorded result, else the checker's.
`resultRep` and `calleeSig` read it, so a call of such a function now agrees with its body. This
is the ruling that the IR's function result rep follows legacy's functype.

## Measurement

One-off instrumented census over the corpus, with `return coercion` split by value rep and
result rep (sole-blocker functions):

| split | before | after |
| --- | ---: | ---: |
| record to record | 205 | 45 |
| list to list | 44 | 25 |
| closure to closure | 15 | 15 |
| map to map | 5 | 5 |
| box to a scalar or record | 4 | 4 |

Row file `tests/ir-shadow-rows/fresh-result-built-at-destination.vl`; witness
`tests/cases/records/fresh-result-built-at-its-destination-returns-there.vl`.
