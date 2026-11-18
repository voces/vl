# B3 design: the elaboration builds arms from decided storage and never re-plans, 2026-11-18

Lane STORE. This is the design for the step that deletes `fnTagRedecide`, sent before any code. It
follows B2d (#8981), which made the check's decision final; B2e (#8985), which named the live late
arms; and B2f (#8989).

## The core rule

The tag decision runs once, at check. The elaboration builds each instance call's dispatch arms
from the decided storage for its (KeyId, parameter), and it never runs `ftPlan` again.

Today the late pass (`fnTagRedecide`, called in `elabPrepare`'s rounds) does three jobs:

1. **Re-commit.** `fnTagUndecide` wipes the check's tags. `ftTry` then re-plans each set the check
   tagged, first, and `ftCommit` builds arms at the instance calls (`ftBuildArmsAt` over the mint
   rows). That re-plan can refute the check, which returns 20 and ends in `emitFail`.
2. **Left to late.** It tags sets the check did not decide. These are the 392 rows of
   `scripts/late-tags-baseline.txt`.
3. **Post-steps.** Closure coercions over `mintCloRows` and `ftLateCloAt`, and the
   `fnTagEtaBuiltSets` retry.

Job 1 needs no plan. `ftBuildArmsAt(c, s, ds, leafTy, rs)` reads the following:
- the copy's call node `c` and the set `s` (the mint row's `mintFactCallOf` and `mintFactSetOf`);
- the set's members and leaf types (the check's commit);
- the per-member result types at that instance (`mintFactRsOf`).

The elaboration's re-check of the instance produces those result types, on nodes the elaboration
owns. They are typing facts about the copy, not a second storage decision. B3.1 therefore replays
the commit, and the later stages move each job-2 family to a producer at check.

## Measurement: each live arm split into re-commit vs left to late

Method (B2e's, on master plus B2f, fixpoint seed):
- force one `ftLate` occurrence after `ftLateRowOf` to `false`;
- refresh the compiler;
- diff `VL_LATE_DEMANDS=1 vl check --codegen tests` against the unforced output.

What each column counts:
- *refuted*: programs that end in "the tag decision after the elaboration refuted a function set
  the check decided". This is the arm's re-commit role.
- *new / gone*: late tag rows that appear or disappear. This is the arm's left-to-late role.

Site 1, the check's own fact retry, is excluded. The control is site 15, which reproduces the
earlier experiment exactly (64 changed / 54 refuted / 43 rows gone).

| site | code | changed | refuted | new / gone | role | removed in |
|---|---|---|---|---|---|---|
| 0 | `ftStoredAt` (`mintStoreNote`) | 1 | 0 | 0 / 3 | late | B3.4 |
| 2 | `ftPlan` lambda members closed (`mintLamClosed`) | 1 | 0 | 3 / 0 | late refusal | B3.5 |
| 3 | `mintSeedBindsOf` | 8 | 0 | 0 / 15 | late | B3.4 |
| 4 | `mintSeedHeldOf` | 0 | 0 | 2 / 1 | late | B3.4 |
| 5 | forwarded subsets over mint (`ftFwdInSubsets`) | 2 | 0 | 0 / 9 | late | B3.2 |
| 6 | one-member call evaluated once per instance | 2 | 2 | 0 / 5 | mixed | B3.1, then B3.2 |
| 7 | `mintSetPartial` refusal in `ftPlan` | 12 | 0 | 29 / 0 | late refusal | B3.6 |
| 8 | `ftHandsBack` per instance (`mintRetParamsOf`) | 24 | 16 | 0 / 29 | mixed | B3.1, then B3.3 |
| 9 | a member call read as a declared member, per instance | 13 | 0 | 0 / 88 | late | B3.3 |
| 10 | scans bounded by the check's arena (`ftDirectCountsGrow`) | 1 | 1 | 0 / 0 | re-commit (structural) | B3.1, or B3.6 if still live |
| 11 | `ftLateParamTakes` in `ftListCallHoleArg` | 0 | 0 | 1 / 0 | late refusal | B3.2 |
| 12 | `ftCloDelivered` | 0 | 0 | 0 / 2 | late | B3.5 |
| 13 | `ftReachHandsOne` | 1 | 0 | 0 / 1 | late | B3.2 |
| 14 | `ftLateParamOk` | 12 | 0 | 6 / 11 | late | B3.2 |
| 15 | `ftLateArgOfSet` | 64 | 54 | 0 / 43 | mixed | B3.1, then B3.2 |
| 16 | `mintSetPartial` in `ftLateArgOfSet` | 0 | 0 | 1 / 0 | late refusal | B3.2 |
| 17 | `ftEscBuilt` | 2 | 0 | 0 / 0 | late (build shape) | B3.5 |
| 18 | named record literals in `ftCtxOk` | 1 | 0 | 0 / 0 | late (build shape) | B3.5 |
| 19 | `ftOpenFieldHolds` | 5 | 0 | 0 / 10 | late | B3.5 |
| 20 | `ftHandedHolder`'s literal arm | 8 | 6 | 0 / 6 | mixed | B3.1, then B3.5 |
| 21 | `ftArgDstTy` | 4 | 4 | 0 / 0 | re-commit | B3.1 |

The split:
- **Re-commit only:** 2 arms (10, 21).
- **Mixed:** 4 arms (6, 8, 15, 20). They account for 78 of the 83 refuted program-sites.
- **Left to late only:** 15 arms.

A changed program that is not refuted is a program whose late tag goes, and which then hits an emit
reject. Examples: site 9's 13, mostly "monomorphize: unsupported argument type"; site 7's 12,
mostly validator failures. Sites 17 and 18 move no row; they change what a late commit builds, and
a program then fails to validate. Row counts overlap across sites. A stage's retired rows are
measured, never summed from this table.

## Staged PR sequence (each stage deletes code)

Every stage meets the standing bars:
- corpus identity or a graded matrix with 0 runs→not-runs;
- L2 fuel within +1%;
- `emit_mono.vl` at most 908;
- a flat census;
- the late-tags baseline written from a fixpoint seed, with the retired rows quoted;
- the late code it makes dead re-ablated and deleted in the same PR.

**B3.1 — replay, not re-plan.** At check, each plan that tags its sets is kept as a record of
everything the apply step reads (`FtRec`: the plan rows, held lists, closure, map and store
literals, written literals). At late, `fnTagUndecide` still clears the tables. Then each of the
check's records is applied again (`ftReplay` then `ftApply`), with the round's mint rows, so its
arms at the instance calls are built by `ftBuildArmsAt` with no `ftPlan`. The late decider plans
only sets the check did not tag.

*As built:* only the check's records are replayed. A set an earlier late round tagged is still
decided again each round. A first draft also replayed late-round records, and that moved one
program: `functions/hole-and-closed-function-handed-to-one-slot-through-a-list-runs.vl` gained
`tag P {id}`. Its witness (D15484) settles untagged because a later round refutes that late tag. So
the `i32ListHas(ftWas, s)` exemptions at sites 7, 11, 14 and 17 stay live, for late-round sets, and
go with the decider in B3.6.

Deletes:
- the re-commit loop in `fnTagDecide`;
- the refutation test, `fnTagRedecide`'s check-set loop (code 20's old meaning);
- sites 10 and 21, which re-ablation on B3.1 shows dead (0 changed, 0 rows);
- the re-commit halves of 6, 8, 15 and 20.

Code 20 now means a missing arm. `ftArmsCovered` fails when an instance call (a mint row) through a
tagged set has fewer arms than members, and `elabPrepare` then ends in `emitFail` ("an instance call
through a tagged function set has no arm for each member"). It replaces the refutation as the late
pass's loud internal check.

*B3.1 results* (fixpoint seeds both sides, master `ece7aa606`):
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: byte-identical to master's, late rows included
  (394, none gone or new; late demands 10).
- @run A/B over 6,724 programs: 0 wasm movers (byte compare of every built module).
- `check-filed-witnesses --strict` on both inventories: 5,468 graded, 0 MOVED, 3,432 checked
  against Want, 0 mismatched.
- The coverage check's control: a throwaway `ftBuildArmsAt` that drops one member's arm at
  instance calls makes 126 corpus programs end in the new `emitFail`; the real build makes 0.
- Re-ablation on B3.1: refutations at every site are 0 (site 8's 24 changed programs fall to 8,
  site 15's 64 to 11, with the same rows). Sites 10 and 21 are 0 / 0 / 0, so they are deleted. The
  other 19 still move rows.
- L2 fuel: 96.078G against master's 96.069G measured alike (+0.01%). Dropping the re-plan saves nothing
  measurable on the self-compile; the saving the design expected is not there.
- The 19 plan globals became one record (`ftP: FtRec`), so recording is one push and replay one
  assignment. Net compiler lines: +180 / −152.
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908).

Late rows: 394 on master, 394 after B3.1 (392 once B2f, #8989, lands).

**B3.2 — parameter takes per (KeyId, parameter).**
- Sites: 5, 6, 11, 13, 14, 15, 16.
- Producer: B2c's set-call rows (`arrowSetCallRows`, `IV_SET_CALL`) and B2a's row facts, extended
  to forwarded and handed-on parameters, read by the check's decision keyed by the instance
  vector.
- Deletes: `ftLateArgOfSet` (55 lines), `ftLateParamOk` (39), `ftLateParamTakes` (13), and the
  late branch of `ftReachHandsOne`.
- Mint readers deleted: `mintParamTakes`, `mintParamTakesSets`, `mintParamSetsOf`,
  `mintParamFwdInsOf`, `mintFwdFieldSetsOf`, and their notes in `emit_elab.vl`.
- Splits into B3.2a (15, 16, 11: arguments of calls through a set) and B3.2b (5, 6, 13, 14:
  handed-on parameters) if the first exceeds a reviewable size.

*After B3.2a:* arms die per family, not per site. A class-T lambda set needs site 15 (the argument
of a call through a set) and site 9 (the lambda leaf) together, so a stage is a set family moved
whole, and an arm goes only when its last family has moved.

**The outer-hole producer opens up after B3.2.** The A0 shadow's largest open class over the late
programs is `outer-hole`, 831 bindings: an instance nested in an instance, whose binding the check
leaves at the encloser's hole while the elaboration keys it after substitution. Next are
`arrow-args` (311) and `fn-value` (239). The producer substitutes each nested binding through the
encloser's key. Under the per-set scope of the veto it is likely what B3.3 to B3.5 meet next. B3.2a's 10 sets
opened by "open argument types" are the first to trace against it; that is not yet measured.

**B3.3 — hand-back and member-call arms per key.**
- Sites: 8 (29 rows), 9 (88 rows, the largest family).
- Producers: `check_hand_back` per key, beyond one hole parameter; and the instance's member call
  arm per (call, KeyId).
- Deletes: the late `mintRetParamsOf` reads and the late `FuncDecl`-as-member arm.

**B3.4 — written joins per key.**
- Sites: 0, 3, 4, plus B2d's outstanding slot and field joins (about 13 rows).
- Producers: `setBindWrittenJoin` for generic members (B2b's join, extended); slot and field joins
  per key over `cwSlotWrittenValues`; a literal's stamp per (KeyId, literal).
- Deletes: `ftStoredAt`, the late `mintSeedBindsOf`/`mintSeedHeldOf` reads and their mint
  readers, and `elabParamSeedsListSlot` (31 lines) and `elabParamSeedsRecField` (48).
- **The container-rewrite family is this stage's grading list**: D16240/41/42/43, D16920/21,
  D16213/14, D16220, D16144. All are one storage table read for a binding, slot or field:
  - D16213/14 need a literal stamped per instance (the per-node `repStampHeldRead` cannot);
  - D16144 is one parameter joined across two lists;
  - D16240 is a written alias read twice;
  - D16920 is a re-point one list or record level deeper.

  They are clause-2 rows the stage must run, graded per row with
  `joined-record-to-written-param-alias.matrix.vl` and the rows' own grading lists. B3.4 is not done
  while any of them refuses, unless the row is re-filed with the mechanism the ablation names.

**B3.5 — literal and closure reps per key.**
- Sites: 2, 12, 17, 18, 19, 20, plus the post-steps (`ftLateCloAt`, the `mintCloRows` coercion
  loop).
- Producers: a closure delivery per key (`sbCloDelivered` keyed), and an escape, an open field or a
  handed literal per key.
- Deletes: `ftEscBuilt` (19 lines), `ftOpenFieldHolds` (33), `ftLateCloAt` (34), the late arm of
  `ftHandedHolder`, `ftNamedRecLits`, and the readers of `mintLamClosed` and `mintClo*`.
- **F1's MAKERS family sits here**: D16845, D16819, D16840, D16923, D16926, D16295, D16933,
  D16934, D16079, D16130, D16131. A binding of a maker's result called at two signatures gets the
  storage value "a closure per signature called, from one evaluation": `mk` is evaluated once, and
  its captures are shared by the closures built at each signature. The contract it keeps (D16845's
  row): a directly bound hole lambda is built once per signature, and nothing widens to the join.
  MAKERS is a capability, not a deletion, so it ships as B3.5b after B3.5a's deletions, graded on
  its rows and a position matrix.

**B3.6 — the decider goes.**
- What remains at late: the refusals (sites 7, 16 and 2's new rows), which keep unsound late tags
  out. They die with the decider, because once the check decides every set no late candidate
  exists.
- Precondition: 0 late rows.
- Deletes:
  - `fnTagRedecide`, `ftLate`, `ftWas`, `ftCheckTagged`, `ftLateRan`, `fnTagLateRows`,
    `ftLateRowOf`, `ftLateOutsideExclusions` and code 10;
  - the tag half of `elabPrepare`'s rounds (41 lines; the loop keeps only `elabJoinDemandsTake`);
  - the late-tags ratchet, which reaches 0 and is retired;
  - site 10;
  - the remaining decision-only mint readers and writers.

## Deletion list (line counts on master plus B2f)

| where | what | lines |
|---|---|---|
| `check_fn_tag.vl` (6,318) | late-only functions: `ftLateArgOfSet` 55, `ftLateParamOk` 39, `ftLateCloAt` 34, `ftOpenFieldHolds` 33, `fnTagRedecide` 23, `ftEscBuilt` 19, `ftLateParamTakes` 13, `fnTagLateRows` 11, `ftLateRowOf` 9, `ftStoredAt` 9, `ftLateOutsideExclusions` 9 | 254 |
| `check_fn_tag.vl` | inline arms: 38 `ftLate` references and 8 `ftWas` references in shared functions, with the branches they guard | about 60 to 90 (counted per stage) |
| `check_mint.vl` (579) | readers and writers only the decision uses | 226 |
| `emit_elab.vl` | the 47 note calls feeding those readers; `elabParamSeedsListSlot` 31, `elabParamSeedsRecField` 48 | about 130 |
| `emit_sections.vl` | the tag half of the rounds, `refuted`/`outside`/settle failures | about 35 of 41 |
| `scripts/` | `late-tags-baseline.txt` (392 rows), the tag ratchet in `late-demands.vl` | ratchet retired |

That is roughly 700 compiler lines, before the producers each stage adds. A stage reports net lines,
and a stage whose producer outgrows its deletion says why.

## Risks

1. **Instance-copy keying.** The 52-refutation experiment re-planned check sets on facts keyed by
   the source node (`arrowSrcOf`). One source call has a different member subset or result type in
   each instance, so source keys cannot stand for copies. B3.1 avoids the problem: it builds arms
   from the elaboration's own per-copy rows and asks the check for nothing per copy. From B3.2 on,
   a fact moved to the check is keyed (source node, KeyId), with the KeyId from the instance vector.
   Prerequisite per stage: the A0 shadow (`$VL_INST_KEYS`) reports no `elab-only` key (arg-keyed,
   unrecorded, open or differs) over the stage's programs. A key the check cannot name is an
   instance its decision cannot see, so the stage stops and files it.
2. **Replay drops a loud check.** Code 20 is the only thing that notices an instance invalidating
   the check's plan. The coverage check in `ftBuildArmsAt` replaces it. The corpus has 0
   refutations at the baseline, so any refutation B3.1 shows is a finding, not a price.
3. **Response growth at copies.** `ftCommit` grows the types of the plan's response nodes. At late
   these can include copy nodes that `ftPlan` scans past the check's arena where site 10 does not
   bound it. Replay skips the scan, so if a copy's growth matters, B3.1's wasm A/B shows it, and the
   replay row records the growth per mint row.
4. **Rounds.** Replay changes what makes `grew` 1. The gate is identical late rows and identical
   wasm, not only identical diagnostics.
5. **Loss beyond the row.** A family moved to the check must keep each of its programs *running*:
   the non-refuted changed programs above are programs that lose a late tag and then hit an emit
   reject. Each stage is graded by the @run A/B, `check-filed-witnesses --strict` and the family's
   capability matrix, not by rows alone.
6. **Check-time cost.** Each stage moves work into the check for every program. B3.1's saving is
   the budget, and each stage's L2 fuel is reported against master measured alike.
7. **MAKERS widening.** The cheap fix (the lambda parameter at the join) breaks D16845's contract.
   The grading list includes the direct-binding control `const f = (a) => a / 2; f(3); f(3.0)`.

## Raw data

The per-site outputs (changed, refuted and row lists) were kept in the lane's scratchpad. The
script forces the k-th whole-word `ftLate` after `function ftLateRowOf(` and is reproduced in the
B2e note's Method.
