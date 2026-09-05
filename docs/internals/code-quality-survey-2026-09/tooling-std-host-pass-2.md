# Code-quality survey, second pass — the tooling, std and the host

Every number here was produced by a command named in §19, on a worktree at **`a03a40784`**
(rebased onto `4b0af3a47`, which is docs-only — the two trees are byte-identical outside
`docs/`). Box: 24 cores, 47 GiB; the load at the time is quoted wherever a timing is.
The first pass is [`tooling-std-host.md`](tooling-std-host.md) and is not edited by this
file; rows 1–18 of the [consolidated ranking](README.md) have landed and rows 19–20 are
owner rulings. Nothing here is a fix; each item is sized so it can be scheduled.

Scope: `scripts/gate.sh` and its 23 rows; the ratchet family after #2582/#2587;
`scripts/silent-sweep/distilled/`; `scripts/capability-probes/`; `scripts/inventory/`;
`scripts/perf/`; `tests/support/` and the shape of `tests/*.ts`; `std/*.vl` and the external
consumer's use of it; `scripts/vl-host/src/main.rs` and `scripts/wasmtime-host.rs`;
`lsp/src/*.ts` after #2593/#2606; and whether the docs still name the scripts they name.
Sixteen rows.

**The area got materially better and the instruments got worse at saying so.** #2582 took
`const ROOT` from 59 test files to 3 and gave every native spawn a `VL_STD`; #2587 put five
ratchets on one core; #2579 taught `moduleSurface` about re-exports; #2588/#2595/#2601 made
`lint()` one walk. What this pass found is a different family from the first pass's *"one
fact in four places"*: **an instrument that answers confidently about a population it did not
measure.** `regress.py` reports `0 of 255,504 census cells` for 584 cells it has no index
entry for; `goal-scoreboard.py` prints `total against the goal 0` on a tree where
`capability-probes/run.py` finds six, four of them silent; the gate's TIME column is each
row's contended time and reads up to 3.8× its cost; and five numbers in CLAUDE.md's own Gates
section describe a corpus and a ladder that have both grown. Rows 1–4 are that shape, and
row 5 arrived as an event during the survey: the box's `python3` broke under it, ten gate
rows went red with the same exit code an over-budget ratchet returns, and the summary
table could not say which had happened.

---

## 1 · Ranked

