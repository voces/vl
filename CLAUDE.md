# VL — working rules

Repo-wide RULES only. The measurements and incidents behind each rule are in
[`docs/internals/working-rules-evidence.md`](docs/internals/working-rules-evidence.md), under the
same headings. Subsystem detail lives in `docs/internals/`; `ROADMAP.md` owns the forward plan,
`CHANGELOG.md` the shipped work, `DECISIONS.md` the non-obvious rationale.

A refactor measurement goes in a new dated file under `docs/internals/refactor-notes/`, never into
`architecture-target-2026-10.md`. **A PR adds only its own refactor note; the orchestrator folds
notes into architecture-target's Status and the notes index.** That way lanes never conflict on a shared line.

## `std:*` changes get a second pass — required

* **Any change that adds or alters an export in `std/*.vl` MUST be reviewed by the
  `std-api-reviewer` agent before it merges.** Rubric: `docs/internals/std-api-review.md`. Not
  required for a change to a std function BODY that alters no signature, name or documented behaviour.
* The review is critical of ambient state, order dependence, boolean parameters, silent loss,
  over-promising names, second error channels, duplication and speculation. None is forbidden; a
  deviation must be *chosen* and *justified in the module header*.
* **A std COMMENT is API surface for a VL consumer.** Header ≤ **10 lines** (what the module is for,
  how to import it, what it deliberately does not do). Every `export` gets **1 to 4 lines** directly
  above it (what it does, its arguments, its return, the edge case a caller must know); a private
  helper 0 or 1. Compiler facts (defect id, PR number, date, mechanism, history) go to
  `docs/internals/std-notes.md`, and **std does not link there**. `std-comment-audience`
  (`compiler/lint.vl`) enforces the mechanical half with **no baseline** — it stays at zero; the rest
  is `std-api-review.md` §4.

