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
2. `SELFHOST_NATIVE_ALIGN=1 deno test -A --no-check --parallel tests/selfhost_native_*_test.ts tests/vl_*_test.ts` — the `ci-native` job, **not** part of the above. The ci-native
   job ALSO runs an explicit list of seed-backed lsp/playground suites that match neither
   glob (ci.yml's "Editor features on the wasm compiler" step); gate.sh runs those as its
   own gate, extracting the list FROM ci.yml at run time so the two files cannot drift
   (`tests/ci_seed_coverage_test.ts` guards the anchor). Nine green local gates on a branch
   that broke exactly those files is how #2105 merged red — hence the tenth gate.
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

## A NORMALISED MESSAGE IS NOT A TYPE, AND A MESSAGE IS NOT A SCOPE

Two ways a refusal's own words misled a brief on 2026-08-31, both costing an agent-task:

* **`goal-scoreboard.py` collapsed `i64` to `iN`.** Its `norm()` ran `re.sub(r"\d+", "N")` so
  cells differing only in a type name would group — and primitive WIDTHS went with them. The
  conceded bucket printed `== over iN[] has no lowering`; I read it as `i32[]`, checked
  `i32[] == i32[]` by hand, found it RUNS, and briefed an agent that the bucket was a
  capability lost at the pin. **None of those cells was `i32[]`** — the raw list was
  `i64[]`, `f64[]`, `string[][]`, `Circle[]` and friends, every one of which refused at its
  DIRECT spelling too. (D751/D752 have since BUILT those compare cores, so `Circle[] ==
  Circle[]` now prints `true` at both spellings. The lesson is the normalisation, not the
  list — and this paragraph going stale inside one campaign is the second-order version of
  the same mistake: a citation is a measurement with a date on it.) The agent built a 100-pair direct/pin grid to prove there was no disagreement
  anywhere. Fixed: a primitive width keeps its digits, every other number still collapses.

* **A refusal's sentence describes the arm that fired, not the feature.** Three in one day were
  broader than the defect: `nested arrays are not supported` refused only an INFERRED nested
  array with a ref leaf (annotated `i32[][]` always ran); `only i32 / boolean / string / array
  struct fields are supported` was false at f64, i64, map and nested-struct; and `a
  nullable-Circle list element has no rep` is false at every spelling — `(Circle | null)[]`
  declared, read, and holding a null all work, and the refusal belongs to a two-destination
  context that the sentence never mentions.

**Before believing a refusal's scope, run the plainest program the sentence forbids.** It costs
seconds and it has been wrong three times out of three. Narrowing the message is then part of
the fix, not a substitute for one.

## COUNT A POPULATION BY WHERE ITS CELLS CAME FROM, NOT BY THEIR MESSAGE

`113 cells against the goal` was twelve distinct messages and looked like a long tail. Grouped
by originating grid it was **80 of 113 in ONE refused language decision** (array covariance and
aliasing — the `d411` and `d741`/`d742` grids), with only 33 independently actionable. The
51-cell "two declared destinations", the 18-cell "nullable-Circle list element has no rep" and
all 11 remaining clause-1 cells are the same question wearing three sentences.

One line gets you this, and it is worth running before scheduling anything:

```python
collections.Counter(k.split("_")[0] for k in cells)   # cell ids carry their grid
```

## A VALIDATOR SENTENCE IS NOT A MECHANISM — do not group silent cells by their message

The engine prints `type mismatch: expected (ref $type), found (ref $type)` for every heap-type
disagreement in the module, with both type names elided. Cells carrying it have nothing else in
common. Grouping by it was wrong twice on 2026-08-30, in opposite directions:

* **Overstated 19x.** D611 was filed as "58 of the 92 silent cells, the largest single family"
  — that was the `expected (ref null $type)` message group. Exactly **3** carried D611's
  mechanism. The row's own headline was a message count wearing a mechanism's clothes.
* **Nearly merged two defects.** D613 and D623 both print `expected (ref $type), found (ref
  $type)`. D613 is a captured empty list literal (the closure is load-bearing); D623 is an
  un-annotated `Map()` carrier (the closure is SCENERY, and annotating either end fixes it).
  One fix moves neither of the other's cells.

**Let the ABLATION define the family, never the message.** Delta-debug the cell to a minimal
witness by line removal — keep a line removed only while outcome *and* message hold — then
remove one ingredient at a time and record which ones the defect needs. That table is the
family. It costs seconds per cell: the minimiser is a thirty-line greedy loop, and the three
2026-08-30 families each fell out of one in under a minute.

Corollary for a row's headline: **cite the number you ABLATED, not the number that shares a
sentence.** If the mechanism count is not yet known, say the message count is a message count.

## A FIXTURE THAT ANNOTATES EVERY DESTINATION CANNOT SEE THE MISSING-ANNOTATION DEFECT

**Write the un-annotated spelling of a fix's own witness before believing the fix.** D962 closed
`??` over a nullable value-union box by desugaring it, and pinned three cells — all of them
routed through an annotated `function pick(): string | i32`. The annotation is what makes the
desugared `if` land somewhere that already knows the value is a box. Remove it and the same
three cells are **check-clean invalid wasm**: the fix traded a clause-2 loud refusal for a
clause-1 miscompile, and the fixture could not show it (D969).

This is the general shape, not one slip. An annotation pins a cell's rep, so any defect whose
ingredient is *inference doing the pinning instead* is invisible to a fixture that annotates.
The same applies to `@hint redundant type annotation` — a hint saying the annotation is
redundant is the checker agreeing about the TYPE, and says nothing about whether the two
spellings agree about the REP.

## A CAPABILITY GAP HAS A POSITION MATRIX — narrowing the checker first ships clause-1 bugs

A refusal that names a capability (`no element-converting copy exists`) is usually enforced in
ONE place — the checker — and served, once built, in MANY: every syntactic position where the
value can be delivered. Lifting the refusal is therefore not the last step, it is the step that
converts a loud refusal into **silent invalid wasm at every position you did not wire**.

D965 is the worked instance. With the converting loop built and the ARGUMENT boundary wired,
the narrowed gate admitted six more positions — binding, return, assignment, struct-field,
nested-element, global-init — and every one produced check-clean invalid wasm. The order that
caught it is: **build the lowering, wire every delivery, THEN narrow the gate.**

**Enumerate the positions by finding the SIBLING's callers, then verify by running them.**
`emitRefListWidenSite` had eight callers and reading them looked like the complete list. It was
not: global ASSIGNMENT (`b = e` between two module globals) lowers through `emitAssign`'s
`global.set` arm, which the ref family never hooked either. A nine-row position matrix — one
tiny program per position, each printing a value that proves the conversion actually happened
(`b[0] / 2.0` → `1.5`, not `1`) — found it in one run. Reading the call sites did not.

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
counts the distinct MESSAGE LITERALS in `compiler/*.vl` that concede the program is type-valid
(`has no lowering`, `not yet supported by codegen`, `not supported yet`, `not yet implemented`,
one reading `this program is type-valid but cannot build`) — **24** on 2026-09-01. That is the
direction that hides: a capability gap moved into the checker stops looking like a gap, the
program compiles no better than before, and the script counts it the same as an emit-side one.

**AND THE NUMBER IS A LOWER BOUND, NOT THE POPULATION (D964).** The filter finds refusals whose
WORDING admits a capability gap, and a refusal is not obliged to admit one:
`emitProgram: narrowed union atom has no value box` reads like an internal invariant, fires on
a `vl check`-clean program, and is a clause-2 violation the count never saw. Measured: **405**
distinct `emitFail` literals in `compiler/*.vl`, of which **13** match the filter — the rest are
mostly unreachable defensive floors, and a floor no check-clean program can reach is NOT a
violation. So the true site count sits in `[23, 405]` and **only a WITNESS settles which**.
`scripts/capability-probes/run.py` is therefore the instrument and `--sites` is the headline:
when they disagree the probe is right, and **`--sites` reaching zero is not clause 2 being met**.

**AND THE PHRASE LIST ITSELF NEEDS AUDITING — it was reporting HALF.** Until D958 the predicate
matched four phrasings and found 12 literals; the compiler carried **12 more** that concede the
same thing in the other WORD ORDER (`not supported YET` rather than `not YET supported`), plus
`not yet implemented` and `not yet callable`. Two of the newly-counted were verified by witness
as `vl check` rc 0 followed by an emit refusal. This is the literal-counting discipline one
level up: the COUNT was fixed three times, and the predicate deciding *which* literals to count
was never checked against the source it reads. **When this number matters, re-derive the phrase
list from the tree** — `grep -hoE '"[^"]{12,}"' compiler/*.vl` filtered against the current
regex shows what it is missing. Do NOT widen it to bare `unsupported` or `are not supported`:
those appear in internal invariant failures and in genuine DESIGN rules, and a phrase earns a
place only if it admits the refused program was legal.

**AND `runs` CAN REACH 100% WITH THE GOAL UNMET — the script says by how much.** The corpus is
generated over fixed axes, so it scores only the gaps it has a program for. **All 24
literals are reached by NO corpus cell** — the element-widening container copy among them,
which refuses by hand and costs the scoreboard nothing. Each ZERO row in `--sites` needs a
hand-written probe, and none will arrive on its own. Do not read a rising `runs` as the whole
answer.

**AND A LITERAL'S ZERO ROW DOES NOT CLEAR WHEN YOU CLOSE PART OF ITS DOMAIN.** `--sites` counts
REFUSAL SITES, not gaps closed. D937 built the five sites an inferred nullable-MAP return needs
and the literal count did not move by one — correctly, because the same literal still refuses
every non-`i32`-valued map, and *should*. Read that as the site narrowing, not as the fix
failing. **`scripts/capability-probes/run.py` is the finer instrument** and it did move (1/6 →
2/6): one probe per gap, graded `RUNS` / `check refuses` / `emit refuses` / `SILENT`. Add a
probe when you find a gap, and grade a capability change on the probe runner AND `--sites`,
never on `--sites` alone.

**COUNT MESSAGE LITERALS, NEVER GREP-MATCHING LINES.** This number was hand-derived three times
and was wrong all three: 40 (grepped lines, comments included), 26 (lines carrying a quote),
then 23 with a 13-invisible split from fingerprinting each source line against the corpus. That
last one reported `+` over an f64 list as a blind spot when the corpus holds **two** cells for
it — an interpolated message is built from several literals, and the fingerprint slice had
picked up `+ tyToStr(eqBad) +`, which naturally appears in no program's output. A line is not a
message. The literal carrying the concession phrase is what reaches a user, is stable under how
the call is wrapped, and is what the script now counts.

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

## AN INSTRUMENTED COMPILER POISONS THE SEED, and it looks exactly like a real regression

Adding a probe byte to the emitter (`wU8(0)` at the top of a function, to count whether it
runs) works — and then `refresh-compiler.sh` compiles the NEXT compiler **with that build as the
seed**, so every module it emits, the compiler included, carries the stray bytes. The symptom is
not a broken probe: it is three unrelated CLOSED inventory rows suddenly grading `runs →
trap_loads`, which reads as a merged regression and is worth a bisect before you remember why.

**Two tells, both cheap.** The artifact is the same SIZE as a pristine build (the probe adds a
byte per call site, not per function), so compare with `cmp`, not `ls -l`. And a `git archive
origin/master` build in `/tmp` grades the row clean while your worktree does not — same commit,
different bytes. **Recover by copying a pristine `build/vl-compiler.wasm` over yours and
re-running `refresh-compiler.sh`**; reverting the source alone is not enough, because the seed
is what carries the damage forward.

Corollary for the probe itself: **a byte marker measures the writer's current target buffer, not
reachability.** A `wU8` at the top of `emitReturnValue` lands in the function body and counts
correctly; the same marker at the top of `emitReturnExit` reads zero even for a control that
provably calls it. Where the marker reads zero for a case you know fires, the instrument is
wrong, not the code — use a counter global or a distinctive `emitFail`.

## `vl` resolves `std:` from the EXE's checkout — a worktree probe measures the WRONG std

The host walks ancestors of the BINARY, and every agent worktree symlinks
`scripts/vl-host/target` to the main repo's — so a hand probe from a worktree reads
`/home/verit/vl/std`, not the worktree's `std/`. Measured twice on 2026-09-01: a byte-ladder
probe printed the pre-change rung, and a template-hole probe hid a just-landed `toStr`
widening. The Deno gates are NOT affected (their reader maps `std:` relative to the test
file), which is what makes it dangerous: the gates stay honest while the hand probes lie.
`VL_STD=<worktree>/std` pins it; pass it on every native CLI probe that touches std from a
worktree, and on BOTH arms of any A/B.

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