| # | finding | evidence | size | risk | proof |
| --- | --- | --- | --- | --- | --- |
| 1 | `capability-probes/run.py` costs **3.35 s** and is in no gate — and its own header ("today every probe fails, by construction") is false of **142 of 148** (§2) | 6 refusals, **4 SILENT**; `goal-scoreboard.py` prints `total against the goal 0` on the same tree | S | low | a sixth ratchet at 142; `vl_capability_matrix_test.ts`'s sibling |
| 2 | **584 of 7,564 corpus cells have no `expected.jsonl` row**, and `regress.py` silently defaults them to block `A`, `represents = 0` (§3) | the split reads 2,061/5,503 where the tree is 1,477/6,087; a movement in any of the 584 reports `0 of 255504` | S | low | `set(baseline) == set(expected)`; the `--verify-fresh` row — **landed #2623** |
| 3 | the gate's wall clock is **127.0 s** against CLAUDE.md's ~90 s budget, and `distilled corpus` — not `ci-native` — is now the critical path (§4) | five numbers in CLAUDE.md §Gates are stale: 21 gates→**23**, ~7 s→**66.3 s**, 1,477→**2,061**, 250,238→**255,504**, 7,021→**7,564** | S (doc) + a decision | none | the table in §4; `regress.py`'s own summary line — **landed #2621** |
| 4 | the TIME column is each row's **contended** time, not its cost — `filed witnesses` 71.2 s in the fan-out, **18.8 s alone** (3.8×) (§5) | `distilled corpus` 127.0 vs 66.3 (1.9×); consolidated row 1 fixed elapsed-to-report, not this | S | none | the two columns printed side by side — **landed #2621** |
| 5 | **10 of the 23 gate rows run whichever `python3` is first on `PATH`**, with no version pin and no verdict of its own (§6) | a broken interpreter exits **rc=1 in 1.7 ms** — the same exit code a genuinely over-budget ratchet returns, and the table's only tell is a TIME column that legitimately reads 0.0 s elsewhere | S | low | one preflight row; `lint-self.sh`'s four `--exempt-codes` substitutions stop being silently empty — **landed #2621** (`$PYTHON` reaches them; the empty-substitution shape is not fixed) |
| 6 | **46 test files run twice in one `gate.sh`, 2 run three times** (§7) | 22 of ci-native's glob read no env var; all 24 of the lsp (ci list) row do not; #2592 removed the 47th for this reason | S | low — ci.yml must stay untouched | the gate table; each suite's own case count — **landed #2621** |
| 7 | `check-filed-witnesses.py` grades **624 rows in a serial loop**, 145% CPU on 24 cores (§8) | 4th-longest gate row; every other heavy row fans out (`regress.py` reaches 498%) | S | low — the report already collects then prints | `624 graded · 0 MOVED` unchanged, and the order identical |
| 8 | the gate grades **one** inventory; there are **two** (§9) | `inventory-2/` holds 17 gradeable rows no gate re-runs; graded by hand today **17 as filed, 0 MOVED** | one word | none | the `filed witnesses` row, ~5 s longer — **landed #2623** |
| 9 | `run.py` takes the **ambient** std where its sibling `matrix.py` pins it (§10) | `matrix.py:506` builds `VL_STD`; `run.py:135` calls the shared `grade()` with `env=None`; measured from this worktree, `vl` pairs the worktree seed with `/home/verit/vl/std` | 2 lines | none | `run.py --sites` unchanged; the 10 probes naming `std:` |
| 10 | the **third host** is maintained by hand and graded by nothing (§11) | 410 → **479** lines, edited by #2535 and #2578, all 17 live imports registered — and `__print_char__` is still a code point where both live hosts take a UTF-8 byte | S (delete) or M (gate) | low | a `Cargo.toml` + one gate row, or five doc edits |
| 11 | `server.ts` writes one shape **twelve times** (§12) | 12 `wasmChecker?.X === undefined` guards, 19 log-and-swallow catches, 16 `[wasm-…] X failed` messages; `onHover` alone is **359 lines** with 9 of them | M | med — the catches have two fallbacks, not one | the whole `lsp_*` family, the `lsp suites (ci list)` row |
| 12 | the auto-import tie-break knows about re-exports and not about the **receiver** (§13) | #2579's resolver settles 5 of 6 duplicate names correctly; `lastIndexOf` is DECLARED by `std:array` and `std:str`, so the declarer rule picks `std:array` on a string | S | low | `lsp_auto_import_test.ts` plus one case |
| 13 | consolidated row 18 **landed and its value did not** (§14) | `Utf8Error` is offered from `std:args` (`lsp_auto_import_test.ts:314`) and **90 of 90** glean files still take it from `std:utf8`, 0 either way; nothing measures re-export uptake | S (a measurement) | none | a counter in the consumer glean, or an accepted zero |
| 14 | the five ratchet front ends still share a **26-line** argv dispatch (§15) | #2582/#2587 took the four-way intersection 41 → 28, of which 26 are `main()`'s ladder and the table tail; `--grade` on 3 of 5, `--exempt-codes` on 4 of 5 | S | low | every `--check` and `--write-baseline` byte-identical |
| 15 | `vl --version` names **three** trees, and the shared binary is **31 commits** behind (§16) | build commit `c5d9cc9cb` (#2576), a CWD seed, an EXE-tree std; 0 of the 31 touched the host, so nothing is wrong today | S | low | `vl_std_cmd_test.ts`; it is consolidated row 19's third leg |
| 16 | **152** live-doc mentions name a path that does not exist, 9 of them a `scripts/` instrument; `scripts/perf/`'s 27 tools have **no index** (§17) | `profiling-the-compiler.md` — the doc CLAUDE.md points at — names **0 of 27**; the emitter survey names `scripts/dead-export-budget.py`, which is `export-budget.py` | S (the 9) / M (a gate) | none | the same question `vl_inventory_refs_test.ts` asks for `D<id>` |

---

## 2 · `capability-probes/run.py` is the clause-2 instrument, costs 3.35 s, and no gate runs it

CLAUDE.md is explicit that the distilled corpus "contributes ZERO emit-side evidence" and
that `run.py` "is therefore the instrument". Measured on this tree:

```
142 of 148 capability probes run · 6 still refuse
  GAP array-new-array-literal-fill.vl                  SILENT (check rc 0)
  GAP array-new-nullable-ref-fill.vl                   SILENT (check rc 0)
  GAP generic-array-new-wide-scalar-list-element.vl    SILENT (check rc 0)
  GAP inferred-projection-capture.vl                   SILENT (check rc 0)
  GAP hole-param-from-inferred-map-value.vl            emit refuses
  GAP uncalled-lambda-fn-param-call.vl                 emit refuses

run.py: 3.35 s wall, 3.65 user, 2.12 sys      (load 31)
```

Four of the six are **check-clean invalid wasm** — clause-1 violations with a hand-written
witness each. On the same tree, in the same minute:

```
$ python3 scripts/goal-scoreboard.py
  SCOREBOARD   runs    4630 / 7564   61.21%
  clause 1  soundness violated           0
  clause 2  emit rejected after check    0
            total against the goal       0
```

Both are correct about their own population and only one of them is about VL. That is
CLAUDE.md's "name the population in the sentence" made concrete on today's tree, and the
cheaper of the two instruments is the one nothing runs.

**The header's own argument against gating has expired.** `run.py:8` reads *"NOT A MERGE
GATE. Today every probe fails, by construction; that is what makes them probes."* That was
true when 148 of 148 refused. At 142 of 148 the probes are a corpus of programs that WORK,
and the criterion that fits them is exactly `regress.py`'s: **block on a probe that ran and
stopped running.** It exits non-zero today (6 refuse), so it needs the ratchet shape the
other five already have — a committed `{probe: verdict}` baseline, `--check` failing when a
`RUNS` becomes anything else, `--write-baseline` in the PR that earns it, `--why` naming what
left.

**Size S.** `scripts/ratchet.py` already exposes `Ratchet(baseline, codes, current_fn,
named_fn)`; a `capability-budget.py` front end is the ten lines §15 describes, and the census
is `run.py`'s own `grade()` loop. **Risk, named:** a probe is graded by a `Should print …`
line in its own header, so a probe whose contract is prose grades `WRONG` rather than `RUNS`
— the baseline must be written from a run whose six GAPs are the six above, not from an
assumption that every non-GAP is `RUNS`. **Proof:** the row costs 3.35 s (cheaper than 15 of
the 23 gate rows), `python3 scripts/capability-probes/run.py` unchanged on a clean tree,
`--sites` unchanged, and `tests/vl_capability_matrix_test.ts`'s shape for the front end.

---

## 3 · 584 corpus cells are not in the index, and `regress.py` answers for them anyway

`baseline.jsonl` holds 7,564 cells. `expected.jsonl` — the index carrying each cell's `block`
and `represents` — holds **6,980**. The difference is one-directional:

```
in baseline but NOT in expected.jsonl: 584
in expected.jsonl but NOT in baseline:   0
by grid: d591 183 · d592 144 · d591t 121 · d661 81 · d626 19 · d841 6 · d791 5 · …
```

`regress.py` reads the index with a default at every site:

```python
ncur = sum(1 for c in now if idx.get(c, {}).get("block", "A") not in DERIVED_BLOCKS)
row  = (c, b["class"], v["class"], idx.get(c, {}).get("represents", 0))
pop  = sum(idx[c]["represents"] for c in idx)
```

Three consequences, each measured:

* **The derived/curated split it prints is wrong.** `distilled corpus: 2061 representatives
  … plus 5503 curated cells`, where the directories hold **1,477** in `cells/` and **6,087**
  in `named/`. The 584 default to block `A`, which `DERIVED_BLOCKS` says is derived, so 584
  curated cells are counted as representatives. Direction confirmed: 0 cells in `cells/`
  carry a curated block, 584 in `named/` carry a derived one.
* **A movement in any of the 584 reports zero cells.** `show()` sums `r[3]`, which is the
  defaulted `represents`, so the line would read `1 classes ( 0 of 255504 census cells)`.
  The gate's verdict is unaffected — `if lost:` counts classes, not cells — so this is a
  REPORT defect, not a gate hole. It degrades exactly the habit CLAUDE.md says the full runs
  earned: *"report `runs → not-runs` and `→ silent` explicitly rather than histogram
  deltas"*.
* **`pop` itself excludes them.** `255,504` is the census population the 6,980 indexed cells
  stand for; the 584 stand for nothing the number can see.

The rule being broken is stated in the README of the same directory: *"an artefact must not
be able to give a confident answer it did not compute."* `README.md` §`expected.jsonl` even
defines the classification this breaks — *"a cell is curated exactly when its `block` is not
one of the five census blocks `A`–`E`"* — which is unanswerable for a cell with no row.

**Proposal.** `regress.py` fails on `set(baseline) - set(index)` non-empty, naming the cells
and the fix (`redistil.py`, or the appending step `d521/unannotgrid.py:309` already performs
for its own sets). Then either backfill the 584 through the tool that added them, or record
their `block`/`represents` from `named/sources.json`. **Size S.** **Risk, named:** the check
must run BEFORE the grader, or a tree that is merely mid-edit reds after paying 66 s; and
`--write-baseline` must be allowed to add a cell to both files in one move, otherwise the
first landing after the check cannot pass it. **Proof:** `regress.py` on an unchanged tree
still prints `no cell changed class`, the split line reads 1,477/6,087, and the master-only
`baseline freshness` row still passes.

---

## 4 · The gate is 127 s, the budget is ~90 s, and the corpus is the new critical path — **landed #2621**

One full `gate.sh --no-build` on this tree, seed refreshed first, `JOBS=4 DENO_JOBS=4`, load
31.7 rising to 73.6 as a second agent's gate started:

| gate | time | | gate | time |
| --- | ---: | --- | --- | ---: |
| **distilled corpus** | **127.0 s** | | mono-tyaram-grid | 34.5 s |
| ci-native | 93.7 s | | self-compile time | 16.8 s |
| filed witnesses | 71.2 s | | lsp suites (ci list) | 13.1 s |
| deno task test | 68.8 s | | lint-self + fmt | 12.1 s |
| native-fixpoint | 43.1 s | | comment / kind-ladder / sentinel / dead-export | 8.3 / 6.5 / 7.0 / 8.2 s |
| scaling shape | 39.7 s | | the other seven rows | ≤ 2 s each |

`ALL GATES PASS`, 23 rows. The first pass measured `ci-native` as the critical path at 74.9 s
with `distilled corpus` second at 65.3 s; the two have swapped, and the wall is now **~40%
over the budget CLAUDE.md sets**.

**Five numbers in CLAUDE.md §Gates no longer describe the tree**, each re-derived here:

| CLAUDE.md says | the tree says | how |
| --- | --- | --- |
| "Twenty-one gates" | **23** (24 on master) | `grep -c '^run "' scripts/gate.sh`, plus the indented master-only row |
| wall "**~82 s**" | **127.0 s** | the table above |
| `regress.py` "in **~7 seconds**" | **66.3 s** wall, 330.6 CPU-s, 498% cpu | `/usr/bin/time`, run alone at load 59 |
| "`cells/` … **1,477 programs**" | 1,477 files, **2,061** representatives reported | §3 |
| "the **250,238**-cell census" | **255,504** | `regress.py`'s own summary line |
| "the distilled corpus holds **7,021 cells**" | **7,564** | `wc -l baseline.jsonl` |

The 7 s figure is the one that matters, because it is the argument the whole distilled-corpus
design rests on ("the distilled corpus asks the same question in under ten seconds, so it is
IN the gate rather than beside it", `gate.sh:9-10`). At 66 s alone and 127 s in the fan-out that
argument needs restating, not just the number.

**Proposal, and it is a decision rather than a patch.** The growth is entirely in `named/`,
which is curated and only accumulates: it went 5,544 → 6,087 cells while `cells/` stayed at
1,477. That is by design — CLAUDE.md is right that a derived rule provably cannot find those
cells — so the options are (a) accept a larger budget and say so, (b) shard `named/` so a
merge gate runs the sets a change can plausibly move and a nightly runs all of them, or (c)
re-distil `named/` against the current compiler, which is the one thing CLAUDE.md already
asks for after a sweep and which nothing has done since the sets were added. **Risk, named:**
(b) is the "random sample" mistake wearing a new hat unless the shard key is *provenance*
(which grid named the set) rather than a hash; (c) risks collapsing a class a future compiler
splits, which is the standing known risk and the reason to re-distil often rather than never.
**Proof:** the wall clock, and `regress.py --write-baseline` producing an identical baseline.

---

## 5 · The TIME column is a contended time, and consolidated row 1 did not fix that — **landed #2621**

`gate.sh:44-46` now stamps the finish inside the subshell, so each row reports its own wall
time rather than the report loop's clock — consolidated row 1, landed #2564, and the rows are
no longer identical. What the column still cannot say is what a row COSTS, because every row
is measured with 22 siblings on the box:

| row | in the fan-out | run alone | ratio |
| --- | ---: | ---: | ---: |
| `filed witnesses` | 71.2 s | **18.8 s** (load 59) | **3.8×** |
| `distilled corpus` | 127.0 s | **66.3 s** (load 59) | 1.9× |

Both "alone" readings are themselves at load ~59, so the true ratios are larger. The
consequence is the one row 1 was filed for: a scheduling decision read off the table
("`filed witnesses` is the third-most expensive row") is wrong by a factor of four, and the
row that actually deserves attention is the one whose ratio is LOW, because that is the one
whose cost is real work rather than waiting.

A second reading in the same table is worth naming because it looks like a bug and is not:
`lsp typecheck` reports **0.0 s** warm and **68.8 s** cold (measured across two runs on one
tree). `deno check` caches, and the first run in a session pays for all of them. Anyone
sizing that row from one table gets either number.

**Proposal.** Have `run()` also record `%U`/`%S` (a `/usr/bin/time -f` wrapper writes them
beside the existing stamp) and print a CPU column next to TIME. CPU seconds are what the box
cannot inflate, they are already the unit `self-compile-time.sh` gates on, and the ratio
TIME/CPU is exactly the contention the table currently hides. ~8 lines. **Risk:** none to any
verdict; `/usr/bin/time` is not present everywhere, so fall back to bash's `times` or omit
the column rather than failing a row. **Proof:** exit codes unchanged, the table gains one
column, and the two rows above read 18.8/71.2 and 66.3/127.0 with the difference visible.

---

## 6 · Ten gate rows take whichever `python3` is first on `PATH` — **landed #2621**

Measured during this survey, because the box changed under it: Homebrew relinked its
`python3` (3.14) at 08:40 and it stopped loading —

```
$ python3 scripts/seed-size.py --check
python3: /home/linuxbrew/.linuxbrew/opt/glibc/lib/libm.so.6: version `GLIBC_2.38' not found
python3: /home/linuxbrew/.linuxbrew/opt/glibc/lib/libc.so.6: version `GLIBC_2.38' not found
rc=1  elapsed=0.0017 s
```

`/usr/bin/python3` (3.12.3) runs every one of these scripts unchanged, so this is a `PATH`
question and not a compatibility one. The blast radius:

| consumer | count |
| --- | ---: |
| `gate.sh` rows that shell `python3` | **10 of 23** (comment / seed size / arena-scan / kind-ladder / sentinel-index / dead-export budgets, filed witnesses, splice scan, distilled corpus, baseline freshness) |
| `tests/*.ts` that spawn `"python3"` | 8 |
| `ci.yml` steps that run `python3` | 4 |
| scripts with a `#!/usr/bin/env python3` shebang | all of them |
| anything in the tree that pins a version or an interpreter path | **0** |

**The failure is not silent, and it is not distinguishable either.** `Ratchet.check`
(`scripts/ratchet.py:170`) returns **1** when a file exceeds its baseline; a missing or broken
interpreter also returns 1. In the gate table both render as `FAILED rc=1` with a log path, and
the one apparent tell — a 0.0 s TIME — is not a tell, because `lsp typecheck` legitimately
reads 0.0 s when `deno check`'s cache is warm (§5). Ten of twenty-three rows would go red at
once, which reads as a catastrophic regression from whatever was last merged; the actual cause
is in each row's log and nowhere in the summary.

**One place degrades quietly rather than reddening.** `scripts/lint-self.sh:70-72` builds the
lint filter from three command substitutions —
`$(python3 scripts/scan-budget.py --exempt-codes)` and friends — and a command substitution
whose command fails yields the empty string without tripping `set -e` in an argument list. With
a broken interpreter every exemption list is empty, so `lint-self.sh` grades the tree against
codes whose baselines still owe them. Today that reds (the `--filter-lint` call is python too),
but the shape is one failing substitution away from a wrong answer rather than an error.

**Proposal.** A first `run "python3"` preflight row in `gate.sh` — `python3 -c 'import sys;
print(sys.version)'` — so the table's first line says `python3  0.0s  FAILED` and names the
cause once instead of ten times. It is ~2 lines, costs milliseconds, and turns "ten ratchets
regressed" into "the interpreter is broken". **Risk, named:** it must not hardcode an
interpreter path — the tree deliberately uses `#!/usr/bin/env python3` and CI, the main
checkout and a container may each resolve it differently, so the preflight REPORTS which
`python3` answered rather than choosing one. A version floor (the scripts use
`str.removeprefix`, so 3.9+) belongs in the same line, printed and not enforced. **Proof:** the
gate table on a healthy box is unchanged but for one ~0 s row; with `PATH` pointed at a broken
interpreter, exactly one row fails and its name says why.

---

## 7 · Forty-six suite files run twice in one gate, and two run three times — **landed #2621**

Six gate rows select test files. Resolving each row's selector against `tests/`:

```
suite files reached by a gate row: 119
   run 1 time(s):  16 files
   run 2 time(s): 101 files
   run 3 time(s):   2 files      vl_inventory_refs_test.ts, vl_no_conflict_markers_test.ts
```

Most of the 101 are not a duplicate run: 53 of the 79 files ci-native's glob selects read
`SELFHOST_NATIVE_ALIGN` themselves and 4 more read it through `tests/support/nativeRelease.ts`,
so under `deno task test` (which does not set it) they are ignored and under `ci-native` they
run. **The remainder do run twice, identically:**

* **22** files in ci-native's glob where nothing — the file, `tree.ts`, or `nativeRelease.ts` —
  reads the variable: `vl_buffer_view_bounds_contract_test.ts`,
  `vl_buffer_view_bounds_shape_test.ts`, `vl_export_budget_test.ts`, `vl_seed_size_test.ts`,
  `selfhost_native_gc_test.ts` and 17 more.
* **24** files in `lsp suites (ci list)`, every one of which is also matched by `tests/` —
  none reads the variable.

The first pass measured `vl_buffer_view_bounds_shape_test.ts` at 21.0 s and
`vl_buffer_view_bounds_contract_test.ts` at 12.0 s; both are in the 22. #2592 removed the
47th file (`vl_scaling_shape_test.ts`) from both globs for precisely this reason and left the
argument on the table for the rest.

**The value is CPU, not wall.** The rows are concurrent, so dropping 46 duplicate runs does
not shorten `ci-native`; it removes ~46 suites' worth of contention from a gate that contains
**two rows whose verdict is a measurement** — `scaling shape` (a time ratio) and
`self-compile time` (a CPU-second tripwire) — and from every reading in §5.

**Proposal.** `deno task test`'s gate row already carries one `--ignore`; extend it to the
lsp (ci list) file set, extracted from ci.yml the same way the lsp row extracts it, plus the
22 named above. **Size S. Risk, named:** the exclusion must live in `gate.sh` ONLY —
`deno.json`'s task and `ci.yml` are what CI runs and must keep the full set, and
`tests/ci_seed_coverage_test.ts` guards ci.yml's side. A file dropped from `gate.sh`'s row 1
and never added to another row would be ungated locally, so the exclusion list has to be
DERIVED from the other rows' selectors rather than written out. **Proof:** the gate table;
each suite's own case count unchanged; `ci_seed_coverage_test.ts` green.

---

## 8 · The witness checker is 624 rows in a serial loop

`check-filed-witnesses.py:436-480` is one `for doc … for r in parse(doc)` loop calling
`run_program`, which spawns up to three `vl` processes per row (`check`, `run`, `build`).
Measured alone at load 59:

```
filed witnesses: 18.79 s wall, 18.20 user, 9.14 sys, 145% cpu
624 graded · 624 as filed · 0 MOVED · 0 not graded · 0 UNPARSED
```

145% of one core on a 24-core box, while holding a gate row for 71.2 s. Every other heavy row
in the ladder fans out — `regress.py` reaches 498% at `JOBS=6`, the deno rows take
`--parallel`.

**Proposal.** A `concurrent.futures.ThreadPoolExecutor(JOBS)` over the flattened row list.
The work is subprocess-bound so threads are the right primitive, and the report already
collects into `results` and prints afterwards, so output order is unaffected by construction.
~15 lines. **Risk, named:** `run_program` writes a build artefact (`-o out`) — if that path is
shared rather than per-row-temporary, parallel rows clobber each other and the failure is a
wrong VERDICT rather than an error. Check that first; it is the one thing that makes this
change unsafe. **Proof:** `624 graded · 624 as filed · 0 MOVED` byte-identical, the row order
identical, and the row's own time in the gate table.

---

## 9 · There are two inventories and the gate grades one

```
docs/internals/inventory/    624 D*.md rows   — the `filed witnesses` gate row
docs/internals/inventory-2/   17 D*.md rows   — no gate row
```

Fourteen ids collide (`D1`–`D14` exist in both, as different defects).
`tests/vl_inventory_refs_test.ts:20` knows both directories and says so — *"Per inventory,
not across"* — so citations resolve correctly and that half is guarded. `gate.sh:127` names
one path, and so does CLAUDE.md's paragraph on the split.

Graded by hand on this tree:

```
$ python3 scripts/check-filed-witnesses.py --strict docs/internals/inventory-2
17 graded · 17 as filed · 0 MOVED · 0 not graded · 0 UNPARSED
```

So this is a LATENT gap, not a live wrong claim: nothing has re-run those 17 witnesses since
they were filed, and CLAUDE.md's own rule is that such rows go stale one-directionally.

**Proposal.** Add the path to `gate.sh:127` (the checker takes several) and to CLAUDE.md's
sentence. **Size:** one word each. **Risk:** none — it costs ~5 s and the rows pass today.
**Proof:** the `filed witnesses` row reads `641 graded`.

---

## 10 · `run.py` takes the ambient std; `matrix.py` pins it

`run.py:11` says the two share a grading vocabulary — *"`matches`, `classify` and `grade` are
the shared grading vocabulary; `matrix.py` imports them"* — and they disagree about the one
thing CLAUDE.md has a section on:

```python
# scripts/capability-probes/matrix.py:506
env = dict(os.environ, VL_STD=a.std)
# …:436
verdict, detail, out = probes.grade(p, seed, want_for(t, name), vl=vl, env=env)

# scripts/capability-probes/run.py:93
def grade(path, compiler, want, vl=VL, env=None, timeout=120):
# …:135
verdict, detail, out = grade(p, a.compiler, want)      # env=None -> the ambient environment
```

Measured from this worktree with `VL_STD` unset:

```
$ ./scripts/vl-host/target/release/vl --version
seed:    build/vl-compiler.wasm (2154067 bytes) — development tree (current directory)
std:     /home/verit/vl/std (11 modules, 7398f5e6f6b7d5a9) — development tree
```

**10 of the 208 files under `capability-probes/` name `std:`**, two of them with a real
`import … from "std:…"`. So the reach is narrow and the hazard is exactly the one CLAUDE.md
names: the Deno gates stay honest while the hand probe lies.

Two others in the same family are already correct and are recorded so coverage can be told
from silence: `scripts/silent-sweep/census/gradecensus.py:40` pins `VL_STD`, and every one of
`scripts/perf/`'s twelve binary-spawning scripts pins it (0 unpinned). Four `tests/*.ts`
spawn `python3` without pinning it (`vl_capability_matrix_test.ts`, `vl_day_one_sampler_test.ts`,
`vl_emitter_state_audit_test.ts`, `vl_seed_size_test.ts`) and are fine because the python
driver each spawns pins it itself — except the one that does not, which is `run.py`.

**Proposal.** `run.py`'s `main` builds `env = dict(os.environ, VL_STD=os.path.join(ROOT,
"std"))` and passes it, exactly as `matrix.py` does; better, `grade()`'s default stops being
`None`. **Size: 2 lines. Risk:** none — a caller wanting a different std passes one, which is
what `matrix.py` already does. **Proof:** `run.py` prints the same `142 of 148`; a probe
importing `std:` graded from a worktree whose `std/` has been edited moves.

---

## 11 · The third host is being maintained by hand and read by no instrument

The first pass (§3.4) called `scripts/wasmtime-host.rs` *"a stale copy that two docs tell you
to update"* and offered two options. Neither was taken, and the state has moved in the
direction that makes it worse:

* It **grew**, 410 → **479 lines**, and two std landings edited it: #2535 (`readFileRange` +
  `fileSize`) and #2578 (`readFileInto`). Somebody is paying the maintenance.
* Its import set is now **complete**: all 17 `__…__` names `main.rs` registers, plus the two
  retired `__log__`/`__log_string__`. So the "it has fallen behind" framing is no longer the
  problem.
* The **print contract is still wrong**. `:14` declares `print_chars: Vec<u32>` "code points
  streamed by `__print_char__`", `:52` pushes the argument as a code point and `:57` rebuilds
  the line with `char::from_u32` per element. Both live hosts take a UTF-8 **byte**:
  `main.rs:3561-3565` ("STAGE 2c: the argument is a UTF-8 **byte**, not a code point") and
  `tests/support/runWasm.ts:136-140`, which decodes once per line. Every multi-byte character
  the third host prints reads as Latin-1.
* **Five docs name it**: `perf-program.md:2437` and `buffer-design.md:166` call it retired,
  while `concurrency-design.md:283`, `extern-design.md:185` and `ROADMAP.md:1235` list it as a
  sink a new host import must land in. `extern-design.md` is new since the first pass.

**Proposal, unchanged in shape and sharper in its argument.** The maintenance cost is now
demonstrated, so "delete it" is cheaper than it was and "gate it" is better justified: it is
the smallest complete host (~479 lines) and `ROADMAP` H-M2's WASI shim will be measured
against something. Either give it a `Cargo.toml` and a gate row that runs one multi-byte
print — which would have caught this contract on the day Stage 2c landed — or delete it and
fix the three docs that treat it as a sink. **Risk, named:** gating it adds a `cargo build` to
the ladder, and CLAUDE.md forbids agents building into the shared target, so the row needs its
own `--target-dir` or it becomes the second thing that clobbers the live binary. **Proof:**
either a new gate row printing a non-ASCII string, or `grep -rn wasmtime-host.rs` returning
nothing outside the two "retired" mentions.

---

## 12 · One shape, twelve copies, in `server.ts`

`lsp/src/server.ts` (1,751 lines, 16 `connection.on…` handlers) reaches the wasm checker
through one repeated idiom: a feature-availability guard, a call with the same argument
tuple, and a `.catch` that logs to `connection.console` and returns a fallback.

```
12  `wasmChecker?.<method> === undefined` guards
    builtinCompletions hoverTypeAt importedNameSources inlayHintsAt memberCompletionsAt
    memberTypeAt referencesAt scopeAt signatureAt tokensAt typeAliasAt ufcsCandidatesAt
