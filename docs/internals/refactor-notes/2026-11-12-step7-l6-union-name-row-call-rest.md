# Step 7 L6: a call's inferred return and checker-type fallback hand back their row, 2026-11-12

This is step B, part 7, of the `unNames` spelling readers: the call rung's branches part 5 left
with no row. A probe compared each candidate row against the row the returned name is bound to
(`unRowOfName`). It sorted a disagreement into a twin (another row under one spelling, with the
same atoms in the same order) or a real difference. The population is the whole sweep, 24,072
programs. Counts are programs.

| branch | candidate | reach | same | twin | differ | no row |
| --- | --- | --- | --- | --- | --- | --- |
| inferred value union | inferred type's key | 80 | 74 | 5 | 2 | 0 |
| inferred value union | the same, with no literal leaf | 80 | 68 | 0 | 0 | 13 |
| inferred `boolean \| null` box | inferred type's key | 40 | 40 | 0 | 0 | 0 |
| checker-type fallback | node type's key | 117 | 102 | 1 | 1 | 0 |
| checker-type fallback | instance type's key (`nodeTyInOf`) | 116 | 102 | 1 | 0 | 0 |

The 2 inferred differences (D9561, `literal-unions/coalesce-hole-call-litunion-join.vl`) key the
literal alias row `W`, whose atoms are `i32,i32,i64`, where the name's row is `i32,i64`. A type
with a literal leaf records no row. The fallback's twin is
`literal-unions/mixed-width-litunion-function-boundary.vl`. The inferred `boolean | null` count
is from part 5's probe.

## Changed

- The inferred-return branch records the inferred type's row, unless that type has a literal
  leaf. The `boolean | null` box records it always.
- The checker-type fallback records its instance type's row.

## Left

The instance hole-parameter branch and the closure-array element branch reach no program in the
sweep, so they record no row until one is graded.

## Proof

- **Targeted.** The 156 of the 222 cells reaching these branches that are files were built and
  run on a master seed and this one: 156 identical in module bytes and output. CI's sweep is the
  proof for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
