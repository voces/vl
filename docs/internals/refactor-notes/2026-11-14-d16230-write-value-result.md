# D16230: the value of a write leaf is decided with the container's set, 2026-11-14

Lane M. Follows #8030 (D15136, D15190). This is the clause-1 row that close filed.

## Mechanism

`put(ys) { ys[0] = half }` returns the assignment's value. Its result type carries the singleton
set `{half}`. The write leaf (`fnTagWriteLeavesOf`) tags `{inc0, half}`, and `half`'s write node
emits its id. Where a call goes through `g = put(xs)`, `{half}` is tagged too, and `put` is marked
as returning an id (`fnTagRetMark`). Where nothing calls `g`, only the wider set is tagged, and
`put` returns a closure-typed local holding the id. Measured with identity-shadow rows from a
scratch compiler that was never refreshed into `build/`.

## Change

- **`fnTagWriteLeavesOf`** (check_elab_cap.vl) takes a fourth out-list: the set each taken
  write's own assignment value carries (`fnWriteValueSetOf`). Its one reader (`ftPlan`,
  check_fn_tag.vl) puts those sets in `ftSubNeed`, so they are decided with the container's set,
  all or none. This is the same producer that types the leaf, not a separate result rule. Only a
  value that is read counts: one inside an expression, or the tail of a function whose result is
  consumed (`fnResultUnconsumed`). Reporting every write made
  `closures/fn-list-written-through-param.vl` (D14648's fixture, whose writer's result nobody reads)
  refuse, since its value's set then had to be planned and declined.
- **`ftWiderWriteLeaf`** (check_fn_tag.vl): in the smaller set's scan, the write's store context
  accepts a value the producer took as a leaf of a wider set that is planned in the same round or
  already tagged. Without it, the list spelling passed only through `ftParamHolderHolds` (a bare
  parameter handed lists directly). The record field (`o.xs[0]`) and the hand-on through `hand`
  declined, and the decision fell back to the loud emit refusal.

## Grading

Fixpoint seeds on both sides: `--before` master `42c79fce` (its seed is byte-identical at L2/L3),
and the after seed is byte-identical on a second refresh.

- Witness: invalid module → `1.5`. Neighbours, all invalid modules on master, now run: record
  field held (`1.5`), held in a list (`1.5`, `1`), handed back through `hand` and called
  (`1.5`, `4`). Already running and unchanged: the call through `g` (`1.5`, `2`), and the
  sum `xs[0](3) + g(6)` (`4.5`).
- New `fn-list-write-result-through-param` 40 → 40 (the delivered result is called, as on
  master), and `fn-record-field-write-result-through-param` 0 → 40. Both have 0 runs→not-runs
  and 0 silent.
- Unchanged, with 0 runs→not-runs and 0 silent: the six grids from #8030 and the ten family
  grids that note lists.