19  `.catch((err) => { connection.console.log(…); return <fallback>; })`
16  `connection.console.log(`[wasm-…] <method> failed: ${err}`)` messages
13  `entryKeyOf(params.textDocument.uri)` spellings; 27 `workspaceReader` mentions
```

Two of the nineteen catches are verbatim duplicates of another: `planRenameAt failed` at
`:801` and `:829`, `referencesAt failed` at `:512` and `:579`. Per handler:

| handler | lines | `documents.get` | reader builds | catches |
| --- | ---: | ---: | ---: | ---: |
| **onHover** | **359** | 3 | 9 | 8 |
| onInitialize | 150 | 0 | 0 | 0 |
| onCompletion | 107 | 1 | 2 | 2 |
| onCodeAction | 104 | 1 | 0 | 0 |
| the other 12 | ≤ 89 | 1 | 0–2 | 0–2 |

**Proposal.** One `askWasm(method, fallback, ...args)` helper: it holds the
`wasmChecker?.[method] === undefined` guard, the `[wasm-symbols] <method> failed` log prefix,
and the fallback. Every one of the twelve becomes a line. `onHover`'s three-rung ladder then
reads as three calls rather than three closures. **Size M. Risk, named:** the nineteen catches
have **two** fallbacks — `undefined` (13) and `[] as WasmToken[] / WasmRange[]` (6) — so the
helper is generic in its fallback or it silently changes six handlers' empty answers into
`undefined`, which the LSP renders differently. And the log-and-swallow itself is a second
error channel with no counter: an editor that quietly degrades to the TS path is
indistinguishable from one that never had a native answer, so the helper is the right place to
add the counter `graphCheckCount()` already models. **Proof:** the whole `lsp_*_wasm_test.ts`
family, `lsp suites (ci list)`, `lsp typecheck`, `lsp lint`.

The two remaining direct graph-check paths after #2593/#2606 were checked and are correct:
`diagnostics` (`wasmChecker.ts:1696`) and `compile` (`:1727`) each run `ensureStaged` and then
a full `checkSrc`/`compileSrc`, setting `checked = false` because the symbol tables are gone.
`ensurePrepared` covers the other fourteen. Nothing left half done there.

---

## 13 · The auto-import tie-break knows about origin and not about the receiver

#2579 gave `moduleSurface` re-exports, which took the duplicate-name population from one to
six:

```
Buf          std:buffer, std:fs (re-export of std:buffer)
Utf8Error    std:args (re-export of std:utf8), std:utf8
join         std:fmt (re-export of std:str), std:str
repeat       std:fmt (re-export of std:str), std:str
split        std:fmt (re-export of std:str), std:str
lastIndexOf  std:array, std:str            <- both DECLARE it
```

`stdAutoImportCompletions` (`lsp/src/typeFeatures.ts:1674-1676`) resolves five of the six
correctly, and its own header says how: *"a module the file ALREADY imports from … else the
module that declares the name, else the sorted-first re-exporter."*

```js
const pick = offers.find((o) => importsModule(source, o.key)) ??
  offers.find((o) => o.exp.origin === undefined) ??
  offers[0];
