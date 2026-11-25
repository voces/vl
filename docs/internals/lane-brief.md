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

Run each once, on the head you will send:

1. `scripts/gate.sh --fast`, read by its exit code.
2. If `compiler/` changed: `scripts/ir-identity.sh --cases build/vl-compiler.wasm` and
   `scripts/ir-identity.sh --claimless build/vl-compiler.wasm`. Quote both summary lines; a
   differ not listed in the divergence baseline is a veto. (This step drops when CI runs it.)
3. If you add or widen a claim: the Q58 armed position sweep, committed under `tests/cases/`.
4. For a coverage PR: your class's distinct-function count on `tests/cases` and the witnesses,
   before and after, from `scripts/ir-i8-census/census.sh` restricted to that class's programs
   (O1). The CENSUS lane publishes the program lists.
5. A PR that touches `std/*.vl` exports: the `std-api-reviewer` agent's verdict.
6. Add `changelog.d/<branch>.md` and, for a measurement, one refactor note. Never edit
   `CHANGELOG.md` or architecture-target's Status.

## Landing

- Open the PR ready for review and call `subscribe_pr_activity` on it.
- When CI is green, send the coordinator
  `READY #<pr> <40-char sha>` plus the proof lines above, using
  `send_message` to the coordinator's session id from your brief.
- The coordinator merges. If master moved and GitHub reports a conflict, merge `origin/master` in
  (merge, not rebase), re-run `gate.sh --fast`, push, and send a new READY that says whether the
  resolution was mechanical.
- After a merge, start your next item. When your brief is done, send `DONE` with what landed, what
  is open, and the census delta.
