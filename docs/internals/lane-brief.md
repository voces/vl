# Lane brief: what a lane session reads and does

This is the whole procedure for a lane. Read `CLAUDE.md` once for the tree's rules. The rulings
behind this page are in [`orchestration-reset-2026-11-25.md`](orchestration-reset-2026-11-25.md).
`merge-queue.md`'s Q-list is history. Where it conflicts with this page, this page wins.

## Setup (a fresh cloud session, from the checkout root)

```
(cd scripts/vl-host && cargo build --release -j 4)     # about 5 min
scripts/refresh-compiler.sh                             # fetches seed-latest, self-compiles
npm ci --silent                                         # wasm-dis, wasm-opt
deno --version || curl -fsSL https://deno.land/install.sh | sh -s -- -y
git fetch origin master
```

Re-run `scripts/refresh-compiler.sh` after every `compiler/*.vl` edit.

## Ownership

- You own the classes, files or PRs your brief names, and nothing else. If you need to touch a
  file another lane owns, send the coordinator a message first, then proceed (R9).
- Hold at most three open PRs. Batch a whole class family per PR (Q16), with one mechanism per
  commit.
- Take inventory ids only from your reserved range (`docs/internals/inventory/reserved/`). Ask the
  coordinator for one if you have none.

## What not to spend on (O3, O4)

- Legacy's expression emitter is deleted (I8). A program the IR does not claim is a holdout
  (`scripts/ir-i8-census/holdouts.tsv`); a lane closes a family of them by one general IR change,
  proposed to the coordinator first (owner ruling, 2026-11-26), and deletes their lines.
- Do not re-run proof that CI runs on your PR. `scripts/ci-proof.sh rows` lists the gate rows CI
  covers. In particular, no local byte A/B, claimless or `--cases` identity run over the corpus:
  `ci-ir-identity` is that proof (coordinator, 2026-11-25). A local A/B is for a reading you
  dispute, run on the programs in question only.

## Standing rulings (do not ask; apply)

These were each ruled more than once on 2026-11-25. Ask the coordinator only when your change
touches another lane's files, changes a shared plan's output across many programs, or fits none
of these.

- **Shared plans are fair game.** The checker, mono, layout families, `letCellKind`, shared tails
  and reservation scans; fix them at the root.
- **A clause-1 find jumps your queue.** A program `vl check` accepts that traps, prints a wrong
  value or builds invalid wasm goes ahead of coverage work. Tell the coordinator in one line.
- **Measure the population before changing a rep or type derivation.** Count it over the census
  and self, report the count, then build. A self hit is reported at once.
- **No special-case closes.** A fold or guard that makes one spelling run while its neighbours keep
  refusing is not a fix. Park the general gap with its spellings in one row.
- **One owner per mechanism.** If your ablation shows your class shares a guard or lowering limit
  with another lane's class, say so; the coordinator gives the whole family to one lane.

## What to work on

Pick from the holdouts your owner column names (`scripts/ir-i8-census/holdouts.tsv`), grouped by
mechanism through ablation, largest family first.

## Before READY

On the head you will send, run once:

```
scripts/ready-check.sh [--sweep <program>...]
```

It refuses a dirty tree and runs `scripts/gate.sh --fast`, read by its exit code. With `--sweep`,
it also checks the Q58 armed position sweep. It checks that `changelog.d/<branch>.md` exists, and
it ends with a block to paste into the READY. CI's `ci-ir-identity` runs `ir-identity.sh --cases`
and `--claimless` on the PR, so a lane no longer runs them. ready-check does not cover these:

1. If you add or widen a claim: commit the Q58 armed position sweep under `tests/cases/` and pass
   its programs to `--sweep`.
2. For a holdout PR: the holdout lines it deletes, each one's program now running.
3. A PR that touches `std/*.vl` exports: the `std-api-reviewer` agent's verdict (ready-check names
   the need).
4. For a measurement, one refactor note. Never edit `CHANGELOG.md` or architecture-target's Status.
5. Grade the inventory rows you file or close with `VL_IR_STRICT=1`, as CI does:
   `VL_IR_STRICT=1 vl run scripts/check-filed-witnesses.vl -- --strict <dirs>` (coordinator, 2026-11-25).

## Landing

- Open the PR ready for review and call `subscribe_pr_activity` on it.
- When CI is green and your proof is done, run `scripts/land-check.sh <pr>`. It checks that every CI
  run on the head is green, that GitHub reports the PR mergeable, and that master plus the PR
  typechecks. On `LAND-OK <sha>`, squash-merge it yourself with the GitHub tool's
  `merge_pull_request`, `expectedHeadSha` set to that sha. Then send the coordinator one line:
  `LANDED #<pr> <merge sha>` with your class delta (coordinator, 2026-11-25). The coordinator
  watches master and reverts a red master push at once; the lane then re-lands.
- Do not self-merge a PR that changes a shared plan's output across many programs, a gate baseline
  or a ratchet: send READY with the proof lines and the coordinator merges.
- A branch cut before land-check existed runs master's copy:
  `git show origin/master:scripts/land-check.sh | bash -s <pr>`. In a worktree with no host binary
  or seed, it takes the main checkout's.
- On `LAND-RETRY`, run it again: the host or seed it copied was rebuilt while it checked.
- On `LAND-NO: conflicts with master`, merge `origin/master` in (merge, not rebase), re-run
  `gate.sh --fast`, push, and run land-check again.
- After a merge, start your next item. When your brief is done, send `DONE` with what landed, what
  is open, and the census delta.
