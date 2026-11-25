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

- Do not fix a defect in legacy's emitter (`wasmEmit.vl`, `emit_*.vl` outside the plans and tails
  the IR shares) unless your claim needs that fix. Claim the shape in the IR. Where legacy is wrong,
  list the divergence (`scripts/ir-divergence-baseline.txt`) and prove it with the program's
  expected output.
- Do not file a row for a legacy-emitter defect. Give it one line in your refactor note.
- Do not re-run proof that CI runs on your PR. `scripts/ci-proof.sh rows` lists the gate rows CI
  covers.

## Before READY

On the head you will send, run once:

```
scripts/ready-check.sh [--sweep <program>...]
```

It refuses a dirty tree and runs `scripts/gate.sh --fast`, read by its exit code. With `--sweep`,
it also checks the Q58 armed position sweep. It checks that `changelog.d/<branch>.md` exists, and
it ends with a block to paste into the READY. CI's `ci-ir-identity` runs `ir-identity.sh --cases`
and `--claimless` on the PR, so a lane no longer runs them; a differ the divergence baseline does
not list reds that job. ready-check does not cover these:

1. If you add or widen a claim: commit the Q58 armed position sweep under `tests/cases/` and pass
   its programs to `--sweep`.
2. For a coverage PR: your class's distinct-function count on `tests/cases` and the witnesses,
   before and after, from `scripts/ir-i8-census/census.sh` restricted to that class's programs
   (O1). The CENSUS lane publishes the program lists.
3. A PR that touches `std/*.vl` exports: the `std-api-reviewer` agent's verdict (ready-check names
   the need).
4. For a measurement, one refactor note. Never edit `CHANGELOG.md` or architecture-target's Status.
5. Grade the inventory rows you file or close with `VL_IR_STRICT=1`, as CI does:
   `VL_IR_STRICT=1 vl run scripts/check-filed-witnesses.vl -- --strict <dirs>` (coordinator, 2026-11-25).

## Landing

- Open the PR ready for review and call `subscribe_pr_activity` on it.
- When CI is green, send the coordinator
  ready-check's block (`READY #<pr> <40-char sha>` and its proof lines), using
  `send_message` to the coordinator's session id from your brief.
- The coordinator merges. If master moved and GitHub reports a conflict, merge `origin/master` in
  (merge, not rebase), re-run `gate.sh --fast`, push, and send a new READY that says whether the
  resolution was mechanical.
- After a merge, start your next item. When your brief is done, send `DONE` with what landed, what
  is open, and the census delta.
