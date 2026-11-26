# A store's receiver below its index's branch (lane COV-UNION, 2026-11-26)

## The row

`store short-circuit operand` in regen-11 (`computed-scrutinee-evaluated-once.vl` `fields`,
`computed-scrutinee-once-where-it-stands.vl` `@init`): an element store `xs[i] = v` whose index
holds a statement (a valued `if`, a `match`, a `??`) written below the receiver, which legacy
writes first.

## The change

`elemStore` stages the receiver below the index's statement (`irBStageLeads` over the index's
range, as a later argument's earlier ones are) instead of refusing. The stage's inserted node
shifts the index and value starts, and the value's own stage then holds the staged receiver
and the index.

## Measured

- Sweep `tests/cases/lists/store-index-holding-a-branch-positions.vl` (a local, a record field,
  a parameter's `??` index, a global, a nested list's row, a value that branches too, top level):
  master blocks five functions and the start body; on the head none block and the `@log` lines
  hold under `VL_IR_REQUIRE_CLAIM=1`.
- Census A/B: `fields` is claimed; `@init` moves past the store to `expression if else prelude`;
  unclaimed 227 to 226; nothing lost.
- `tests/vl_ir_shadow_test.ts`: the three fixtures that used this store as a construct outside
  the set now use a spread list literal whose later element holds an `if` (`array spread
  short-circuit operand`). Coordinator ruling 2026-11-26: no test-only refusal hook; these
  assertions are deleted at I8 with the shadow.
