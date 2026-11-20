# IR: a valued match chain's links (2026-11-20)

`rep ?` held 16 self-compile functions: nodes the checker never types. Each is something
`matchLower` builds when it desugars a valued `match` into an if chain. `checkNodeHook(built)`
checks the head and `matchCondStamp` stamps the `==`/`||` arm tests, leaving the chain's later
links (12), its `is` tests (3) and a wildcard's `true` (1) at no type.

## Mechanism

- Links: legacy's `emitIfExprAs` writes every link at the head's kind, `ifJoinPlanOf(head)`;
  it never reads a link's own type. The IR's `ifExpr` asked each link for its rep
  (`primRepOf(link)`); it now takes the head's rep and type for every link. The head's rep must
  give the join plan's block valtype (`ifExprJoinVt`, read under the prelude scope
  `ifExprPlainWhy` uses): a valtype comparison, since two reps can share one, and each arm's value
  is still rep-checked at its own delivery. A disagreement is the miss `expression if join kind`.
- Arm tests: `matchCondStamp` stamps a lowered `is` test and a wildcard's `BoolLit` `TY_BOOL`,
  beside its `==` and `||` stamps.

## Legacy readers of the newly typed nodes

Only the arm tests gain a type (the links are not stamped). Legacy's `emitCondExpr` writes a test
without reading its type; the `tests/cases` A/B and corpus `--names` identity read 0 moved.

## Witnesses

`tests/cases/match/valued-match-chain-links.vl` and `vl_ir_shadow_test`: a literal-union `match`
chain, a three-arm type-pattern chain, a wildcard arm, a `match` whose arms widen under an f64
head, and a widening else-if chain; all five covered and matched (two were `rep ?` misses), output
true true 8 7 5.5 4.5.

## Readings

Against a fixpoint at the merge-base 35c575718 (candidate a fixpoint, 6,916,500 bytes):

- Self-compile `rep ?` 16 → 1; functions covered 18,850 → 18,859 (+9). The other six it freed now
  block on named misses further on: `is rung` 8 → 11, `for in pinned slot` 0 → 1, `index element
  coercion` 1 → 2, `rep novalue` 7 → 8, `map store short-circuit operand` 15 → 16 (its `rep ?`
  pairing).
- Corpus functions with no blocker 41,684 → 41,684: the corpus's 49 `rep ?` are another family.
- `tests/cases` A/B 7,251 same, 0 differ; corpus `ir-identity --names` 9,037 identical, 0 differ,
  self-compile identical; `--cases` 7,531 identical, 0 differ; witnesses 59 same; mode-3
  self-compile identical.
- L2 self-compile fuel 104,120,092,137 → 104,119,646,204 (−0.0004%); late demands 9 of 9, late tag
  rows 307 of 307; phase-state ok.

## Next row

The one `rep ?` left in the self-compile is an untyped `BoolLit` in `collectVariantFields`, not
a lowered match: another shape.
