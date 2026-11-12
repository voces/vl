# Step 7: a nullable list element's row name is its nominal spelling, not a render, 2026-11-12

`nulRefElemEmitName` (`emit_shape_rows.vl`) named a nullable ref-list element in three steps. A
record had its declared name, and a registered box had its nominal union name. Anything else was
`tyToEmitName`, the structural render. It now ends on `tyToNominalName`. That is the last
`tyToEmitName` call in `emit_shape_rows.vl`, so the render-parse baseline's ty-render total
falls from 22 to 21.

## Measurement

An `emitFail` probe where the render and the nominal spelling disagree fires on 9 cells of the
sweep population, for example `{x:i32}[]|null` against `Rec2[]|null` (D14551),
`{a:i32}|{b:string}|null` against `A|B|null`, and `{v:i32}|null` against `Box<i32>|null`.

Fixpoint seeds on both sides, over the whole sweep population, base master `5f7940e8`: same
23,942, bytes-only 3, output movers 0, runs → not-runs 0, new compiler traps 0. All three movers
keep their size, their type count and their lines; only the type indices reorder:
`arrays/nullable-list-elem-loopvar.vl`, `generics/literal-read-in-place-and-bare-param-result.vl`
and `generics/nullable-fold-nominal-lists-and-literal-box.vl`.
