# Testing strategy — what earns a place in the merge gate

This is the rule going forward for adding, keeping and deleting checks in the merge gate
(`scripts/gate.sh` and `.github/workflows/ci.yml`). It builds on
[test-timing-2026-09.md](test-timing-2026-09.md), the measured survey of where test time goes:
that document's §1–§3 are still how a cost is measured, and its findings are dated readings.
Where the two disagree about what to keep, this one is the rule.

## 1 · The rule

**A check earns its place by catching a breakage nothing else catches.** A check is
*redundant* when every breakage it catches also breaks at least one other surviving check.
A redundant check is deleted, not parked in a periodic tier. If it states an intent no
survivor states (a language rule, a regression's named case, a defect id), that intent is
folded into the survivor that catches the same breakages: a case, an assertion, or a
one-line comment naming the rule or row. The whole test is not kept for it.

The margin is one: a deletion needs every breakage to stay caught by at least one surviving
check (owner's definition, 2026-10-31). No second catcher is required.

**Records are not just tests.** Inventory witnesses (`docs/internals/inventory*/D*.md`,
graded by `check-filed-witnesses.vl`) and corpus cells (`scripts/silent-sweep/`) are the
record of a defect. Deleting one needs the measurement shown to the owner first.

## 2 · How redundancy is measured: the kill matrix

Redundancy is not argued from reading tests, which looks like coverage and is not. It is
measured against broken compilers:

```sh
scripts/kill-matrix/run.sh [--out DIR] [MUTANT...]   # ~5 min per mutant on 4 cores
deno run -A scripts/kill-matrix/report.ts [DIR]
```

`run.sh` takes each mutant in turn and does four things:

1. applies it to `compiler/`;
2. builds the seed off the pristine one with `refresh-compiler.sh`;
3. runs every `gate.sh` row, with each `deno test` row writing junit;
4. restores `compiler/` and the pristine seed.

It first runs `pristine`, the unmutated tree, which gives every check's cost. It refuses
to start without `wasm-tools`, `/usr/bin/time` and binaryen. A suite whose tool is absent
registers as ignored and passes, so every mutant only that suite can see would read
`SURVIVED`. The first matrix run lost the release-shape suites this way, and the weakened
escape-inlining mutant graded as surviving. `report.ts`
prints three things: the checks that caught each mutant, the catches no other check made,
and a greedy list of checks that can be dropped, most expensive first, while every caught
mutant keeps a catcher. A `deno test` row is split into its test files, so a suite is weighed
file by file.

The mutants live in `scripts/kill-matrix/mutants/`, and they are of two kinds:

* **Reverted fixes** (`reverts.txt`): the `compiler/*.vl` half of a fix commit, applied in
  reverse. These are breakages the repo has actually had. A revert that no longer
  type-checks against the tree grades `seed-build-failed`, and only the seed build sees it.
* **Hand mutations** (`*.diff`): small edits in `check_*`, `emit_*`, the lexer, lint, fmt
  and the optimizer. They are weighted toward the breakages the EXPENSIVE checks exist to
  see, because that is where deletion pays:
  * a superlinear emit pass, for `scaling shape` and the self-compile fuel;
  * weakened escape inlining, for the release-shape suites;
  * a wrong union box tag, for `rep-fuzz`.

  A cheap fixture that catches everything a 26 s test catches makes the 26 s test the
  deletion, even though each fixture is unique. A hand mutant is written `vl fmt`-clean,
  or `lint-self + fmt` catches its formatting rather than its behaviour.

**What the matrix can and cannot show.** A droppable check is a candidate, not a proof. A
few dozen mutants can only show that the check was never the sole catcher among them. The
standard a deletion is held to is the distilled corpus's, from
`scripts/silent-sweep/distilled/README.md`: a deletion is safe when a breakage held out of
the matrix that chose it is still caught. So a deletion PR carries three things:

* the matrix rows of everything the deleted check caught, with their surviving catchers;
* at least one mutant written for the deleted check's own intent, caught by a survivor;
* the cost saved, measured as §3 says.

**Expected outcome, and fine:** a reverted fix is usually caught only by the artifact that
fix added: its inventory row, its `tests/cases` fixture, or its named corpus cell. Reverting
#5120 moved only D3821. Those artifacts are not redundant, and they stay. The three program
corpora are not substitutes for each other either. Verbatim overlap after normalising
comments and whitespace (2026-10-31):

* 195 of 3,527 inventory witnesses are also `tests/cases` fixtures;
* 19 inventory witnesses are also distilled cells;
* 14 `tests/cases` fixtures are also distilled cells.

Redundancy is expected between expensive whole-suite checks and the fixtures, not between
fixtures.

### First reading, 2026-10-31

Measured at `e015395f2` on a 4-core container, about 4 minutes per mutant. Of 52 mutants,
one revert no longer type-checks against the tree, and 51 were graded.

* **22 survive every gate row.** 2 are hand mutants:
  * `escinline`, the escape-inline threshold cut from 320 to 60 bytes;
  * `escv`, a wrong `\v` escape.

  The other 20 are reverts:
  * 13 shipped no test of their own;
  * 4 touched docs or `CHANGELOG.md` only;
  * 3 filed a "must keep running" row whose witness runs either way.

  These are behaviour-neutral refactors or untested fixes. They are not evidence about
  redundancy. The 13 are test gaps, though: a fix whose revert no gate row notices can be
  undone by the next change without a red.
* **29 are caught, 15 of them by exactly one check:**

  | check | sole catches |
  | --- | ---: |
  | corpus oracle | 9 |
  | filed witnesses | 2 |
  | `scaling shape` (`quadfn`) | 1 |
  | `lint-self + fmt` (`fmtw`) | 1 |
  | a release-shape inline test (`escrecord`) | 1 |
  | `vl_diag_span_test.ts` (`whilecond`) | 1 |

* **The expensive checks against mutants aimed at them:**
  * `scaling shape` and the release-shape suites each caught their mutant alone, so they
    earn their place.
  * `rep-fuzz` caught its mutant (`repnulbool`), and so did the corpus oracle. One mutant
    is not enough to delete it.
  * `self-compile pair` caught 3 broad mutants and `distilled corpus` caught 2, every one
    also caught elsewhere. Neither had a mutant aimed at it.
* **The costliest single tests caught nothing here, and their intent lies outside
  `compiler/`:**
  * `vl_seed_gc_headroom_test.ts` (44 s) guards the host's GC policy;
  * `lsp_undisplayable_type_test.ts` (31 s) guards the editor's filter.

  A compiler mutant cannot judge either one. Deciding them needs mutants of the host and
  `lsp/src`.

What this reading supports is that no expensive compiler-facing check is yet shown
redundant. The cheap wins it found were tooling and plain waste (§4).

### The first fold: the editor's corpus sweep, 2026-10-31

`lsp_undisplayable_type_test.ts` asserted, in one serial test, that the editor drops no inlay
hint from a program the checker accepts. It did that by walking all of `tests/cases` and
running a `check` and an `inlayHintsAt` on every file. The `check` half was the corpus
oracle's own walk done again: 10.7 s of the sweep's 24.5 s, measured over 6,417 files. The
assertion now lives in the oracle's walk (`hintsOfCase` in `tests/support/casesWasmOracle.ts`):

* every case the checker accepts gets a symbol check of a fresh staging;
* its entry-module hints are held to the editor's own `isDisplayableType`;
* each shard ends with a test that it saw hints, so the check cannot pass vacuously.

The sweep is deleted. The file's 8 targeted tests stay.

The intent's own mutant is `mutants/inlaynullerr.diff`, in which a nullable inlay type
renders `<error>` in hints only:

| check | before the fold | after the fold |
| --- | --- | --- |
| corpus oracle | 6,600 pass | 1,488 cases fail |
| `lsp_undisplayable_type_test.ts` | the sweep fails | 8 pass |
| the other 37 editor suites | 430 pass | 430 pass |

Before the fold the sweep was the only catcher; after it, the oracle is. Two broader
mutants, an absent element rendering `<error>` and a hole rendering `<?>`, were caught
before and after by the oracle's diagnostic text and by a targeted test.

What it cost and saved, minimum of two runs each, 4 cores:

| | before | after |
| --- | ---: | ---: |
| `gate.sh`'s `lsp suites` row | 17.3 s wall, 33.7 CPU-s | 5.8 s wall, 20.0 CPU-s |
| the corpus oracle | 15.2 s wall, ~51 CPU-s | 17.7 s wall, ~60 CPU-s |

The symbol check per accepted case costs nearly what the sweep's own inlay call did, so the
CPU saved is about 5 s. The wall is what moved: one 24 s serial test became about 2.5 s
spread over the oracle's four shards.

### The host and the optimizer, 2026-10-31

The two places a compiler mutant cannot reach got mutant sets of their own, each run through
every gate row on master `fff449d59`.

**Host GC policy** (`mutants/host/`, applied to `scripts/vl-host/src/main.rs`). These are
outside `run.sh`'s loop, because each needs the host rebuilt into an isolated
`--target-dir` and copied over the worktree's own `target/release/vl` (CLAUDE.md, the
shared cargo target).

| mutant | what it breaks | caught by |
| --- | --- | --- |
| `nogrow` | `SeedGcHeadroom` never grows the heap | `vl_seed_gc_headroom_test.ts`; filed witnesses only by timing out D12131 twice at 120 s |
| `pct99` | the grow threshold 75% → 99% | `vl_seed_gc_headroom_test.ts` alone |
| `offignored` | `VL_COMPILE_GC_GROW=off` is ignored | `vl_seed_gc_headroom_test.ts` alone |
| `statsdead` | the GC stats line is renamed | `vl_seed_gc_headroom_test.ts` alone |

The headroom test is the only guard of the policy, so it stays, made cheaper instead. Its pinned
144 MiB first heap was an engine configuration of its own, so every new seed re-JITted the
compiler (about 13 s) before the test's two checks. It now checks `compiler/emit_base.vl` on
the default heap, whose `.cwasm` is already warm: 4 and 24–26 collections, about 6 s, and all
four mutants above still red it. `ci-native` alone on 4 cores went from 88–94 s to 71 s, and
the whole gate (`GATE_MAX_PAR=3`) from 306 s to 262 s.

**The `-O` inline-record step** (`mutants/opt-*.diff`):

| mutant | what it breaks | caught by |
| --- | --- | --- |
| `opt-noinline` | the step never runs | `selfhost_native_release_inline` (27 tests), `selfhost_native_release_bounds` (8), one release-shape bench row |
| `opt-compwrite` | a write elsewhere in a record's subtyping component no longer refuses it | nothing |
| `opt-ident` | an observable identity (`ref.eq`) no longer refuses a record | nothing |

Turning the whole step off is seen three times. A single eligibility rule broken alone is
seen by nothing; so is `escinline` above. These are coverage gaps or rules a later check
makes unreachable. They are not redundancy, so no release-shape file is deletable on this
evidence.

### The four gaps, resolved

Four mutants survived every row: `escinline`, `opt-ident`, `escv` and `opt-compwrite`. Each
was taken to a fixture or shown to change no behaviour.

| mutant | resolution | sole catcher now |
| --- | --- | --- |
| `escinline` | `tests/fixtures/opt-escape/medium-helper.vl`, a helper body between 60 and 320 bytes | `selfhost_native_release_escape_test.ts`, `medium-helper` (7 of 8 pass under the mutant, 8 of 8 on master) |
| `opt-ident` | `tests/fixtures/opt-inline/kept-identity.vl`. A closure's `==` is VL's one `ref.eq`, and its environment holds the record. | `selfhost_native_release_inline_test.ts`, `kept-identity` (29 of 30 under the mutant, 30 of 30 on master) |
| `escv` | equivalent: the lexer reads `decodeSimpleEscape` only for "is it a known escape", and the decoded value is discarded (the emitter's `decodeStr` makes the bytes, pinned by `escapes.vl`) | none possible |
| `opt-compwrite` | equivalent from VL source: a record with a width subtype is never a leaf candidate (the census skips `kept-subtype`), so the component branch of the write rule is never reached | none possible |

## 3 · Measuring cost

* **CPU seconds, not wall.** A test's wall under `--parallel` is the schedule
  (test-timing-2026-09.md §1). `gate.sh` prints each row's own CPU beside its WALL.
* **One pass is not a reading** (ibid. §2). Quote a minimum of several runs, and name the
  load each number was taken at.
* **CI per-file weights** come from CI logs, as `scripts/ci-shard.sh` says. Deno rounds at
  one second, so they are good for balancing shards and nothing finer.

## 4 · Plain waste comes before redundancy

Some cost needs no matrix: a suite run twice, a seed built twice, serial steps that could run
on separate runners, a stale shard table. Fix these first, because they cost no coverage.

* #5252 re-derived the native shard weights from CI logs. A 26 s test was weighed at 2 on
  the critical path. The slowest native suite step went from 42–45 s to 26 s.
* #5253 put `checks-suites`' editor and oracle steps on two runners: one 54 s job became
  25 s and 34 s.

## 5 · The budget

* **`gate.sh`: ~90 s wall on the owner's 24-thread box** (CLAUDE.md, "Gates"). Measured
  2026-10-12 at 173 s; 2026-10-31 on a 4-core container, 4 m 58 s wall and ~970 CPU-s, with
  `ci-native` 328, `filed witnesses` 205 and `distilled corpus` 96 CPU-s at the top.
* **CI: the critical path behind `seed`.** After #5253 that is about 78 s, on the native
  shard that holds the GC headroom test.

A gate that pushes either past budget is what needs rethinking, not the budget.

### What sets `gate.sh`'s wall, 2026-10-31

Each heavy row was measured alone on a quiet 4-core box with a cold cache. The heavy rows cap
their own parallelism at 4, so these approximate their floors on the 24-thread box:

| phase or row | alone | what bounds it |
| --- | ---: | --- |
| the seed build, before any row | 45–75 s | one self-compile (~27 s), the sidecar warm (~14 s) and the seed's JIT, all serial |
| `ci-native` | 84 s (276 CPU-s) | `DENO_JOBS=4`; its longest file is the 32 s headroom test |
| `filed witnesses` | 65 s (hints kept, outcomes cold) | two chunks: a trap row compiled twice, and five `@@repeat` rows side by side |
| `self-compile pair` | 60 s | two self-compiles in series |
| `scaling shape` | 37 s | |
| `distilled corpus` | 16.5 s | |

The wall is the build plus the slowest row, about 130–160 s here. The owner's box measured 173 s.

* **`filed witnesses`, done.** It did not scale with `JOBS` (87, 86 and 90 s at 4, 8 and 16)
  and kept the box at load ~2. Three changes:
  * a row the codegen batch already failed, or one graded alone by its hint, is no longer
    checked a second time;
  * rows go to chunks round-robin;
  * the known-slow rows are dealt into the first chunks `xargs` starts.

  The result is 65 → 45 s, with verdicts identical over both inventories (4,083 of 4,083) and
  details identical apart from the temp-directory path.
* **Proposal A, the owner's to decide.** Let `gate.sh` default `DENO_JOBS` to `max(4, nproc / 3)`,
  which is unchanged on boxes of 12 or fewer threads. `ci-native` is bounded by its 4 workers,
  not by the box, so on 24 threads this should bring it toward its ~35–45 s file floor. It is
  not measurable on a 4-core box. CLAUDE.md keeps agents at `DENO_JOBS=4`, so it is resource
  policy, not a lane change.
* **B, done.** The gate's build phase is now the self-compile pair, built from the seed on
  disk. When `stage4` equals `names`' plain bytes, `stage4` ships as the seed and the
  `self-compile pair` row grades that pair (`SELF_COMPILE_PAIR`) rather than building its own.
  That is two self-compiles in series where there were three. Anything else falls back to
  `refresh-compiler.sh`. On the 4-core box at `GATE_MAX_PAR=3` the row went from 114.9 s to
  30–33 s and the gate from 279 s to 236 s; `ci-native` still sets the wall.

A new check is held to §1 from the day it lands: say which breakage it catches that nothing else does.
