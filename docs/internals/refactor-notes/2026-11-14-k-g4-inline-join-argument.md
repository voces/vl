# G4 (a): an inline record join handed to an un-annotated parameter is decided as a binding's, 2026-11-14

Lane K. Sub-shape (a) of group G4 in lane B's census of the un-annotated-function-in-a-container
family: an inline value `if` or `match` handed to an un-annotated parameter refused, while the same
join bound to a `const` first ran. Closes D15333, D15807, D15808 and D15809.

## Mechanism (probed)

A scratch compiler logged every `ftTry` and each `return false` of `ftScan` and `ftPlan`. On
D15333, the bound spelling tags set 2 after the elaboration. Inline, the scan stops at the
holder-context check for the `if` node under the call (`ftHoldCtxOk`, `Call` arm). That arm took a
holder handed to a hole parameter only when it was an `Ident`, a named call or, after the
elaboration, a literal. A value `if` is none of them, so the set stayed closures and the emit
floor refused. D15809 stopped at the same check.

D15807 and D15808 never reached the emitter. The check's slot judge (`holeSlotArgJudge`) had an
inline-`if` arm that never lifted, and `holeSlotOpenIfArgs` refused an inline `if` at open call
types. The bound spelling is lifted at depth 0.

## Change

- **`check_fn_tag`**: `ftHandedHolder` is the one reader of what a hole parameter takes as a
  holder. It covers the shapes the `Call` arm already took, plus a value `if` or `match` whose
  every tail is one of them. The two old clauses are folded into it.
- **`check_relate_core`**: the inline `if`/`match` arm lifts as a binding's initialiser does
  (`lift && depth == 0`). `holeOpenIfNote`, `holeSlotOpenIfArgs`, `holeTysAtCall`,
  `holeOpenRetsDiffer` and their four arrays are deleted, because nothing refuses the inline spelling
  apart from the bound one now. `cwParamArgCalls` is no longer exported.

## Grading

Fixpoint seeds on both sides, `--before` master `293074baf`.

- The four witnesses print `3.5`, `4`, `4` and `4 4 1.25`, and their bound twins still run.
  `check-filed-witnesses --strict` moves exactly these four rows and nothing else.
- New `inline-join-handed-to-hole-param.matrix.vl`: 14 cells moved to RUNS (each inline spelling,
  both faces), 0 runs→not-runs, 0 silent. The annotated face of the bound cells refuses on both
  seeds (`{f: (_) => _}` cannot be used as `{f: (i32) => f64}`).
- `record-fn-field-two-results.matrix.vl`: its six `arg_*` cells moved to RUNS in both faces (12 cells),
  0 runs→not-runs.
- The 26 other templates that hand records to an un-annotated `take`/`g`/`show`: 0 runs→not-runs,
  0 new silent. One SILENT cell is the same on master and is filed as D16251.
- `regress.vl`: 0 of 11,929 distilled cells differ between the two seeds.
- The forwarded spelling `fwd(if …)` still refuses at check, as `fwd(q)` does.

## Not in this group

- **D15431**: its bound twin, `const a = get3(true); show(a)`, refuses too, and the probe stops at
  `ftMemberSeenAtArms`, not the holder check. Running without the `show` parameter is a different
  ablation.
- **D16250**: record literals handed to `take2` beside a bound join refuse whether they are bound or
  inline. Split off D15809's ablation.
- **Sub-shape (b)**, D15334 and D15900, a literal argument. D15334's set is tried only before the
  elaboration, where the holder check refuses a literal. D15900's set is tried again after the
  elaboration and stops at the context of the member's name inside the record field (`ftCtxOk`,
  `FieldInit` arm). That needs more than this change.
