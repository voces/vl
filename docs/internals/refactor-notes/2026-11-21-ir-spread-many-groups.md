# IR spread, many groups (2026-11-21, lane IR-N3)

Array-spread PR 3 of 3 (PR 2: `2026-11-20-f1-spread-solo.md`). The builder took one lone spread
source and refused every other spread literal as `array spread groups`.

## The change

- `RSpread` carries each item group's list (`spSrcs`) and the group's node (`spGroups`): a
  spread's source, or a run of plain elements as legacy's own run literal (`spreadRunLit`). All
  run literals are minted before any group is built, as legacy's arm mints them.
- Each group is built as `emitSpreadGroup` emits it. A list literal is built at its own typed build,
  else at the group's kind and row; any other source as itself. A run literal legacy minted has no
  recorded rep, and is typed at its build's.
- The lowering writes each group, then its stash (`spreadGroupStash`), then the join
  (`spreadJoinGroups`) over the plan's group rows. A conversion or a sub row stays a named miss.
- **The note before the plan.** Legacy's `arrLitPrologue` makes `elabSpreadNote` before it asks
  `spreadPlanOf`. The note links the literals a spread holds to their holder, so `[[1, 2]]` in
  `[...[[1, 2]], ...[[3.5]]]` is typed at the joined `f64[][]`. Asked without the note, the plan
  minted the literal's own `i32[][]` and its lists at claim time. That is a shipped-output change the
  armed shadow cannot see, since legacy runs first there. The builder now makes the same note,
  which is idempotent, first.

## Witnesses

`tests/cases/arrays/spread-many-groups.vl` and `tests/ir-shadow-rows/spread-many-groups.vl`: four
functions, `array spread groups` on the merge-base seed, covered and matched after. Master's row
"a one-group spread matches beside a many-group one" now expects both functions covered.
`tests/cases/arrays/spread-nested-literal-joined-element.vl` is the claim-time witness: under the
note-less builder it shipped three extra list types.
