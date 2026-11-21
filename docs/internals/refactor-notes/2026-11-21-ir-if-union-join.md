# IR: a value `if` on the union join, and a list element staged below a valued `if`, 2026-11-21

## A value `if` joined at a union box

`ifExprPlainWhy` answers `union` for a value `if` that `ifJoinPlanOf` joins at a union box, and
the IR built none (`expression if union`: 14 corpus functions, 4 in the self-compile). Legacy's
`emitUnionIfValue` writes a chain of `if`s at the box's blocktype. Each arm runs its prelude and
then writes its value boxed into the join's union (`emitUnionBoxOwed` at `nodeTyInOf`). A missing
`else` is the null box, and an `else if` is the next link, opened inside the `else`.

- `unionIfExpr` / `unionIfLink` / `unionIfArm` build that chain. Each arm's value is delivered at
  the box rep through `deliver` (the hole box plan), a missing `else` is `RNullOf` with
  `NULL_OWN_BOX`, and each link's out is the box.
- The lowering's `valuedIfOpen` opens a link whose out is a box and whose node plans the union
  join at legacy's blocktype (`fbOpenIf`, `fbValtype("union")`).
- Named misses:
  - `union if chain join`: an `else if` link whose own arms plan another join, which legacy still
    writes at the head's box;
  - `union if rep`: a join whose IR rep is a record, not a box;
  - `union if static condition`;
  - `union if arm`: an arm whose tail is itself an `if`.

## A list element before a valued `if`

On master a list literal with an element before a valued `if` failed to lower, as a fail row on a
claimable function: "unlowered: operand above a valued if's value". Two witnesses on master's seed:
`cnt([n, if c { 1 } else { 2 }, n])` and `[s, if c { "a" } else { "b" }]`. The union join exposed one
more instance in the self-compile, `ir_helper.vl`'s `placeEntry`. `arrayLit` now stages each earlier
element below a valued `if` through `irBStageLeads`, as call arguments are staged, else the named miss
`short-circuit array element after another`. The coordinator ruled that it stays in this change.

## Readings (merge-base `5d2c2b81f`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus `expression if union` (alone) | 14 (5) | 0 |
| corpus functions with no blocker | 43,118 | 43,119 (+1) |
| self-compile `expression if union` | 4 | 0 |
| self-compile functions with no blocker | 19,247 | 19,251 (+4) |
| self-compile armed shadow covered = matched | 19,247 | 19,251 |

Most of the union-join corpus functions stop next at `print union if` or a box plan's rung.

Legacy lines deleted: 0. Moved to `@ir`: 0.
