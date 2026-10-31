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
  deletion, even though each fixture is unique.

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

A gate that pushes either past budget is what needs rethinking, not the budget. A new check
is held to §1 from the day it lands: say which breakage it catches that nothing else does.
