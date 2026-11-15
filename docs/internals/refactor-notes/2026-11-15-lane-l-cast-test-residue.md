# The cast and test residue, D16322 and D16320 — 2026-11-15

Lane L, its own residue from the `is`/`match`/`as` family. Ablated as one family first: the
three rows are three mechanisms, two of them closed here, and D16323 is a fourth membership
rule, which moves onto the shared predicate.

## What moved

- **D16322.** The partial-fit cast's rewrite always binds its operand (`$rc`), so the test narrows
  that binding and not the operand's name: a second cast of the name read it narrowed to a
  single record and was refused. A value `if` one of whose arms traps takes its other arm's union
  row (`ifArmsAllVariantIdx`, emit_classify.vl), so a field read off the cast finds the record.
- **A record cast.** `castRecordFitAt` gives a record operand the predicate the union one asks:
  contained, the operand handed back; partly, the same rewrite over the record itself.
- **D16320.** The multi-tag `is` chain declined every variant told apart by a field's value; it
  takes one where every operand arm holding its tag is tested (`isTagWhollyTested`).
- **The predicate moves.** `tyTestMemberFit` and its readers move from check_fit_rules.vl to
  check_relate_core.vl, so `asPinHolds`, the cast's pin re-ask and a fourth copy of the
  membership rule over `unionCoversTy`, asks it too.

## Evidence

- Matrix `partial-fit-cast-result-delivered` (`--before` master fixpoint): 38 of 46 cells ran,
  all 46 run; the 8 were the assignment positions, the second cast. 0 runs → not-runs, 0 silent.
- Fixture `tests/cases/narrowing/cast-and-test-residue-runs.vl`, distinct values.
- Tried and reverted: skipping the pin re-ask for `as?` so a pin that never fits answers
  `null` (D16323) built an invalid module at that pin; the row records the fact it needs.
- Seed fixpoint; `gate.sh`. Net compiler lines in the PR; emit_mono.vl unchanged at 908.