Why: [evidence](docs/internals/working-rules-evidence.md#std-review).

## Agent concurrency — no fixed cap; refill on measured load, memory and token spend

* No fixed number of concurrent worktree agents. At each agent completion, start another lane while
  the 5-minute load is under **0.75 × `nproc`**, more than **15 GiB** is available, and there is
  independent work touching no running lane's files. Stop refilling above load **`nproc`** or under
  **10 GiB** available (`earlyoom` SIGTERMs at 10%).
* Builds stay at `JOBS=6` / `DENO_JOBS=4`; the full census runs alone. Start agents **one at a
  time**, re-reading the load first.
* CPU is the binding resource. A builder does not re-run proof the merge queue re-proves on the
  merged tree: the full identity diff, the three-run L2 fuel comparison, the whole `vl_*` shard.

Why: [evidence](docs/internals/working-rules-evidence.md#agent-concurrency).

## Disk — every tree, target and temp dir is removed by whoever made it

* **A worktree is removed when its work is on origin**: finish with `git worktree remove --force
  <dir>`; a coordinator removes a merged agent's worktree the same turn. New worktrees go under
  `.claude/worktrees/`, never a sibling dir.
* Scratch builds live in the scratchpad or `$TMPDIR` under a trap that deletes them. No `.wasm`,
  seed or cargo target is left in `/tmp` or a worktree after the task ends. An isolated
  `cargo --target-dir` is deleted with the task.
* `scripts/disk-hygiene.sh` reports; `--check` runs at session start and flags a total over
  **25 GB**; run `--clean` when it fires, never while a gate or agent is running.

Why: [evidence](docs/internals/working-rules-evidence.md#disk).

## Gates

* What earns a place in the gate: `docs/internals/testing-strategy.md` — a check stays while it
  catches a breakage nothing else catches (kill matrix, `scripts/kill-matrix/`); a redundant one is
  deleted with its intent folded into a survivor.
* **`scripts/gate.sh` runs the whole ladder and is the thing to run.** It refuses inside
  `.claude/worktrees/` (override `GATE_IN_WORKTREE=1`) because the merge queue gates every PR.
  Fan-out caps: `GATE_MAX_PAR`, `GATE_MEM_BUDGET_MB`; WALL >> CPU in its table means starved. Budget
  **~90 s** wall; a gate pushing it past a couple of minutes is what needs rethinking.
* The proof sweep is `scripts/sweep.vl`; CI runs it on the `sweep` label (`scripts/sweep.md`).

The parts:

1. `deno task test`
2. `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts`
   (CI: the `ci-native` shards plus `ci-release-shape`). gate.sh also runs the seed-backed
   lsp/playground suites listed in ci.yml's "Editor features on the wasm compiler" step, extracted
   from ci.yml at run time (`tests/ci_seed_coverage_test.ts` guards the anchor).
3. `scripts/native-fixpoint.sh` and `scripts/lint-self.sh`, plus **`deno lint`** whenever a `.ts`
   file changes (`lint-self.sh` does not cover it; watch `no-import-prefix` and
   `no-unversioned-import`). **No test under `tests/` imports an assertion library**; failures
   `throw new Error` with want/got.
4. `scripts/rep-fuzz-check.sh` — **mandatory** for anything touching the rep layer or the interner.
5. `scripts/mono-tyaram-grid.sh` for monomorphizer changes.
6. **`scripts/silent-sweep/distilled/regress.vl`** — the census's content in ~35 s: `cells/`
   (derived, one per behavioural class) plus `named/` (curated cells a regression named). It exits
   non-zero **only** on `runs → not-runs`; other movements are printed and read.

* **The full census (`scripts/silent-sweep/census/`) is a DISCOVERY instrument, not a gate**: ~35
  min at `JOBS=4`, run deliberately and alone. **After any full sweep, re-distil** —
  `scripts/silent-sweep/distilled/redistil.vl`, then `regress.vl -- <seed> --write-baseline`.
* **Generated corpus files are ONE LINE PER CELL** (`baseline.jsonl`, `expected.jsonl`, named-set
  coordinate JSON under `census/`). Read and write them through `loadCells`/`dumpCells` in
  `scripts/lib/corpus.vl`, never a whole-file JSON parse. Add no field nothing reads.
* **Refuse a candidate on `runs → not-runs`, not on `loud → silent`.** Veto on: a `runs` cell lost,
  a new compiler trap, or a corpus module that stops building. Loud→silent is measured, named and
  recorded as a price.
* **When a grid or a refused candidate names a set, the set goes in `named/`** (not a collapse, not
  the whole grid): commit the coordinate JSON under `scripts/silent-sweep/census/`, materialise with
  `census/mkset.vl`, add the cells to `distilled/named/`.
* Report `runs → not-runs` and `→ silent` explicitly, never histogram deltas. Re-grade a named set
  against a new seed rather than rebuilding its grid.
* **Seed size is gated:** `vl run scripts/seed-size.vl --compiler build/vl-compiler.wasm -- --check`
  against `scripts/seed-size-baseline.json`; reds above **+3%**; `--write-baseline` in the SAME PR
  as the growth; the deciding reading is the `seed` job's `--prove-fixpoint` output. Run it from the
  checkout root (paths resolve against the cwd).
* **Generated-code cost is gated:** `vl run scripts/plumb-shape-cost.vl -- --check` — guest FUEL
  **+5%**, peak RSS **+10%**; `-- --write-baseline` on a quiet box
  (profiling-the-compiler.md §Guards).
* **Late demands are gated:** `vl run scripts/late-demands.vl -- --check` against
  `scripts/late-demands-baseline.txt`. A rise fails; a fall passes and is named, and the PR that
  earned it runs `--write-baseline`, **written from a FIXPOINT seed** (refresh until a second
  `refresh-compiler.sh` is byte-identical). `$VL_LATE_DEMANDS=1` prints the keys for one build.

Why: [evidence](docs/internals/working-rules-evidence.md#gates).

## "Zero silent rows" is a claim about the INVENTORY, not about VL

**Name the population in the sentence.** "0 of 199 filed rows" and "3,704 of 7,021 corpus cells
run" are different facts; only a corpus figure is about VL. Why:
[evidence](docs/internals/working-rules-evidence.md#zero-silent).

## A NORMALISED MESSAGE IS NOT A TYPE, AND A MESSAGE IS NOT A SCOPE

* A normaliser keeps primitive widths' digits (`i64` is not `iN`); read the raw list, not the bucket.
* A refusal's sentence describes the arm that fired, not the feature. **Before believing a
  refusal's scope, run the plainest program the sentence forbids** — one row per member of any
  supported list it names. Narrowing the message is part of the fix, not a substitute for one.

Why: [evidence](docs/internals/working-rules-evidence.md#normalised-message).

## COUNT A POPULATION BY WHERE ITS CELLS CAME FROM, NOT BY THEIR MESSAGE

Group by originating grid before scheduling: `collections.Counter(k.split("_")[0] for k in cells)`
(cell ids carry their grid). Why: [evidence](docs/internals/working-rules-evidence.md#count-by-origin).

## A VALIDATOR SENTENCE IS NOT A MECHANISM — do not group silent cells by their message

**Let the ABLATION define the family, never the message**: delta-debug each cell to a minimal
witness (keep a line removed only while outcome *and* message hold), then remove one ingredient at
a time; that table is the family. **Cite the number you ABLATED**; a message count is labelled a
message count. Why: [evidence](docs/internals/working-rules-evidence.md#validator-sentence).

## A FIXTURE THAT ANNOTATES EVERY DESTINATION CANNOT SEE THE MISSING-ANNOTATION DEFECT

* **Write the un-annotated spelling of a fix's own witness before believing the fix.** A
  `redundant type annotation` hint agrees about the TYPE, not the REP.
* When a capability has a type PARAMETER, one position-matrix template leaves it open — a second
  template (`spread-into-generic-rest.matrix.vl` beside `spread-into-rest-parameter.matrix.vl`).

Why: [evidence](docs/internals/working-rules-evidence.md#fixture-annotates).

## A CAPABILITY GAP HAS A POSITION MATRIX — narrowing the checker first ships clause-1 bugs

* Order: **build the lowering, wire every delivery position, THEN narrow the gate.**
* Enumerate positions from the sibling's callers, then verify by RUNNING one program per position
  that prints a value proving the conversion happened.
* **`vl run scripts/capability-matrix.vl -- <template>` is the instrument — do not hand-write the
  grid.** A `matrix/*.matrix.vl` template grades all positions in both faces; `--before`/`--after`
  two seeds; non-zero on `runs → not-runs` or any `SILENT`; `--keep` leaves a red cell to file.

Why: [evidence](docs/internals/working-rules-evidence.md#capability-gap).

## The goal is `runs`, and making a failure LOUD does not move it

* Standing bar: **every program the language design permits compiles and runs correctly.** (1)
  **soundness**: if `vl check` accepts it, it builds and runs correctly; (2) **no capability
  refusals**: reject only what the DESIGN forbids. *"Not yet supported by codegen" is never a valid
  answer.* **Every `loud emit reject` is a clause-2 violation by construction.**
* A silent→loud close is still open unless the refusal is one the design owed. Grade it by whether a
  NEIGHBOURING spelling runs and whether the refusal names a CONTRACT or a MECHANISM
  (`docs/internals/check-reject-audit-2026-09.md`).
* **Count progress in programs that RUN.** `vl run scripts/goal-scoreboard.vl` is the measurement —
  do not hand-count. It is a lower bound: **`vl run scripts/capability-probes.vl` is the instrument
  and `--sites` the headline; when they disagree the probe is right, and `--sites` reaching zero is
  not clause 2 being met.** Grade a capability change on the probe runner AND `--sites`. Add a probe
  when you find a gap; each ZERO row in `--sites` needs a hand-written probe.
* Count refusal sites with `scripts/emit-refusal-sites.vl`, never a grep. Count MESSAGE LITERALS,
  never grep-matched lines. `scripts/capability-probes/live-sites.json` is the honest live count
  (`capability-probes.vl --live-sites`; `tests/vl_live_sites_test.ts` refuses a row with no probe).
* When the scoreboard's phrase list matters, re-derive it from the tree (`grep -hoE
  '"[^"]{12,}"' compiler/*.vl` against the current regex). Do NOT widen it to bare `unsupported` or
  `are not supported`; a phrase earns a place only if it admits the refused program was legal.
* The corpus holds no emit reject and no clause-1 cell, so `regress.vl` only reports losses; open
  work is `scripts/inventory/ls.vl -- --status open` and the capability probes. A lane briefed off a
  corpus family count re-runs `regress.vl` first. A rising `runs` is not the whole answer.
* **Read a gate by its exit code or its summary line, never by `tail -1`** (`lint-self.sh` passes
  only on `self-lint + fmt-check clean`). **Never put a gate and a commit in the same command.**
* **After every push, confirm a workflow run exists**: a PR with a merge conflict gets no CI run and
  looks silent, not red. Merge the base in (merge, not rebase), resolve, re-run fast gates, push.
* **Quote the instrument's output, not its summary**; check the INPUT has the defect before blaming
  the instrument; a subset check says what it compared. Explain a ratchet's fall with
  `vl check --budget <baseline> --budget-why` (comment, scan, sentinel, interp, ladder, export,
  render-parse; the last two over a `--findings` report).
* `vl fmt -w`, `vl check` and `vl test` take several paths in one run.

Why: [evidence](docs/internals/working-rules-evidence.md#goal-runs).

## Disassembly — `wasm-dis` is here, it is just not on `PATH`

**`./node_modules/.bin/wasm-dis`** (binaryen 130; worktrees symlink `node_modules`), beside
`wasm-opt`, `wasm-as`, `wasm-merge`, `wasm2js`. `which wasm-dis` finding nothing is not evidence of
absence. Disassembly is one of the four instruments a fix is graded on; do not substitute for it. Why: [evidence](docs/internals/working-rules-evidence.md#disassembly).

## AN `emitFail` PROBE IS SILENT ON A PROGRAM THAT COMPILES — validate against a FAILING control

**Never trust a probe until a control you KNOW should trigger it does.** `emitFail` records and keeps
emitting, so its control must be a program that already fails. `tErr` is the checker's channel and
never surfaces during emit; a byte marker measures the writer's current buffer, not reachability.
Why: [evidence](docs/internals/working-rules-evidence.md#emitfail-probe).

## AN INSTRUMENTED COMPILER POISONS THE SEED, and it looks exactly like a real regression

A probe byte in the emitter propagates through `refresh-compiler.sh` into every later seed. Detect it
with `cmp` (not `ls -l`) and against a `git archive origin/master` build. **Recover by copying a
pristine `build/vl-compiler.wasm` over yours and re-running `refresh-compiler.sh`**; reverting the
source alone is not enough. Prefer a counter global or a distinctive `emitFail` to a byte marker.
Why: [evidence](docs/internals/working-rules-evidence.md#instrumented-compiler).

## AGENTS NEVER BUILD INTO THE SHARED CARGO TARGET

* `scripts/vl-host/target` is symlinked into every worktree. An agent editing `scripts/vl-host/src`
  builds with an ISOLATED `--target-dir`, then COPIES the binary over the worktree's own
  `scripts/vl-host/target/release/vl` (so `std/` resolves to the worktree's), probes that path, and
  restores the symlink when done. A binary left in scratch resolves no `std:`.
* The SHARED binary is rebuilt only as a coordinator step after the change MERGES, forcing it
  (`rm target/release/vl && touch src/main.rs`) and verifying BEHAVIORALLY, never by timestamp.

Why: [evidence](docs/internals/working-rules-evidence.md#shared-cargo).

## `vl` resolves `std:` from the EXE's checkout — a worktree probe measures the WRONG std

A hand probe from a worktree reads the main repo's `std/` (the Deno gates are unaffected).
**`VL_STD=<worktree>/std`** on every native CLI probe that touches std from a worktree, on BOTH arms
of any A/B. Why: [evidence](docs/internals/working-rules-evidence.md#vl-std).

## After editing `compiler/*.vl`

* **Run `scripts/refresh-compiler.sh` before testing**; a stale `build/vl-compiler.wasm` silently
  tests the previous compiler.
* **`compiler/*.vl` cannot use string interpolation** (the seed must load with no host imports);
  `compiler-no-interpolation` (`compiler/lint.vl`) refuses it at `vl check` time.
* Lint path scoping is a bare prefix on a checkout-relative path or ""; the caller relativizes it
  (`lintScopeKeyOf`, `lsp/src/vlRoot.ts`) and stages "" when a call carries no path.

Why: [evidence](docs/internals/working-rules-evidence.md#after-editing-compiler).

## A COST REGRESSION SHOWS UP ONE BOOTSTRAP STEP LATE, and it looks like a broken merge

* **Bisect at BOTH LEVELS (L1 seed builds candidate, L2 candidate builds compiler), under a
  timeout.** An L1-only check is vacuous for this class.
* A behaviour bisect, or a sweep's baseline, uses **FIXPOINT seeds on both sides**.
* **`timeout` kills the shell, not the build**: time-box the BUILD (`timeout 300 <build>`) and sweep
  for survivors before relaunching: `ps -eo pid,etimes,args | grep "vl build" | grep -v grep`.
* A hanging self-build is the FINDING (unbounded recursion or non-converging fixpoint).
* Guards: `arena-scan-outside-pass` + `vl check --budget scripts/scan-budget-baseline.json` (count
  may only fall); `tests/vl_scaling_shape_test.ts` (fuel ratios, `$VL_FUEL=1`);
  `scripts/self-compile-time.sh` (1.5× guest-FUEL baseline). Grade cost by fuel, not time.

Why: [evidence](docs/internals/working-rules-evidence.md#cost-regression).

## Comments state the contract; measurements live in the inventory

* **The six rules are `docs/internals/comment-style.md`**: contract and non-obvious why only; ≤ 4
  lines a block and 12 a module header; no history; at most one `D<id>`; no emphasis by
  capitalisation; no cross-block narration. No census counts, probe outputs, tables or dates in a
  comment — cite the row instead. The header is the FIRST block with no code before it (blank lines
  and the leading `import` region may precede it).
* Four codes ride ONE RATCHET: `vl check --budget scripts/comment-budget-baseline.json` fails when
  any file's count rises; `--write-baseline` lowers it in the same PR as the trim;
  `vl check compiler --severity info` names the blocks.
* **A comment-only change must produce a BYTE-IDENTICAL seed** (`refresh-compiler.sh`, then `cmp`),
  with both seeds built from a tree under a project root.

Why: [evidence](docs/internals/working-rules-evidence.md#comments).

## A LADDER OVER A CLOSED KIND SET IS EXHAUSTIVE, OR ITS DEFAULT NAMES WHAT IT EXCLUDES

A bare fall-through (`-1` / `""` / `false` / `0`) satisfies nothing, **and neither does a `match`'s
`_` arm**. Pay a ladder by naming its missing arms (`emitFail`, a sentence, or delegation) or by a
`_`-less exhaustive `match`, never by `_`. Rules `kind-ladder-incomplete`/`kind-ladder-split`;
ratchet `vl check --budget scripts/ladder-budget-baseline.json`; `vl run scripts/ladder-sets.vl`
fails on set drift; `scripts/ladder-census.vl` (`--sets`, `--split`, `--pred`) discovers.
`docs/internals/kind-ladder-lint.md`. Why: [evidence](docs/internals/working-rules-evidence.md#ladder).

## A TABLE READ BOUND-TESTS ITS INDEX, OR TAKES A READER WHOSE MISS CANNOT BE A REAL ROW

* `sentinel-index-unguarded` (`compiler/lint.vl`) is the rule; ratchet `vl check --budget
  scripts/sentinel-budget-baseline.json`; census `vl run scripts/sentinel-census.vl`.
  `docs/internals/sentinel-index-lint.md`.
* **Build the named seed FIRST when a trap banner shows only function indices**: `vl build
  compiler/entry.vl --names -o <seed>`.
* Derive the population from the SHAPE (a laundered sentinel is still a sentinel); the reader census
  triages a hit, it does not find one. A hit count is not a bug count. **Run a trap brief's premise on the current seed before writing the brief.**

Why: [evidence](docs/internals/working-rules-evidence.md#table-read).

## Claims about the tree

* **Re-run a doc's own witness before scheduling, briefing, or quoting from it — verbatim**, never a
  paraphrase:
  `vl run scripts/check-filed-witnesses.vl -- --strict docs/internals/inventory docs/internals/inventory-2`.
  Pass both inventories (they number independently) and **`--strict`**, and read all four columns.
* The inventory is **one file per row** (`docs/internals/inventory/D<id>.md`).
  `vl run scripts/inventory/ls.vl -- --status open` is the queue, `--next` the next free id (skips
  `RESERVED.md`); new rows start from `TEMPLATE.md`. A row needs a known-outcome status line and a
  `Repro:` label with a block under it (`tests/vl_inventory_rows_test.ts`); a parse-stage outcome
  says `parse error`.
* A defect reachable only under a REFUSED change is filed as a refutation pin, status `runs today
  and must keep running`.
* Every cited `D<id>` must have a row (`tests/vl_inventory_refs_test.ts`); an id cited before its row
  exists carries an `unfiled: D<id>` marker, deleted the day the row lands.

Why: [evidence](docs/internals/working-rules-evidence.md#claims).
