# VL — working rules

Repo-wide instructions. Subsystem detail lives in `docs/internals/`; `ROADMAP.md` owns the
forward plan, `CHANGELOG.md` the shipped work, `DECISIONS.md` the non-obvious rationale.

## `std:*` changes get a second pass — required

**Any change that adds or alters an export in `std/*.vl` MUST be reviewed by the
`std-api-reviewer` agent before it merges.** Rubric: `docs/internals/std-api-review.md`.

This is not style policing. std is version-locked to the compiler, there is no package
ecosystem to route around a bad decision, and there is **no deprecation story** — a std
name is close to permanent, so the cheapest moment to be critical is before it exists.

The review is critical of ambient/stateful APIs, order-dependent calls, boolean parameters,
silently lossy operations, names that promise more than they deliver, second error channels,
duplicated functionality, and anything speculative. **None of those is forbidden** — several
are in std today because they were right. What the review requires is that a deviation was
*chosen* and is *justified in the module header*, rather than drifting in because nobody
compared.

Not required for: a change that only touches a std function BODY without altering its
signature, name, or documented behaviour.

## Agent concurrency — the cap was calibrated against a run nobody makes any more

**Up to 6 concurrent worktree agents at `JOBS=6` / `DENO_JOBS=4`.** The old cap of 3 came from an
`earlyoom` kill measured when three agents each ran a FULL CENSUS sweep (~20 GiB in 64 s on
`nproc=24`). No agent runs the census now — every brief forbids it and the distilled corpus is
~7 s — so that measurement no longer describes the workload. Measured 2026-08-28 with agents
running: **78% of 47 GiB available, largest process 1.4 GB**. `earlyoom` still SIGTERMs at 10%
available, so check `free` before going wide, and drop back to 3 for anything that does run a
full census block.

## Gates

**`scripts/gate.sh` runs the whole ladder and is the thing to run.** Every gate below is
independent once the seed is built, so it fans them out and reports a per-gate table of wall
time and exit code. **68 seconds** for all nine on a loaded box. A merge gate that takes longer
than a coffee stops being run, so treat that as the budget it has to keep — if a gate is added
that pushes it over a couple of minutes, the gate is what needs rethinking, not the budget.

The parts, and what each is for:

1. `deno task test`
2. `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts` — the `ci-native` job, **not** part of the above
3. `scripts/native-fixpoint.sh` and `scripts/lint-self.sh`, plus **`deno lint`** if the
   change touches a `.ts` file — CI runs it as its own step, `lint-self.sh` does NOT cover it
   (that one lints the VL module graph and runs `vl fmt --check`), so a `.ts` edit can pass
   every other gate here and still fail CI. Two rules bite in practice: `no-import-prefix`
   and `no-unversioned-import`. Note the convention they enforce — **no test under `tests/`
   imports an assertion library**; they all `throw new Error` with want/got in the message.
4. `scripts/rep-fuzz-check.sh` — **mandatory** for anything touching the rep layer or the
   interner; the corpus, the suites and the fixpoint are all blind to REJECT→MISMATCH
5. `scripts/mono-tyaram-grid.sh` for monomorphizer changes
6. **`scripts/silent-sweep/distilled/regress.py` — the census's content, in ~7 seconds.**
   Two halves. `cells/` is DERIVED: 1,477 programs, one per behavioural equivalence class of
   the 250,238-cell census. `named/` is CURATED: the exact cells some real regression NAMED,
   kept whole. It exits non-zero **only** on `runs → not-runs`; `→ silent` and every other
   movement is printed and read, not blocked on. A program that did not work before and does
   not work now has not regressed in the sense a gate should stop the world for.

   **Why a subset is sound here when the census README says it isn't.** That README proves a
   *random sample* cannot see a 12-cell family — catching D211 at 95% needs 22% of block A —
   and then concludes there is no cheap sufficient subset. **That step does not follow, and
   believing it cost this repo a 35-minute merge gate.** A random sample is blind because it
   does not know which cells are alike; an equivalence-class collapse is built out of exactly
   that knowledge. D211's 12 cells are not 12 chances to get lucky, they are ONE class, and a
   representative of it is in the corpus by construction.

   Measured, not asserted: over 19 graded compilers, block A's 150,224 programs produce only
   **212 distinct answers** and **4.09 bits** of entropy each — the entire block is ~75 KiB of
   signal. It collapses to 343 classes, and the census as a whole to **1,477 (99.41%
   redundant, 169×)**. Validation is in `scripts/silent-sweep/distilled/README.md`: **2,699 of
   2,699** transition events across every snapshot pair are covered, including 938 loud→silent
   and 856 runs→not-runs, and leave-one-out over 17 held-out compilers missed **0 of 1,468**
   transition kinds.