```

`lastIndexOf` is the case the rule cannot reach: both offers have `origin === undefined`, so
the second clause returns the sorted-first DECLARER, which is `std:array` (`self: T[]`).
Accepting the completion on a string receiver produces the diagnostic the first pass measured
— *"no method 'lastIndexOf' for string — the free function `lastIndexOf` takes `self: T[]`"*.

**Proposal.** A fourth clause before the declarer rule: when the completion fires at a `.`,
the receiver type is available, so prefer the offer whose `self` parameter matches it; where
it is not (a bare identifier completion), offer both items rather than picking. **Size S,
LSP-owned. Risk, named:** the receiver type is not available for every completion trigger, so
the rule must DEGRADE to today's behaviour rather than dropping the item — and the tie-break
must stay deterministic or `lsp_auto_import_test.ts` becomes flaky. **Proof:**
`tests/lsp_auto_import_test.ts` plus one case per receiver kind, and the five re-export names
must keep resolving as they do now.

---

## 14 · Consolidated row 18 landed; the value it was ranked for has not moved

Row 18's value was *"86 of 86 glean files pay the second import the re-export exists to
remove"*. #2579 landed and the mechanism is fixed and pinned — `tests/lsp_auto_import_test.ts:314`
asserts the edit `import { Utf8Error, programArgs } from "std:args"`. Measured in `~/glean`
today:

```
files importing std:args                       90
… that take Utf8Error from std:args             0
files taking Utf8Error from std:utf8           90
```

Zero uptake, and the population grew from 86 to 90. That is not a criticism of the fix: an
existing file does not rewrite itself, and the fix is what makes the NEXT file cheap. It is a
statement about the ranking — **the row's stated value was measured on files that already
exist, and nothing in the tree will ever report that it did or did not arrive.**

The same reading holds for the other re-exports, from this tree's own scan of 11,864 vl-tree
files and 157 glean files:

| re-export | consumers |
| --- | ---: |
| `std:fmt` `join` | 8 |
| `std:fmt` `repeat` / `split` | 1 / 1 |
| `std:args` `Utf8Error` | 0 real (2 hits, both a test assertion and a doc line) |
| `std:fs` `Buf` | 0 — but the export is one day old (#2578) |

**Proposal.** This is a measurement, not a refactor: either run the codemod in the consumer
(90 one-line edits, and the consumer asked for the re-export) or record the zero and stop
ranking a landed row by an uptake nobody is going to produce. The general form is worth one
line in the survey method: **a row whose value is "N existing files pay X" is not discharged
by making X unnecessary.** **Proof:** the scan in §19, re-run.

The same scan re-derives the first pass's idle-export list: **21 of 134 std exports are
imported by no file outside `std/`** (was 23). Twelve are the `std:test` runner protocol
(resolved by `compiler/cli.vl:1358`, not by an import) and `std:buffer`'s structurally
resolved `F32Base`/`I32Base`; the nine `E*` errno constants in `std/fs.vl:35-43` are still
never exercised end to end, and `readFileInto`/`readFileRangeInto` have just added error paths
that return them. One corpus case comparing `err.code == EISDIR` remains worth more than the
nine names.

**What the rubric would still pass**, re-checked so coverage is distinguishable from silence:
no boolean parameter in any std signature; no second error channel on the surface; every
fallible export returns `T | E` or `T | null`; `std:buffer`'s ambient LIFO arena
(`bufferMark`/`bufferRelease`) is the rubric's named exception and is justified in both the
module header and `std-api-review.md:64`; the six exports added since the first pass
(`filled`, `storeBytes`, `loadBytes`, `Buf`, `readFileInto`, `readFileRangeInto`) each carry
their reasoning in `std-notes.md`.

---

## 15 · The ratchet core landed; the five front ends still share their `main()`

#2582 and #2587 put `Ratchet(baseline, codes, current_fn, named_fn)` in `scripts/ratchet.py`
(258 lines) and gave `--why` to all five, which CLAUDE.md asked for. Re-deriving the first
pass's measurement — non-blank, non-comment lines, each script's own name collapsed:

| script | distinct code lines |
| --- | ---: |
| `comment-budget.py` | 332 |
| `ladder-budget.py` | 185 |
| `scan-budget.py` | 179 |
| `export-budget.py` | 150 |
| `sentinel-budget.py` | 124 |
| `seed-size.py` | 99 |

The four-way intersection fell **41 → 28**, and **26 of the 28** are one block: the imports,
`BASELINE = os.path.join(ratchet.ROOT, …)`, the `R = ratchet.Ratchet(…)` call, and `main()`'s
argv ladder —

```python
args = sys.argv[1:]
if "--exempt-codes" in args:   return R.exempt_codes()
if "--why" in args:            return R.why(ratchet.flag_value(args, "--why"))
cur = current()
if "--write-baseline" in args: return R.write_baseline(cur)
if "--check" in args:          return R.check(cur)
```

— plus each script's own per-file table tail, which differs only in column widths. The flag
sets have drifted with it: `--grade` on 3 of 5, `--exempt-codes` on 4 of 5 (`export-budget`
has none, correctly, because its baseline is at zero and `lint-self.sh` has nothing to hold
out), `--list` taking a code on two and a limit on two others. `ladder-budget` and
`sentinel-budget` still share **52** lines (41% of the smaller), including the
`importlib.util.spec_from_file_location` dance each uses to import its dash-named census.

**Proposal.** `ratchet.main(R, args, current_fn, extra_cmds={…})` owning the ladder and the
table; each front end keeps its census, its `Ratchet(…)` construction and its own commands.
Removes ~130 lines and makes the flag set uniform by construction. A `ratchet.load_census(
"sentinel-census.py")` retires the importlib copy. **Size S–M. Risk, named:** the ORDER of
the ladder is load-bearing in two scripts — `ladder-budget` runs `check_sets(lc)` before
`--why`, `sentinel-budget` builds the census before `--why` but not before `--exempt-codes` —
so a shared ladder needs an explicit "before any command" hook rather than a fixed order.
**Proof:** every `--check` and `--write-baseline` byte-identical on an unchanged tree and
still failing on a seeded regression; `vl_comment_budget_test.ts`, `vl_kind_ladder_test.ts`,
`vl_sentinel_index_test.ts`, `vl_export_budget_test.ts`.

Current standings, for the record: 379 unguarded reads / 0 untested strict; 102 scans outside
a pass; 440 silent ladders / 8 split walks; 0 of all four comment codes; 0 dead exports.

---

## 16 · `vl --version` names three trees, and the shared binary is 31 commits behind

Consolidated row 19 (an owner ruling) is *"the seed anchors on the CWD, std on the EXE's
tree; one `vl --version` names two checkouts"*. It names three:

```
$ ./scripts/vl-host/target/release/vl --version          # from this worktree, VL_STD unset
vl 0.1.0 (host ABI 2)
commit:  c5d9cc9cb0dd                                    # the BINARY's build commit
seed:    build/vl-compiler.wasm (2154067 bytes) — development tree (current directory)
std:     /home/verit/vl/std (11 modules, …) — development tree
```

`c5d9cc9cb` is #2576, **31 commits before this tree's HEAD** (`build.rs:23` stamps
`VL_BUILD_COMMIT` from `git` at build time). Nothing compares it to anything. Today that is
harmless — `git log c5d9cc9cb..HEAD -- scripts/vl-host/` is empty, so 0 of the 31 touched the
host — and that is exactly why it is worth a line: the reason it is safe is a fact nobody
checked, and CLAUDE.md's rule that the shared binary is rebuilt "only as a coordinator step
after the change MERGES" makes a host change landing without a rebuild invisible to every
gate.

**Proposal, as a third leg of row 19's ruling rather than a separate change.** When
`version_report()` runs inside a git checkout, compare `VL_BUILD_COMMIT` against
`scripts/vl-host/`'s last-changed commit and add one line when they differ — *"the host was
built before <sha>, which changed `scripts/vl-host/`"*. That is the same shape as the
mixed-tree announcement §3.1 of the first pass proposed for the seed/std pairing, and it fires
on the same condition class: an origin the caller did not choose and would not expect. **Size
S. Risk, named:** `--version` must not shell out to `git` on a distribution build (it has no
checkout, and the cost would be paid on every invocation) — the comparison belongs behind the
same "development tree" test the two origin labels already use. **Proof:**
`tests/vl_std_cmd_test.ts` and a new case pinning the line's absence on a matching build.

---

## 17 · Doc-to-instrument drift: 152 dangling paths, and `scripts/perf/` has no index

`tests/vl_inventory_refs_test.ts` asks "of every `D<id>` the tree cites, which has no row?"
over 11,787 citations. Nothing asks the same question of a PATH. Scanning 762 markdown files
under `docs/` plus the four root docs for `(scripts|tests|lsp/src|compiler|std)/…` mentions:

```
2,740 distinct doc -> path mentions
  216 name a path that does not exist
   64 of those are in CHANGELOG.md, which is history and correctly keeps them
  152 are in a LIVE doc:
        88  tests/  — a fixture or suite
        37  compiler/*.ts — the retired TS compiler
        17  std/
         9  scripts/ — an INSTRUMENT somebody is told to run
```

The nine:

| path named | by |
| --- | --- |
| `scripts/dead-export-budget.py` | `code-quality-survey-2026-09/emitter.md` — it is `scripts/export-budget.py` |
| `scripts/silent-sweep/d471-opdecl-grid.py` | `parser-notes.md` |
| `scripts/parsercount.py` | `destringify-types-program.md` |
| `scripts/perf.ts` | `selfhost-spans-design.md` |
| `scripts/fuzz_opt.py` | `wasm-toolchain-audit.md` |
| `scripts/build-binary.ts`, `scripts/smoke-binary.ts` | `deno-deprecation.md` |
| `scripts/build-compiler-wasm.ts` | `genesis-design.md` |
| `scripts/vl-compiler-driver.vl` | `format-notes.md` |

The first one is the live case: a doc written last week to be READ BY A SCHEDULER names a
ratchet that does not exist under that name.

**And `scripts/perf/` — 27 instruments, four of them landed this week — has no index.**
`docs/internals/profiling-the-compiler.md` is the doc CLAUDE.md points at ("Details and when
each fires: `profiling-the-compiler.md` §Guards") and it names **0 of the 27**; it names
`scripts/profile-rank.py`, `self-compile-time.sh` and `scan-budget.py`. Twenty-four of the 27
are named in exactly one doc — `perf-opportunities-2026-09.md`, a measurement LOG, where a
tool appears beside the number it produced and is never listed as a thing to run — and three
(`ci-native-time.sh`, `ci-trend.sh`, `per-test-rank.py`) are named in no doc at all;
`ci-native-time.sh` and `per-test-rank.py` are named in no other file in the tree.

They do share their footing, informally: 17 of 27 open with `cd "$(dirname "$0")/../.."`,
20 carry a `#   scripts/perf/<name> …` usage line, 13 export `VL_STD` and **0 of the 12 that
spawn the binary leave it unpinned** — which is the §10 hazard closed for this directory.
(Three files are mode 644 where 24 are 755; `.ts`/`.py` are run through their interpreter, so
this costs nothing and is noted only because it is the kind of thing that reads as a bug.)

**Proposal, in two halves.** *(a)* Fix the nine, which is nine one-word edits, and add a
§Instruments table to `profiling-the-compiler.md` — one line per `scripts/perf/*` naming what
it measures and what it costs, generated from each script's own usage line so it cannot drift.
*(b)* A `tests/vl_doc_paths_test.ts` of the same shape as `vl_inventory_refs_test.ts`,
ratcheted rather than at zero: every `scripts/`-prefixed path a live doc names must exist, and
the count for `tests/`/`compiler/`/`std/` may only fall. **Size S for (a), S–M for (b). Risk,
named:** a path inside a fenced code block that is deliberately hypothetical (`std/NAME.vl` in
`std-design.md`, `compiler/x.vl` in `destringify-types-program.md`) is a false positive, so
the rule needs a placeholder convention or an exempt list — and starting it at the `scripts/`
subset avoids the 88 `tests/` fixtures, most of which are genuinely historical. **Proof:** the
test itself, ~230 ms in the shape `vl_inventory_refs_test.ts` already proves.

---

## 18 · What this pass checked and did not find

Recorded so coverage can be told from silence.

* **The test harness footing is fixed.** `const ROOT` in 59 files → **3**; `const VL` 54 → 0;
  `const COMPILER` 53 → 1; the verbatim `exists` helper 56 → 1. `tests/support/tree.ts` is
  imported by **66** files and pins `VL_STD`, `VL_COMPILER_WASM` and `RUST_BACKTRACE` from
  `import.meta.url`. Four test files still spawn without pinning and all four spawn `python3`,
  whose driver pins it — except `run.py` (§10).
* **The flag tables agree, once.** Three places name a flag — the host's `value_flags`
  (`main.rs:224`), `cliParseArgs`'s ladder (`cli.vl:815-905`) and each subcommand's `--help`.
  Diffed across all seven subcommands, exactly one disagreement stands: **`vl fmt --write`
  works and no `--help` names it** (verified by running it; `-w` is documented, `--write` is
  the accepted long form at `cli.vl:864`). `module_gate_agreement_test.ts` is the pattern for
  a three-way agreement test; it is ~40 lines and would have caught this.
* **`cliParseArgs`'s hand-counted prefix lengths are all correct today** — 6 sites now
  (`--severity=` 11, `--color=` 8, `--exclude=` 10, `-t=` 3, `--jobs=` 7, `--exclude=` 10),
  one more than the first pass counted, and still nothing checks that the number matches the
  literal.
* **No orphaned scripts at the top level.** 48 files directly under `scripts/`, **0** named in
  no other file (the first pass's `p7-eq.sh` is resolved). Two under `scripts/perf/` (§17).
* **`vl_inventory_refs_test.ts` is green** and handles the two-inventory id collision
  deliberately (§9).
* **The seed-size, comment, arena-scan, kind-ladder, sentinel-index and dead-export ratchets
  all pass**, and `--why` is on all five per-file ones as CLAUDE.md asks.
* **An operational finding for whoever reads this first:** at the start of this survey the
  main checkout's `build/vl-compiler.wasm` (05:42) predated #2609, so `gate.sh --no-build`
  there reds three `selfhost_native_release_shape_test.ts` cases with
  `want {"fns":3,…,"indirect":0} got {"fns":5,…,"indirect":2}` — #2609's own shape change read
  as a regression. After `scripts/refresh-compiler.sh` (2,153,348 → **2,154,067** bytes) all
  23 rows pass. This is the "stale seed" class, and the tell is that the three failing rows
  are exactly the three benchmarks the last landing names.

---

## 19 · What I measured, and how

Every command was run from a worktree at `a03a40784`/`4b0af3a47` with `node_modules` and
`scripts/vl-host/target` symlinked to the main repo's, after
`timeout 400 bash scripts/refresh-compiler.sh`. Nothing in the repo was modified. Scratch
scripts are throwaway and reproduced by the descriptions below. **`grep` in this shell is a
wrapper that silently skips files**, so every count here used `command grep` or Python — the
first pass earned that rule and it still applies.

**The gate ladder.** `JOBS=4 DENO_JOBS=4 bash scripts/gate.sh --no-build`, three runs: one at
load 125 (killed mid-run by a process restart, discarded), one on the stale seed (the three
shape reds in §18), one on the refreshed seed at load 31.7 → 73.6 (§4's table, `ALL GATES
PASS`). Row count: `command grep -c '^run "' scripts/gate.sh` = 23, plus the indented
master-only `baseline freshness`.

**Solo timings.** `/usr/bin/time -f "%e s wall, %U user, %S sys, %P cpu"` around
`python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm` (66.30 s / 498%),
`python3 scripts/check-filed-witnesses.py --strict docs/internals/inventory` (18.79 s / 145%)
and `python3 scripts/capability-probes/run.py` (3.35 s), each at load ~59 with the loads
quoted. `deno lint --config lsp/deno.json lsp/src/` timed with `date +%s.%N` at 11 ms.

**Gate-row overlap.** A Python pass resolving each row's selector against `tests/*.ts` —
`tests/` minus one `--ignore`, ci-native's two globs minus the same file, and the lsp list
extracted from `ci.yml` by the `awk` `gate.sh:65` itself runs — then counting owners per file.
Whether a file's run depends on `SELFHOST_NATIVE_ALIGN` was decided by its own text plus
whether it imports `tests/support/nativeRelease.ts` (whose `GATED` const reads the variable);
`tests/support/tree.ts` does not read it.

**The corpus index.** `scripts/silent-sweep/distilled/cellmap.py`'s `load_cells` over
`baseline.jsonl` and `expected.jsonl` (never `json.load`, per CLAUDE.md), set-differenced,
and each cell's directory taken from `cells/*.vl` / `named/*.vl`. `DERIVED_BLOCKS` read from
`regress.py:44`.

**Ratchet overlap.** A Python set-comparison over the six scripts' non-blank, non-comment
lines with each script's own name (both spellings) collapsed to a placeholder, reporting the
four-way and five-way intersections and every pair above 15.

**std usage.** A Python scan resolving `import { … } from "std:x"` (with `as` aliases) over
11,864 files in the vl tree outside `std/` and 157 in `~/glean`; export names from
`^export (function|const|type)`, the wrapped `export\n  function` form, and `export { … } from`
re-export lists. The `Utf8Error` counts are `command grep -rlE` over `~/glean --include='*.vl'`.

**The hosts.** `command grep -oE '"__[a-z_0-9]+__"'` over `main.rs`, `wasmtime-host.rs` and
`tests/support/runWasm.ts`, set-differenced; the print semantics read directly at
`wasmtime-host.rs:14,51-59`, `main.rs:3556-3565` and `runWasm.ts:136-140`.

**The flag tables.** A Python pass parsing `value_flags`'s match arms out of `main.rs`, the
`sub == "<cmd>" && a == "<flag>"` arms out of `cliParseArgs`, and running
`vl <cmd> --help` for all seven subcommands with `VL_STD` pinned, then diffing the three.

**LSP.** A Python pass slicing `server.ts` at each `connection.on…(` and counting idioms per
region; `wasmChecker.ts`'s remaining graph-check sites read directly (`grep -n graphChecks`).

**Doc paths.** A Python walk of 762 `docs/**/*.md` plus `CLAUDE.md`, `ROADMAP.md`,
`DECISIONS.md`, `CHANGELOG.md`, `README.md`, extracting
`(scripts|tests|lsp/src|compiler|std)/…\.(py|sh|ts|vl|rs|mjs|js)` and testing each against a
walk of the tree.

**Provenance.** `vl --version` from the worktree with `VL_STD` unset;
`git rev-list --count c5d9cc9cb..HEAD` = 31; `git log c5d9cc9cb..HEAD -- scripts/vl-host/`
empty.

**The interpreter, and what had to be re-run.** Every measurement above was taken before
Homebrew relinked `python3` at 08:40 (§6) and every one of them printed real output, so none
was the instant `rc=1` that break produces. The four ratchet totals, `goal-scoreboard.py`, and
the `expected.jsonl` set difference were nonetheless re-run afterwards with
`PATH=/usr/bin:$PATH` and reproduce identically (7,564 / 6,980 / 584; 379 · 102 · 440/8 · 0;
`runs 4630 / 7564`). §6's own numbers are the break itself: `PATH` pointed at each interpreter
in turn, `date +%s.%N` around one ratchet, and `command grep -c` over `gate.sh`, `tests/*.ts`
and `ci.yml` for the blast radius. No script was edited to name an interpreter.
