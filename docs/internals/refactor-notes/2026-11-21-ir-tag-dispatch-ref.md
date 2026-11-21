# IR: a tagged call's reference result, 2026-11-21

Lane IR-N6, step 8, stacked on steps 4 to 7 (`2026-11-21-ir-indirect-call.md`). The coordinator
ruled the tag-dispatch family IR-N6's. A call through a tagged function set whose result is no
scalar or string missed (`tag dispatch result`).

## The change

- `tagDispatch` takes a record, list, map or closure result. Each arm is its call at that rep as it
  stands, which is legacy's `emitExpr` arm in `emitFnTagDispatch`.
- `valuedIfOpen` opens a dispatch's valued `if` at a reference out through legacy's
  `tagDispatchIfOf`, as it already did for a string out.
- **Guard.** An index read of a tagged call's list (`g(x)[0]`) banks the read-index span rows
  `spans: read index` names (IR-N3's class, as at `2026-11-21-ir-indirect-call.md`'s guard), so it
  is a named miss (`index of a tagged call`). Without it, 5 `tests/cases` functions mismatched.
- A union result stays a miss: each arm is boxed (`emitUnionBoxOwed`).

Compiler lines +23 / −2 (`ir_build.vl` +12 −1, `ir_lower.vl` +11 −1). The shadow row
`tests/ir-shadow-rows/tag-dispatch-ref-result.vl` builds a list result bound to a `const` and pins
the index read's miss.

## Readings (base: steps 4 to 7 merged with master `026aee96`, fixpoint; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 58,212 | 58,240 (+28) |
| `tests/cases` `tag dispatch result` (any) | 110 | 70 |
| corpus functions with no blocker | 43,141 | 43,141 |
| armed `tests/cases` covered = matched + 11 `node-in array: differ` | 58,212 | 58,240 |
| L2 self-compile fuel | 104,497,795,215 | 104,539,419,776 (+0.040%) |
