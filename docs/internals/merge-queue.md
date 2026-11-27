# Merge queue — how a PR gets from READY to master

The procedure the coordinator runs as the merge queue, and what a lane must send it. CLAUDE.md
holds the rules ("Gates", "Agent concurrency"); this page holds the steps. Who proves what is
CLAUDE.md's "Each proof runs once" bullet: the lane proves its change once, the queue proves the
merged tree, and the reviewer reruns only a reading it disputes.

> **Superseded in part, 2026-11-25 (coordinator ruling).** CI is the queue: trains, verifier lanes,
> PRE-REVIEW and lane-claim broadcasts retire. A lane follows [`lane-brief.md`](lane-brief.md), and
> the rulings O1 to O6 are in [`orchestration-reset-2026-11-25.md`](orchestration-reset-2026-11-25.md).
> Below, R1 to R12 and Q1 to Q71 are kept as history and as the reasons behind each check. Where
> they conflict with O1 to O6, O1 to O6 win.

## READY

A lane that wants its PR merged sends one line:

```
READY #<pr> <full 40-char head sha>
```

The sha is the head the lane proved. A READY with no PR number, or a short sha, is sent back. After
a master merge the lane sends a new READY with the new sha, and says whether the resolution was
mechanical (lists, imports) and so proved by `scripts/gate.sh --fast` alone.

## Who may merge on what

- **IR PRs** need the IR reviewer's OK on the head being merged. A non-mechanical change after
  that OK needs a re-OK.
- **Docs- or scripts-only PRs** merge on green CI; the queue does not gate them.
- Everything else merges on a passing queue gate (below).

## The steps

1. **Merge-tree against the current master**, not the master the lane started from:
   `git merge-tree --write-tree origin/master <head>`. The queue resolves a purely additive
   conflict itself (step 2) and names it in the candidate's merge commit; any other conflict sends
   the PR back to its lane.
2. **Batch PRs whose candidate merge-tree builds cleanly** (Q1), not only PRs touching disjoint
   files. They are merged into one candidate and gated once. When a batch is red, bisect it by halves. `scripts/queue-candidate.sh <base>
   <pr-branch>...` builds the candidate: it resolves a conflict only where both sides add list
   members at one place (the union, sorted where the list is) or whole single-line arms or type
   declarations with distinct heads (coordinator ruling, 2026-11-21), checks each resolved file
   with `vl fmt --check`, and refuses any other, naming the hunk, so that PR goes back to its lane.
3. **Gate the candidate**: `scripts/gate.sh` (in the queue's worktree, the one place
   `GATE_IN_WORKTREE=1` is set), read by its exit code. Behaviour is graded by each program's pinned
   output (the corpus oracle, the distilled corpus, the filed witnesses, the probes), all in the gate
   and in CI; the claimless comparison retired with legacy (ir-i8-cutover §8).
4. **Squash-merge** each PR with `expectedHeadSha` set to the full head sha that was gated, so a
   push after the gate cannot ride on it.

### Tree equality

A head that only merged master can merge on a prior gate if its tree equals the gated tree. A
master move that touches only docs or scripts does not invalidate a gate. After a batch merges,
master's tree must equal the gated tree merged with any such master move; a member dropped from a
batch means the remaining subset is gated again before it merges.

### Velocity rules (coordinator ruling, 2026-11-21, velocity retro)

For lanes:

- **R1.** A clean merge of master needs no re-check.
- **R2.** A mechanical resolution (lists, imports) is proved by `scripts/gate.sh --fast` alone.
- **R3.** Retired with `--claimless` (ir-i8-cutover §8).
- **R4.** A stack is proved once, at its top.
- **R5.** One owner per blocker class; the coordinator assigns it.
- **R6.** An OK'd PR waiting only on a waived re-proof counts as READY.
- **R7.** A PR touching `compiler/ir*.vl`, or moving an IR miss name or coverage, runs
  `deno test -A --no-check tests/vl_ir_shadow_test.ts` on its head before READY and quotes the
  summary line (coordinator ruling, 2026-11-21: batch AB was red on two stale miss expectations,
  and `gate.sh --fast` does not run that file). Since #9456, `gate.sh --fast` runs it.
- **R8.** A READY lists each new IR admission or route predicate and the legacy function whose
  answer it calls (coordinator ruling, 2026-11-22, after three parallel-mirror vetoes).
