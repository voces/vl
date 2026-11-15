# Probes for five unprobed ZERO rows of `goal-scoreboard.vl --sites`, 2026-11-15

Lane B. No code change. Net compiler lines: 0. Pin-helper delta: 0. Graded on a fixpoint seed of
master `5683d3b2c`. For each site, the plainest program the sentence forbids was written, one per
member of any list it names, and graded LIVE (the literal fires) or not reached.

| site | the sentence | programs | verdict | probe | row |
| --- | --- | --- | --- | --- | --- |
| `wasmEmit.vl:2409` | a function value's signature has no representation in the function-value ABI | 33: a parameter of each kind `cloParamTok` reads (nullable scalars, strings, lists, maps, sets, literal unions, record unions and their nullables, list of nullable records) and a result of ten more kinds | not reached: every check-clean one runs (`u32`, `F32x4` are not types on master) | none | none |
| `wasmEmit.vl:13694` | a spread whose elements must each be boxed into a union or nullable element has no lowering | 21 literals with no destination (seven source element kinds × `null`, `"x"` and leading `null`) and 11 with an annotated union or nullable destination | LIVE for a `u8[]` source and `null`, the only mix of a `u8[]` spread the checker does not refuse; `u8 \| null` is no value type, so the design refuses the program | none (a probe must eventually run) | D16391, clause 1, (f) |
| `check_bind_adopt.vl:826` | a record returned by a call is fresh and type-valid, but not built where a list holding elements built as `T` takes it | 12 delivery spellings of D15652's shape over nine field types, then three more field types | LIVE when the call's fresh record must widen into a nullable function field or a list of nullable records | `call-fresh-record-into-list-nullable-fn-field.vl`, `call-fresh-record-into-list-nullable-record-list.vl` | D16392, clause 2, (f) |
| `check_fit_rules.vl:1983` (G listed 1979) | the converting copy does not reach a nested or nullable field | 20: both members (nested, nullable), from a function's result and a list binding's element, held and read again | not reached: each runs, or meets the shared-record rule first; D15247, its row, closed 2026-11-12 | none | none |
| `check_ty_relate.vl:771` | `==` over mutually assignable types that store their elements differently has no lowering | 11 pairs | LIVE for a string literal union's list against `string[]` (and nullable) | `eq-litunion-list-vs-string-list.vl` | D16393, clause 2, (e) |

Beside the last site: a record whose field is a string literal union on one side and `string` on
the other passes check and is refused at emit (`emitProgram: struct equality is not supported yet`):
D16394, clause 1, bucket (e), probe `eq-record-litunion-field-vs-string-field.vl`, now a
`live-sites.json` row.

The probe runner grades the four new probes GAP; `--live-sites` grades both rows LIVE.
