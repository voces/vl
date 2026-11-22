# IR: a `??` written in place after an earlier operand, 2026-11-22

Lane IR-N4, the self-compile tail. A `??` the IR writes in place (`SCoalBox`, its out left on
the stack for its one read) refused any operand built before it. `irBStageLeads` refused it as
an argument after another (`short-circuit argument after another`, via `inPlaceFrom`), and the
six coalesce builders refused a pending temp ahead of it (`coalesce <arm> after an operand`).
Legacy writes the earlier operand first, then the `??`, its value staying on the stack.

## Change

- `coalArmStagesLeads` (ir.vl) names the arms that stage: a niche cell's `if` (`litUnion`,
  `nulBool`) and a nullable reference's block (`nulRef`), which read only their operand before
  they open. It is an exhaustive match, and both sides call it.
- `coalBox` (ir_lower) stages, along those arms, the temps an earlier operand left pending below
  its operand with the valued `if`'s own `stageLead`, under the same floor push and pop.
- `irBStageLeads` stages earlier arguments below such an `SCoalBox` as it does below a valued
  `if` (`coalBoxFrom(b, at, true)`, `coalBoxOut`); one along any other arm stays in place and
  refused, as before. `inPlaceFrom` and its other callers are unchanged.
- The niche and nulRef builders drop their `after an operand` refusals; the boxed, field,
  optional and fused-pop ones keep theirs.

New predicates (R8): `coalArmStagesLeads` is a fact about the lowering's own arms, and
`coalBoxFrom`, `coalBoxOut` and `receiverStageFrom` read only the IR's nodes. None restates a
legacy condition.

The first cut staged along every arm. On the self it left 12 functions
`unlowered: stack value read out of order` (a fused map read also reads its key). Once that was
excluded, the armed `tests/cases` shadow found a field arm after an interpolation part
(`operand above a valued if's value`) and a numeric box arm after a literal argument
(`spans: read index`). So the change is cut to the arms the self-compile's witnesses use.

The shadow row is `tests/ir-shadow-rows/coalesce-after-operand.vl`.

## Readings (fixpoint seeds, base 8b8ac208)

| reading | base | head |
| --- | --- | --- |
| self `blockers none` | 19812 | 19814 |
| self `coalesce niche after an operand` | 2 | 0 |
| self `coalesce nulRef after an operand + …operand temp` | 1 | 0 |
| corpus shadow covered = matched | 45099 | 45099 |
| `ir-identity --names` | | identical 9037, differ 0; self-compile identical |
| `ir-identity --cases` | | identical 7619, differ 0; witnesses differ 0 |
| `--claimless` | | identical 14019, differ 0 |
| `tests/cases` armed shadow A/B | | identical 7333, differ 0 |
| `stack value read out of order`, `operand above a valued if's value` | | 0 on self, corpus, tests/cases |
| L2 fuel | | +0.02% (same-tree pair +0.00%) |
| late demands / tag rows | 9 / 307 | 9 / 307 |
| seed size | | +2.7% of baseline, pass |