- **R9.** Propose and proceed. A lane with a design question sends it to the coordinator and starts
  building its recommended option in the same turn. The coordinator replies only to redirect; if no
  redirect has arrived when the build is ready for its full proof, the recommendation stands. An
  ownership question (R5) names the lane's guess and starts on it (coordinator ruling, 2026-11-22).
- **R10.** A change that adds an IR admission predicate, a node kind or a builder query is sent as
  `PRE-REVIEW <branch> <sha>`, with its R8 list, before its full proof. The queue reviews the diff
  for mirror, dead-export and claim-time-mint vetoes and answers OK or names the veto, ideally
  within 15 minutes, ahead of building the next train (coordinator ruling, 2026-11-22). Since Q17
  (2) it is non-blocking: the lane proves in parallel and redoes the work on an objection.
- **R11.** A PR that re-files an inventory row (fixed, closed, regraded) runs
  `vl run scripts/check-filed-witnesses.vl -- --strict docs/internals/inventory docs/internals/inventory-2`
  and quotes 0 MOVED: `gate.sh --fast` does not run the filed-witnesses row, and a status line whose
  only outcome phrase is a `was:` clause still grades as the old outcome (#9491, D17044; queue
  practice, not a ruling).
- **R12.** A PR that removes an import checks the symbol it stops importing: an export no other
  module reads is a new dead export (#9490, `svDstOfKind`; queue practice, not a ruling).

For the queue:

- **Q1.** A candidate is batched when its merge-tree builds cleanly (step 2).
- **Q2.** (Train size superseded by Q17 (3).) A train departs at 6 to 8 READY PRs, or when the gate has been idle 15 minutes with at
  least one READY. The next candidate is assembled while the current one is in verify. When the
  queue is empty a train departs at one or two READY PRs, and a candidate not yet gating takes
  each new READY that merges onto it (coordinator ruling, 2026-11-22: a batch costs about 35
  minutes whatever its size). A force-push to an existing `vl-queue/*` branch is refused, so a
  replaced candidate takes a new branch name.
- **Q3.** The queue resolves a purely additive conflict itself: a union of list members in sorted
  or declared order, or the whole single-line items of step 2. A hunk where one side edits a line
  and the other only adds lines beside it, so that no line is edited by both, is resolved the same
  way (coordinator ruling, 2026-11-21). Anything else goes back to the lane.
- **Q5.** Every queue gate passes `SELF_COMPILE_BASE=<the train's base candidate>` and
  `SELF_COMPILE_BASE_SEED=<its fixpoint seed>`, so a train is graded on its own rise, not on
  master's drift (coordinator ruling, 2026-11-22, with #9507). A test that runs
  `self-compile-time.sh` sets those variables itself rather than inheriting them.
- **Q6.** A squash is simulated with `git merge-tree --write-tree`'s own exit code; piping it into
  `head` first hides a conflict (queue practice: train AS3's #9482).
- **Q7.** A PR that changes the `vl` host gates with the candidate's own host: built with an
  isolated `--target-dir` and copied into that gate worktree's own `scripts/vl-host/target/release`,
  never the shared target. After it merges, the queue rebuilds the shared binary
  (`rm target/release/vl && touch src/main.rs`, then `cargo build`), checks it behaviourally, and
  confirms to the coordinator in the same turn (coordinator delegation, 2026-11-22, #9508).
- **Q8.** A detector row is never narrowed to the files where it has known rows: it exists to
  catch a new case. Gate rows accepted on 2026-11-22 (coordinator rulings): `ir claims`'s
  filed-witness half, about +90 CPU-s (#9496; revisit at I8), and `ir prepost`, about 170 CPU-s
  (#9508), temporarily, until the armed-shadow row is folded into it (T12). Both retire at I8.
- **Q9.** The deep-nesting stack margin (`tests/vl_deep_nesting_test.ts`, `MARGIN_KB` 940) is
  not recalibrated while its erosion is unattributed. A PR whose head raises the failing KB by more
  than 8 KB on its base is vetoed with the bisect. A smaller rise passes and is named in the PR.
  A lane touching statement or expression recursion (`ir_build`, `ir_lower`, the emit ladders)
  quotes the head-vs-base edge before READY, from the inner case
  (`VL_DEEP_MARGIN_INNER=1 deno test -A --no-check --v8-flags=--stack-size=<KB>
  tests/vl_deep_nesting_test.ts --filter "labelled while loop, checks"`, 10 KB steps). If one PR
  accounts for 15 KB or more of the erosion, it returns to its lane. An erosion spread across PRs
  is the dual-path period's price, and only the test's comment is updated to the measured numbers.
  Headroom is expected back at I8 (coordinator ruling, 2026-11-22, after #9517 redded train BD10).
- **Q10.** A lane that merges a `vl-queue/*` branch takes every member in it, including one later
  pulled from its train. Before READY, check the branch carries no vetoed PR
  (`git merge-base --is-ancestor <vetoed head> HEAD`). If it does, rebuild the branch from master
  or the current train and open a new PR, since dropping commits would need a force-push (queue
  practice: #9519 and #9528 merged BD3, which held #9517).
- **Q11.** Seed-size drift is refreshed the way fuel drift is. The queue writes a scripts-only
  refresh from a fixpoint seed at master. The body gives the cumulative rise, the commit range and
  the mechanism (IR dual-path growth, expected to shrink at I8), plus a per-train size column that
  names any single train at 1% or more (coordinator ruling, 2026-11-22; first instance #9560).
- **Q12.** Before gating a candidate, check that every IR kind list is sorted
  (`tests/ir_lists_layout_test.ts`), as well as every import block. Git's auto-merge unsorts both:
  BJ1 (#9546 beside #9541) and BL2 (#9556 RNumIs after #9548 RNumUnionBin). A train built before a
  master scripts-only change carries that file in its first step, so its gate grades against
  master's current ratchets (queue practice).
- **Q13.** Never edit a log in place while a job appends to it. `sed -i` swaps the inode, the job's
  later output goes to the deleted copy, and the gate's reading is lost (BL3 had to be re-gated).
  Give each train attempt its own log (queue practice).
- **Q14.** (Retired with `ci-ir-identity`, 2026-11-27: no claimless compiler is left to compare against) A 0-differ `--claimless` covers only the shapes its cells hold. D17048, a claimed
  narrowed box-field read shipping invalid wasm since #9259, never reached a cell. So a soundness
  fix adds its witness as a tests/cases program that runs and prints, and the queue asks for a run
  proof, not a byte argument, on any admission that reads a value at another rep without a
  conversion (queue practice; the coordinator ordered a one-off claimed-vs-claimless discovery
  sweep after the fix).
- **Q15.** A coordinator-ruled, behaviour-preserving legacy byte change (here: legacy takes
  `sharedFieldRecvSlot` after lowering its operand, so the IR's natural order matches) is graded
  differently from an IR PR. Run outputs are unchanged across tests/cases and the corpus, and the PR
  lists every program whose bytes moved. Its `--names`, `--cases` and `--claimless` differ set must
  equal that list exactly, each a local-index-only change shown with `wasm-dis`. A differ outside
  the list is a veto (coordinator ruling, 2026-11-22).
- **Q16.** One-fix-per-PR does not apply to large refactors, this IR work included (owner ruling,
  relayed by the coordinator, 2026-11-22). A lane batches freely: 30 or more functions, or a whole
  class family, in one PR. The PR gives a before→after reading per class and keeps one commit per
  mechanism, so a veto can split it. Two separations stay: a deliberate legacy byte change (Q15)
  goes in its own PR first (relaxed by Q17 (1)), and a soundness fix may go small and alone to
  jump the queue. The queue may ask a lane to split off a vetoed mechanism.
- **Q17.** Velocity (owner ruling, relayed by the coordinator, 2026-11-22). (1) A legacy byte
  change may ride with its IR side in one PR, if the PR lists the programs whose bytes moved
  base→head and shows that claimed-vs-claimless at head differ 0. (2) R10 pre-review is
  non-blocking: a lane proves in parallel and redoes the work if the queue objects. (3) A train
  takes every READY PR, and is split only when a step fails (this replaces Q2's 6-to-8 size).
- **Q18.** (Retired with `ci-ir-identity`, 2026-11-27: no `--cases` or `--claimless` run is left) The queue no longer runs `ir-identity.sh --cases` or `--claimless` per train. The
  verifier proves both on the merged tree, and the queue keeps the full gate. A second verifier
  (IR-V2) takes alternate trains (coordinator ruling, 2026-11-22).
- **Q19.** Verifier self-test cases are keyed by string id, not by position: positional `want`
  numbers collided across five lanes in one afternoon (coordinator ruling, 2026-11-22). It landed
  as #9597, owner IR-D1; Q29 handles the list ends where keyed ids still meet.
- **Q20.** A byte-free RRetag between records requires struct identity. Wasm struct types are
  nominal here, so that means the same heap, or for width the declared sub chain. The verifier
  reads it from an IR-side note (`IrFn.irRecHeap`), never from an emit query (coordinator ruling,
  2026-11-22; DECISIONS.md). Found when `repFillsHole`'s record arm recursed forever on recursive
  record twins (`type L1 = {n: L1|null}` beside an L2 twin), a compiler stack overflow caught by
  `tests/cases/structs/structural-twin-heap-dedup.vl`, and when it was seen to admit field-alike
  records on different heaps.
- **Q21.** A docs-only inventory-row PR skips ci-witnesses in CI, so before merging one the queue
  quotes `vl run scripts/check-filed-witnesses.vl -- --strict docs/internals/inventory docs/internals/inventory-2`
  on the row. D17052's row (#9595) carried a `// PRINTS` repro comment that the grader parsed
  verbatim, and master's filed-witness step was red until #9616 (queue practice).
- **Q22.** A train carries a docs-only overlay of master's `docs/internals/inventory`, so the
  gate's inventory-refs row reads rows filed after the train's base (queue practice; narrowed by
  Q28).
- **Q23.** Never start a train's gate while an earlier run of that train still holds the same
  worktree, and never run a heavy check beside a gate. Each cost a re-gate on 2026-11-22, the
  second through an OOM kill (queue practice).
- **Q24.** Stack-margin attribution (Q9), reported by the verifier: #9414 (IR-N7) accounted for
  +35 KB of the deep-nesting edge (890 → 925 KB). Its fix, moving the RTagStash arm out of
  `node()`'s frame (#9600), recovers the edge to 896 KB and has landed.
- **Q25.** While trains are in flight, a lane merges the newest announced
  `origin/vl-queue/<train>` tip, not `origin/master`. Master lags the trains, so merging it gave
  cross-lineage conflicts that refused four PRs on 2026-11-22 (#9609, #9605, #9627, #9628) (queue
  practice; replaced by Q31: a lane now merges `origin/master` only).
- **Q26.** A Q15/Q17 moved-programs list covers `scripts/capability-probes` as well as tests/cases
  and the distilled corpus. On 2026-11-22 #9599's list missed
  `scripts/capability-probes/numeric-as-exact-trio.vl` and #9596's missed 33 tests/cases programs;
  the verifier's union grading caught both before merge (queue practice).
- **Q27.** (Retired with `ci-ir-identity`, 2026-11-27: `ir-identity.sh` is deleted) A lane's READY quotes the "fail under both" counts of `ir-identity.sh --cases` (68) and
  `--names` (3267) against master's. A rise means legacy itself broke, as IR-N9's
  `directArgSeedsOf` split did (68 → 71) before its lane caught it (queue practice).
- **Q28.** A train's docs overlay of master's `docs/internals/inventory` (Q22) adds only the rows
  the train lacks. A full checkout of master's inventory reverted a member PR's own row closure
  (D17053 in BW1) (queue practice).
- **Q29.** Keyed self-test ids (Q19) still meet at list ends when several PRs add cases. The queue
  resolves such hunks, those with an empty diff3 base in `compiler/ir_selftest.vl` and
  `tests/vl_ir_shadow_test.ts`, as ours-then-theirs. A refused hunk with a non-empty base goes
  back to the lane (queue practice).
- **Q30.** The subset guard treats `scripts/vl-host/` as code, not docs, because #9615 changed
  `scripts/vl-host/src/main.rs` (queue practice).
- **Q31.** A lane merges `origin/master` only, never a `vl-queue` tip. The queue merges each
  master-based PR into the in-flight train tip with `git merge-tree --merge-base=<master>`. That
  is valid only while master's tree equals the last merged train's tree outside docs (the subset
  guard). A real conflict goes back to the lane. This replaces Q25 (coordinator ruling,
  2026-11-23).
- **Q32.** A train that passes verification merges at once. A question about a PR's value goes to
  its lane in parallel and never blocks a squash (coordinator ruling, 2026-11-23).
- **Q33.** When the shadow's covered count holds flat, read the start-body line before
  questioning a PR: a gain can be in start bodies only, as #9627's +20 starts were (coordinator
  ruling, 2026-11-23).
- **Q34.** The self-compile fuel attribution line is needed only past the +1% gate. A phase-state
  rise from test-only constructors in a negative self-test is accepted with `--write-baseline` and
  named in the PR body (#9650) (coordinator ruling, 2026-11-23).
- **Q35.** (Retired with `ci-ir-identity`, 2026-11-27: no claimless bytes are left) A shadow mismatch row may rise with a filed row when claimed bytes equal claimless
  bytes for the affected programs; the row need not be "unclaimed". The case is the
  `ir-closure-record-family` lane's row D17060 (coordinator ruling, 2026-11-23).
- **Q36.** Before every squash, check whether it would re-add a `changelog.d` entry that
  `CHANGELOG.md` already holds; if so, delete the entry on the branch first, in a docs-only
  commit. #9640 and #9647 each had to drop entries a squash re-added after #9636's fold (queue
  practice).
- **Q37.** A PR that fixes a filed inventory row closes that row's status line in the same PR.
  #9641 fixed D17056 but left its row open, and master's ci-witnesses step was red until #9652
  (queue practice).
- **Q38.** A docs merge conflict on a squash reparent, such as an inventory add/add, takes the
  train's version, which is the closed row. D17055 in #9639 was that case (queue practice).
- **Q39.** A lane runs `git fetch origin master` before it branches or merges master. A shallow
  clone carries a stale `origin/master` ref, which is how #9680's first base was #9306's master
  (coordinator ruling, 2026-11-23).
- **Q40.** A moved-programs list (Q15) comes from a legacy byte A/B over the whole of `tests/cases`
  and `scripts/capability-probes`, never a directory pick. #9685 missed 2 of 26 and #9680 missed 7
  of 95 (a probe, and cases newer than its base); the queue names such omissions in the squash
  message, as for CY1 (coordinator ruling, 2026-11-23).
- **Q41.** A verifier builds each arm's host in a fresh cargo `--target-dir`, or touches the
  sources first, and checks the binary by hash. `git archive` sets old mtimes, so a reused target
  skips the rebuild and serves the previous host (IR-V2 on DB1) (queue practice).
- **Q42.** IR lowering may read shared emitter state, such as `liKinds.length`, at the same
  emission point legacy reads it; the IR build may not. The lane lists that state under its
  refactor note's "Legacy tails the IR calls" heading, marked "state", and the fold carries it
  into [`ir-legacy-tails.md`](ir-legacy-tails.md) (coordinator ruling, 2026-11-23).
- **Q43.** While the queue's own box is gating, a built train goes to any free verifier as
  GATE+VERIFY. IR-V3 and IR-V4 are end-to-end gate-and-verify lanes (coordinator ruling,
  2026-11-23).
- **Q44.** On each MERGED, the queue sends a one-line "#X merged" to the lane that owns the PR and to
  any lane that asked "notify me when #X merges". A blocked lane asks for that instead of waiting
  silently (coordinator ruling, 2026-11-23, after four lanes waited hours on merges already made).
- **Q45.** (Retired at I8: a self-compile miss is now an `emitUnclaimed` refusal, which the native
  fixpoint catches.) The gate carried the `self ir misses` row (#9701; kill-matrix mutant `selfirmiss`, about
  65 CPU-s): it is the only row that catches a new self-compile function landing in a missed shape.
  When it reds on a train, the queue pulls that PR and rebuilds the trains behind it without it
  (coordinator ruling, 2026-11-23; its first catch was on a train).
- **Q46.** When GitHub refuses a verified PR's squash as dirty, the queue pushes one mechanical
  master-merge to the PR branch whose tree equals the verified train's tree outside docs, then
  squashes; no ungated tree merges (queue practice; #9696, #9682).
- **Q47.** A lane's identity readings set `VL_STD=<tree>/std` on both arms. A stale shared std shows up
  as extra "fail under both" rows or a spurious differ (#9699's 72 against 68; #9702's D16943
  differ), which the lane must explain before READY (queue practice).
- **Q48.** Every READY that touches `compiler/` quotes `self-ir-misses` = 0 and
  `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check tests/vl_deep_nesting_test.ts` passing with all
  8 tests run (the shared host linked; an isolated host skips 3). The queue refuses a READY without
  both (coordinator ruling, 2026-11-23, after DX2 and DW1 red on trains).
- **Q49.** The queue broadcasts the lane-claims list to every lane on each change. A lane reads the
  latest broadcast before picking, announces its pick and waits for the queue's ack before writing
  code; a collision is answered "taken by X", and a contested class goes to the coordinator
  (coordinator ruling, 2026-11-23). The coordinator has split a class by mechanism, each lane
  taking a named sub-cut, and has given a contested class to the lane whose own refusal and
  in-flight cells depend on it.
- **Q50.** A train's tree holds every file master holds. A train merge over the PR's master base
  reads a docs-only commit that went straight to master as a train-side deletion and drops it; an
  `inventory refs` red on a later citing PR is the symptom (IR-V3 on EM1, D17073). The queue's
  merge restores any master file the merged train lacks unless the PR deleted it (queue practice).
- **Q51.** A PR stacked on another queued PR merges into the train with the lower PR's head as merge
  base, and the train's delta is checked to equal the PR's own diff. Once the lower PR squashes,
  the upper squash needs a Q46 mechanical merge (#9717, #9720) (queue practice).
- **Q52.** A verifier given VERIFY-only runs no gate when the queue box gated the same train; the
  queue box gates while a verifier proves (queue practice).
- **Q53.** When a lower PR in a train stack needs a fix that touches only docs, each affected train
  is rebuilt as `<train>2` = `<train>1` plus only that fix. The verifier's proof on `<train>1`
  carries over and only the affected test is rerun on `<train>2`. When the fix touches code, the
  verifier also reruns `gate.sh --fast` and the affected test on
  `<train>2` (queue practice).
- **Q54.** A READY whose natural stack position sits above a red train is branched from the last
  green train instead. The squash check compares against master with that train's own base, so the
  two branches merge in either order (queue practice).
- **Q55.** Before a squash, `presq.sh` flags `changelog.d` entries the squash would resurrect
  (already folded on master, still on a stale branch). The queue removes them in the mechanical
  master merge and checks that the code tree equals the train's (queue practice).
- **Q56.** When a train's base lacks master's compiler commits (the PR head and the train base
  predate a master commit touching `compiler/`), the queue's sqcheck typechecks the squash tree
  before merging: `git archive <tree> | tar -x` into a scratch dir, then `vl check
  compiler/entry.vl` there with `VL_STD` set to that dir's `std`; it must print `Found 0 errors`.
  A mechanical tree comparison cannot see a semantic conflict: #9778 added a fifth `coalesce`
  parameter while master's #9771 added 4-argument calls, both merged textually clean, and the
  merged compiler did not typecheck (coordinator ruling, 2026-11-23).
- **Q58.** Every READY that adds or widens an IR claim carries an armed position sweep: the
  claimed value as a call argument (at a scalar and at a union parameter), a nested call argument,
  a concat operand, an interpolation hole, a `return`, a `let`/`const` initializer, an `if` arm, a
  `??` operand and a record field. Each program runs and prints its pinned output (under
  `tests/cases`, `@run` with its `@log` lines, which the corpus oracle grades); the READY names the
  sweep's paths and the verifier re-runs it (amended when `ci-ir-identity` retired, 2026-11-27). A red position is pinned; a red already on master is filed as a clause-1 row and
  fixed express. Trains in flight on 2026-11-24 were held to the earlier bar (coordinator ruling,
  2026-11-24). Grading (queue ruling, coordinator-approved, 2026-11-24, BROADCAST #24): "matched"
  means no covered function mismatches or fails the verifier. A position function uncovered under
  both seeds, in a class the PR does not touch, is not red when the program runs and prints its
  pin, and the note names that class. A position that fails to run, or differs from its pin, is
  always red and is filed clause-1, whoever owns its class.
- **Q59.** A verifier may make a stated one-line control edit (a failing control for a probe) only
  in an isolated `git archive` scratch build, never in the worktree or `build/`; it `cmp`s `build/`
  before and after and deletes the scratch build (queue ruling, 2026-11-24).
- **Q60.** Each worktree starts with master's `scripts/agent-setup.sh --host-check`, run before
  the fixpoints, never the candidate tree's copy: a candidate's own copy can pass a host that
  master's guest protocol needs rebuilt (queue ruling, 2026-11-24, BROADCAST #21).
- **Q61.** Guest fuel is a deterministic count: the same seed building the same tree gives the
  same number every time, so a fuel reading has no noise floor. A READY and a verifier quote
  exact counts (queue ruling, 2026-11-24).
- **Q62.** A legacy clause-1 red that a Q58 sweep finds and that is not tied to the finding lane's
  own change goes to the soundness lane S2, which files and fixes it express (coordinator ruling,
  2026-11-24).
- **Q63.** `gate.sh --fast` runs neither `tests/vl_ir_door_guard_test.ts` nor
  `tests/vl_emitter_state_audit_test.ts`, so a lane runs both directly before every READY and
  quotes them. A train went red on both in its full gate after a green fast tier: a new module
  `let` no reset clears, and door guards still pinning a miss the PR removed (queue ruling,
  2026-11-24).
- **Q64.** A claimed build that fails to validate ships legacy's bytes with a note, and one whose claim meets a legacy helper's refusal declines that unit (G3 and its ruling (a), DECISIONS.md, #9845, #9888). Every gate, harness and CI run sets `VL_IR_STRICT=1`, so a fallback is rc 70 there; `vl check --codegen` stays strict and is never covered by the fallback (coordinator rulings, 2026-11-24).
- **Q65.** A short pass after a change to inventory rows, tests or `scripts/inventory/` runs ci-native's inventory tests (`tests/vl_inventory_rows_test.ts`, `tests/vl_inventory_refs_test.ts`), not `gate.sh --fast` alone: a fast-only short pass left master red on a row's wording (queue ruling, 2026-11-24; fixed by #9861). Before squashing a PR that adds a row, the queue checks master for a stale `unfiled: D<id>` marker naming it (#9897, after #9882 landed D17108 under #9878's marker).
- **Q66.** Every program a Q58 sweep or a witness reads is committed in the PR, never only in a scratchpad (queue ruling, 2026-11-24, BROADCAST #25).
- **Q67.** A census or legacy A/B builds each arm in a tree at its own commit with that tree's own fixpoint seed: `scripts/ir-only-census.vl` builds from the working tree's `compiler/`, so a file-swapped base arm measures the wrong compiler. `scripts/ir-only-census-ab.sh` does this (queue ruling, 2026-11-24, BROADCAST #26).
- **Q68.** (Amended when `ci-ir-identity` retired, 2026-11-27: `ir-parity.vl` is deleted; the host rule stands for every other tool.) A verifier grades on a host whose `scripts/vl-host` matches the train's own tree and quotes its sha256; `scripts/ir-parity.vl` runs `$VL`, so check it. A host built before `c0cbdab7` lacks the claims-off fallback, and one built before `6bf25409` (#9888) lacks the soft-refusal note; a train containing either commit is graded on a host built from a tree containing it, a train that lacks it on its own tree's host (queue rulings, 2026-11-24, BROADCASTS #27 and #30).
- **Q69.** (Retired with `ci-ir-identity`, 2026-11-27: no claimless face is left) A reading of a claimless face names the claimless compiler's sha256 and the commit of the tree it was built in, with `git status --short compiler` clean: a claimless compiler built on a fix branch, read as master's, opened a false G3 express (coordinator ruling, 2026-11-24, BROADCAST #29).
- **Q70.** Each active lane files new inventory rows only from its own reserved range (`docs/internals/inventory/reserved/`, 20 ids each, ids 17140 to 17479, #9893) and asks the queue for another when it runs out: ids raced four times in ten minutes before the ranges (coordinator directive, 2026-11-24, BROADCAST #28).
- **Q71.** A row whose filed witness falls back to legacy (a `runs` witness the claims run builds) lands with its line in `scripts/silent-sweep/distilled/claims-fallbacks.txt` (retired at I8 with `ir claims`) in the same PR (queue rule, after #9910's row reddened `ir claims`, fixed by #9913).

Readings recorded at the eighteenth fold, for the next reader of the same class: a legacy plan never shadows a region once it mutates or is reassigned, so #9862's guard protected nothing (V7); #9878's skipped cross-tag delivery check is unconstructible, since the checker refuses `is` narrowing to a contained arm (V6); a wrong heap fill in #9899 is caught by the builder as a miss, not by the verifier, and cannot reach a claim (V3); #9887's relaxed door-guard case reds on its miss clause, since no path produces a differ once the atom is declared (V6); a verifier's coverage gap, a mutant that ships wrong output while every committed program passes, is closed before merge with a committed witness (#9885 and #9891, queue rulings).

### Squash artifacts and Q3 members

- A lane PR that merged an unsquashed batch member or stack parent can meet a criss-cross merge
  base. Build its candidate step with `git merge-tree --write-tree --merge-base=M <cand> <pr>`,
  where M is its merge base with master, or its stack parent's head; use this only when both sides
  contain M tree-wise.
- After a batch squashes, a member stacked on an unsquashed head, or one carrying a Q3 resolution,
  no longer squashes alone. Push a merge commit onto the lane's branch: tree = the gated candidate
  step merged with master's docs-only moves, parents = PR head and master. Check the tree, then
  squash at that sha (precedent #9409 at 722d19a6; train AD's #9411, #9431, #9439).

### CI proof

`GATE_CI_PROOF=<sha>`, with the candidate pushed to `vl-queue/<pr>`, lets gate.sh skip the rows a
push-event CI run already proved on that tree and seed (`scripts/ci-proof.sh rows` names them; any
refusal runs every row). `scripts/ci-proof.sh` reads the run through `gh api` access to Actions,
so it is usable only where `gh` has that access; a coordinator session without it runs every row.

## Vetoes on an IR PR

The queue, or the IR reviewer, refuses an IR PR on any of:

- runs lost (`runs → not-runs` in the distilled corpus or a capability matrix);
- a new trap;
- late demands up (`scripts/late-demands.vl -- --check`);
- an id collision;
- emit re-deriving a checker fact;
- a type-spelling classifier;
- a phase-state rise. Named `TY_*` constants are allowed; for stage-3 moves, distinct checker
  symbols may not rise;
- a fuel rise past the tier without a ledger line (`scripts/self-compile-time.sh`);
- a `--names` build that is not the plain build plus custom sections;
- a parallel predicate mirror, unless legacy consumes it or an agreement check is armed;
- a new dead export;
- a pinned output that changes: a corpus oracle `log mismatch` or `@trap` miss, a distilled
  `runs but wrong value`, a witness `wrong_output`, a probe that stops printing its value;
- a module that fails validation (rc 70);
- a shipping door that bypasses `claimable()` (ir-design §10.2).

## A chosen divergence (Q57)

Retired at I8 (ir-i8-cutover §8): with legacy's emitter deleted there is nothing for a claim to
diverge from, so the divergence baseline, `ir-identity.sh` and `ir-parity.vl` went with it. A
program's behaviour is its pinned output, graded as the vetoes above say.

## Folds

About every 25 merges the coordinator folds `changelog.d/` (`scripts/changelog-fold.vl`,
`changelog.d/README.md`) and the refactor notes into architecture-target's Status and the notes
index, in one docs PR. At each fold it also lists every open IR PR that is in no batch, with
why (Q4).

## Fuel drift

The per-PR fuel tier grades a candidate against its base master's own L2, so master's accumulated
drift never reds a batch (coordinator ruling, 2026-11-21, after batches R and U each lost 15 to 25
minutes to drift reds and three refresh PRs landed in 13 hours). The base's L2 is measured once per
base tree and cached; `SELF_COMPILE_BASE_FUEL` passes a reading the verifier already took. The
cumulative rise on `scripts/self-compile-baseline.json` is still printed by every run, and past +3%
it is reported, not graded: it marks a drift refresh as due.

A per-PR L2 rise past +0.1% is accepted as source growth when the PR shows the same-tree pair
(its head seed compiling the base tree at the base seed's fuel, within ±0.01%) and attributes the
rest to source by phase (`self-compile-time.sh --phases`, head on head against base on base). A
rise the pair does not show is generated-code cost and is graded as before (coordinator ruling,
2026-11-22; #9441, D17046).

The coordinator rules on a refresh of `scripts/self-compile-baseline.json` that names no single
mechanism. Its `scripts/self-compile-ledger.txt` line gives the PR range and the cumulative rise
since the last attributed baseline. Under +3% cumulative the refresh is routine. Past +3% it first
attributes the rise by measurement: the top contributing PRs, each with its fuel delta, each
accepted with its reason or sent back to its lane to cut. The line names that attribution. The
current reference is the 103.94G line (#9283), a coordinator ruling at +3.18% on the 100.73G
reference (#9194). A ledger line names the owner only for a ruling the owner made. Existing ledger
lines are not edited.

## Coordinator PRs and goals

- A coordinator PR (a fold, a baseline refresh, a docs change) is committed on a detached worktree
  under `.claude/worktrees/` and pushed with `git push origin HEAD:<branch>`; it never checks out a
  lane's branch.
- A coordinator session goal must be reachable within the session, and is cleared when the work is
  waiting on others.