**The full census is a DISCOVERY instrument, not a gate.** Run
`scripts/silent-sweep/census/` when you want a new population measured — a new axis, a new
outcome, a suspicion that a family exists that nothing has named yet. It is ~35 min at
`JOBS=4` with the box to itself, so run it deliberately and alone: three agents running it
concurrently is six full passes on 24 cores, which is what turned a one-hour change into a
three-hour one (measured: load 114, a single `vl run` costing 0.037s). **After any full sweep,
re-distil** — `scripts/silent-sweep/distilled/redistil.py`, then `regress.py --write-baseline`.
The corpus is only as good as the history it was collapsed from; re-distilling is what keeps
the one real risk (a compiler that splits a class no earlier compiler split) falling rather
than growing.

**Generated corpus files are ONE LINE PER CELL.** `baseline.jsonl`, `expected.jsonl` and a
named set's coordinate JSON under `census/` are rewritten by nearly every defect PR, so their
format is a review and merge concern. Pretty-printed, a 207-cell change was an 860-line diff and
a rebase merged cell boundaries wrongly **without saying so** — twice in one day, once silently
corrupting the baseline. Read and write them through `distilled/cellmap.py`, never `json.load`.
Do not add a field nothing reads: `coords` was stored three times and read from none of them.

**REFUSE A CANDIDATE ON `runs → not-runs`, NOT ON `loud → silent`.** The gate's criterion and
the shipping criterion are the same one, and they were allowed to drift apart. `regress.py`
blocks only on a WORKING program breaking; a program that did not work before and does not work
now has not regressed. D11's candidate was refused on 2026-08-28 for moving 48 cells
loud→silent — while buying **72 cells loud→RUNS and losing ZERO runs**. That is a large net win
declined on a bar the gate does not apply. Loud→silent is worth MEASURING and NAMING every time
— it is why `named/` exists — but it is a price to record, not a veto. Veto on: a `runs` cell
lost, a new compiler trap, or a corpus module that stops building.

