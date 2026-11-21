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
   `git merge-tree --write-tree origin/master <head>`. A conflict means the PR goes back to the lane;
   the queue does not resolve it.
2. **Batch disjoint PRs.** PRs whose merge-trees touch no common file are merged into one candidate
   and gated once. When a batch is red, bisect it by halves.
3. **Gate the candidate**: `scripts/gate.sh` (in the queue's worktree, the one place
   `GATE_IN_WORKTREE=1` is set), then `scripts/ir-identity.sh --cases <seed>` on the seed the gate
   built. Read both by exit code.
4. **Squash-merge** each PR with `expectedHeadSha` set to the full head sha that was gated, so a
   push after the gate cannot ride on it.

### Tree equality

A head that only merged master can merge on a prior gate if its tree equals the gated tree. A
master move that touches only docs or scripts does not invalidate a gate.

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
- a new dead export.

## Folds

About every 25 merges the coordinator folds `changelog.d/` (`scripts/changelog-fold.vl`,
`changelog.d/README.md`) and the refactor notes into architecture-target's Status and the notes
index, in one docs PR.

## Fuel drift

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
