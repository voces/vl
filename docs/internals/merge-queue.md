# Merge queue — how a PR gets from READY to master

The procedure the coordinator runs as the merge queue, and what a lane must send it. CLAUDE.md
holds the rules ("Gates", "Agent concurrency"); this page holds the steps. Who proves what is
CLAUDE.md's "Each proof runs once" bullet: the lane proves its change once, the queue proves the
merged tree, and the reviewer reruns only a reading it disputes.

## READY

A lane that wants its PR merged sends one line:

```
READY #<pr> <full 40-char head sha>
```

The sha is the head the lane proved. A READY with no PR number, or a short sha, is sent back. After
a master merge the lane sends a new READY with the new sha, and says whether the resolution was
mechanical (lists, imports) and so proved by `scripts/gate.sh --fast` plus
`scripts/ir-identity.sh --cases <seed>` alone.

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
   `GATE_IN_WORKTREE=1` is set), then `scripts/ir-identity.sh --cases <seed>` on the seed the gate
   built. Read both by exit code.
   When the batch changes `compiler/`, also run `scripts/ir-identity.sh --claimless <seed>` on that
   seed, once per batch. It compares the distilled cells and the inventory witnesses filed `runs`
   under the shipped compiler and a `CLAIMED`-empty one. Any differ is a veto: a claim shipped bytes
   legacy would not have written (ir-design §5.2, the claim rule).
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
- **R2.** A mechanical resolution (lists, imports) is proved by `scripts/gate.sh --fast` plus
  `ir-identity.sh --cases` alone.
- **R3.** `--claimless` runs once per functional change, not per master merge.
- **R4.** A stack is proved once, at its top.
- **R5.** One owner per blocker class; the coordinator assigns it.
- **R6.** An OK'd PR waiting only on a waived re-proof counts as READY.
- **R7.** A PR touching `compiler/ir*.vl`, or moving an IR miss name or coverage, runs
  `deno test -A --no-check tests/vl_ir_shadow_test.ts` on its head before READY and quotes the
  summary line (coordinator ruling, 2026-11-21: batch AB was red on two stale miss expectations,
  and `gate.sh --fast` does not run that file). Since #9456, `gate.sh --fast` runs it.
- **R8.** A READY lists each new IR admission or route predicate and the legacy function whose
  answer it calls (coordinator ruling, 2026-11-22, after three parallel-mirror vetoes).

For the queue:

- **Q1.** A candidate is batched when its merge-tree builds cleanly (step 2).
- **Q2.** A train departs at 6 to 8 READY PRs, or when the gate has been idle 15 minutes with at
  least one READY. The next candidate is assembled while the current one is in verify. When the
  queue is empty a train departs at one or two READY PRs, and a candidate not yet gating takes
  each new READY that merges onto it (coordinator ruling, 2026-11-22: a batch costs about 35
  minutes whatever its size). A force-push to an existing `vl-queue/*` branch is refused, so a
  replaced candidate takes a new branch name.
- **Q3.** The queue resolves a purely additive conflict itself: a union of list members in sorted
  or declared order, or the whole single-line items of step 2. A hunk where one side edits a line
  and the other only adds lines beside it, so that no line is edited by both, is resolved the same
  way (coordinator ruling, 2026-11-21). Anything else goes back to the lane.

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
- any differ under `ir-identity.sh --claimless` or `--cases`;
- a shipping door that bypasses `claimable()` (ir-design §10.2).

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