**WHEN A GRID OR A REFUSED CANDIDATE NAMES A SET, THE SET GOES IN `named/`** — not a collapse
of it, and not the whole grid. A derived rule provably cannot find these, and there are two
worked instances from a single day: D272's 72 `runs`-lost cells and D224's 207-cell price were
each covered **0 times** by every derived rule tried (behavioural collapse of their own grid, an
axis floor over its axes, an axis floor over the census's twelve). The reason is the same both
times — on today's compiler those cells behave exactly like their class-mates, and what makes
them worth keeping is what a *candidate* did to them, which nothing reading current behaviour
can see. **Every refused candidate that named its price is a named set**, and the price is the
thing worth keeping: it stops the next person paying it again without noticing. Commit the
coordinate JSON under `scripts/silent-sweep/census/`, materialise with `d243/mkset.py`, and add
the cells to `distilled/named/` so the standing gate carries them.

Two habits the full runs earned, still worth keeping: report `runs → not-runs` and `→ silent`
explicitly rather than histogram deltas — block A once lost 0 `runs` and still moved 12 cells
loud→silent while its loud-emit column moved −126, so the regression was arithmetically
invisible. And a named set re-grades against any new seed in ~10 invocations, so use one rather
than rebuilding its grid.

## "Zero silent rows" is a claim about the INVENTORY, not about VL

The filed inventories hold ~199 hand-written rows. The distilled corpus holds **7,021 cells**.
On 2026-08-30 the inventory graded `0 silent` and the corpus graded **92 check-clean invalid
wasm** — live, confirmed cell by cell against the seed, and three of the four families had no
filed row at all. Both numbers were correct; one of them was reported as though it described
the compiler.

**Name the population in the sentence.** "0 of 199 filed rows" and "3,704 of 7,021 corpus cells
run" are different facts, and only the second is about VL. The inventory is a notebook of what
someone looked at; it is not a measurement of the language.

## The goal is `runs`, and making a failure LOUD does not move it

Standing bar: **every program the language design permits compiles and runs correctly.** Two
clauses — (1) **soundness**: if `vl check` accepts it, it builds and runs correctly; (2) **no
capability refusals**: the compiler rejects only what the DESIGN forbids. *"Not yet supported by
codegen" is never a valid answer.*

Clause 2 is what keeps clause 1 honest. Without it "legal" drifts to mean "whatever the compiler
accepts" and the goal is vacuous — any refusal can be relabelled a design rule after the fact.
That is not hypothetical: **25 inventory rows closed in five days, every one by converting
`check-clean invalid wasm` into a loud refusal.** Under "fix all miscompiles" each of those
closes is correct and defensible. Under this goal **they are all still open.**

**Count progress in programs that RUN.** `regress.py` already prints it: `runs` was
**3,704 / 7,021 (52.8%)** on 2026-08-30. Silent→loud is hygiene, belongs in the record, and is
not a point on this scoreboard. The gate's floor (block on `runs → not-runs`) is unchanged; this
is the number that is supposed to climb.

**`scripts/goal-scoreboard.py` is the measurement — do not hand-count this.** It reads the
corpus baseline and prints `runs` plus both clauses' violations, instantly, without compiling.
On 2026-08-30: **runs 3,704 / 7,021 (52.76%)**, clause 1 **92**, clause 2 **314** emit rejects
and **45** check rejects that concede type-validity — **451 cells against the goal**. It also
counts the refusal sites in `compiler/*.vl` whose own message concedes the program is
type-valid (`has no lowering`, `not yet supported by codegen`, one reading `this program is
type-valid but cannot build`) — **23**, most of them in `typecheck.vl`. That is the direction
that hides: a capability gap moved into the checker stops looking like a gap, and the program
compiles no better than before, so the script counts it the same as an emit-side one.

**AND `runs` CAN REACH 100% WITH THE GOAL UNMET — the script says by how much.** The corpus is
generated over fixed axes, so it scores only the gaps it has a program for. **13 of the 23
sites are reached by NO corpus cell**, `+` over an f64 list among them: `f64[] + f64[]` refuses
today and costs the scoreboard nothing. Each ZERO row in `--sites` needs a hand-written probe,
and none will arrive on its own. Do not read a rising `runs` as the whole answer.

A first hand-count of these sites said 40 by grepping lines rather than message sites. The
script exists so this is not re-derived by hand, and it has now been re-derived by hand twice
with two different wrong answers.

**Every `loud emit reject` is a clause-2 violation by construction**, since `check` returned 0
to reach the emitter: either the program is legal and should compile, or it is illegal and the
CHECKER owed the diagnosis.

**Read a gate by its exit code or its summary line, never by `tail -1`.** `lint-self.sh`
interleaves two halves; only `self-lint + fmt-check clean` means both passed. Never put a
gate and a commit in the same command — a non-zero exit scrolls past unread.

`vl fmt -w` takes **one path per run**; a multi-path call fails and formats nothing.

## Disassembly — `wasm-dis` is here, it is just not on `PATH`

**`./node_modules/.bin/wasm-dis`** (binaryen 130, pinned in `package.json`). Every agent worktree
symlinks `node_modules` to the repo's, so it works there too. `which wasm-dis` finds NOTHING and
that is not evidence of absence — two agents degraded the disassembly instrument to byte-identity
on 2026-08-28 after exactly that check. `wasm-opt`, `wasm-as`, `wasm-merge` and `wasm2js` are in
the same directory. Disassembly is one of the four instruments a defect fix is graded on; do not
substitute for it without first running the real binary by its real path.

## After editing `compiler/*.vl`

Run `scripts/refresh-compiler.sh` before testing. The compiler is itself a VL program at
`build/vl-compiler.wasm`, and a stale seed silently tests the previous compiler.

## Claims about the tree

`ROADMAP.md` and the design docs go stale one-directionally — a fixed defect keeps reading
as live, because the inventory is not the file the fixer edits. **Re-run a doc's own witness
before scheduling, briefing, or quoting from it.** Every row in those files carries a
minimal program; running it costs seconds.

For any doc whose rows are `### <ID> — <title>` + a `**<status>**` line + a `Repro:` block,
that is one command:

```sh
python3 scripts/check-filed-witnesses.py --strict docs/internals/silent-class-inventory.md
```

It runs each row's OWN filed program — never a paraphrase, which is a different program —
and prints which rows no longer behave as filed; non-zero exit means at least one moved.
It found **eight of sixteen** rows already fixed on first use. Grade the doc against it
rather than against memory, and **run the repro verbatim**: a hand-retyped witness that
differs in one type tells you nothing about the row.

**Pass `--strict`, and read all FOUR columns.** Without it a row the checker cannot grade at
all — no `Repro:` block, or a status line naming no outcome in its vocabulary — is reported
in the fourth column and the script still **exits 0**. So `94 graded · 94 as filed · 0 MOVED
· 2 not graded` and `… · 0 not graded` are the same exit code, and a summary quoting the
first three numbers reads identically either way. `--strict` makes an ungradeable row a
failure and names the fix.

**A row whose defect is only reachable under a change that was REFUSED is still gradeable** —
file it as a REFUTATION PIN: the witness is the program that must keep RUNNING, with the
status `runs today and must keep running`, so it flips the day someone lands the refused
change. D171/D172/D173 are that shape.

`tests/vl_inventory_rows_test.ts` enforces the structural half of this on every PR (a
known-outcome status line and a real repro BLOCK, not just a `Repro:` label) in ~15ms,
without running any program.
