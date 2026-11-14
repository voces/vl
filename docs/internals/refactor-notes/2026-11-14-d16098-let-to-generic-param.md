# D16098: a re-pointed `let` handed to a generic function parameter dispatches

**Change.** Two pieces, both in the checker. The design was approved before the build.

* **The tag rule.** In the tag decision's escape loop (`check_fn_tag.vl`), an escape whose site
  reads a widened `let` also dispatches when three conditions hold:
  * its set has an un-annotated or generic member (`ftWideEscOk`);
  * the members' results split at the instanced destination's parameters (`holeSetSplitsAt`);
  * every member's result is assignable to the destination's result (`holeSetFitsRetAt`, new in
    `check_relate_core.vl`).
  
  The last condition keeps a tag from creating a conversion the adapter would then refuse, so
  D9003's cell keeps exactly its one refusal. The escape is noted at the generic parameter's
  instanced type already, the D16091 precedent, so `fvaAdapt`'s early return for open
  destinations is unchanged.
* **The re-check.** Tagging asks for the adapter, so the check runs again (`fnTagEtaAgain`), and
  `fnLetWide` is recorded only in the first check. `fnLetKeptWide` (`check_elab_cap.vl`) keeps the
  first check's widened `let`s for the program. `holeLetJudge` then leaves a kept, un-vetoed one to
  the dispatch in the re-check, as it did in the first.

**Position matrix.** `set-value-to-generic-fn-param.matrix.vl` is extended with a cell for
`run(false)` and two must-stay-refused controls, graded both faces `--before/--after`:

| cell | before | after |
| --- | --- | --- |
| `let_differ`, `let_differ_false` | check refuses | RUNS |
| `let_misfit_closed` (D9003) | owed refusal | owed refusal |
| `let_misfit_generic` (`same<T>`, `str` does not fit `T`) | owed refusal | owed refusal |
| every other cell | unchanged | unchanged |
| `returned_agree` | emit refuses | emit refuses, D16099 |

Totals: 66 of 68 graded run, 4 owed refusals, 0 runs → not-runs, 0 silent.

**Fixtures.**
* `generic-let-writes-disagree-refused.vl` (D12214's) now runs, printing `1` and `s`, and is
  renamed `generic-let-writes-disagree-handed-to-generic-param.vl`.
* `written-let-of-hole-fns-handed-to-generic-param.vl` and
  `error-written-let-of-hole-fns-handed-to-generic-param-misfit.vl` are new.
