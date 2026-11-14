# The proof sweep — `scripts/sweep.vl`

A refactor proves itself by showing what it moved. The sweep records what one seed does with
every program of a fixed population, then compares two recordings program by program.

## The population

About 23,600 programs, all read from the working tree:

* **`cases`**: every `tests/cases/**/*.vl` that claims a tier. The tiers are the ones
  `tests/selfhost_native_align_test.ts` reads from a file's directives. `@run`, `@log` or `@trap`
  means the program is checked and then run. `@error`, `@emit-error`, `@no-instantiate`, `@check`,
  `@warning`, `@hint` or `@info` means it is only checked, with `--codegen`. A file with no
  directive is a module part and is skipped.
* **`distilled`**: every cell of `scripts/silent-sweep/distilled/cells/` and `named/`. Each one is run.
* **`inventory`**: the witness of every row in `docs/internals/inventory/` and
  `docs/internals/inventory-2/`, when it is one file that names no relative import and no
  `@@repeat`. Each one is run, as `check-filed-witnesses.vl` runs it. The row grammar is the
  shared one in `scripts/lib/inventory.vl`. A witness's key is `<row file>#<id>`.

## A recording

A recording is one JSON object per line, sorted by `cell` (the program's path or key). It has
these fields:

| field | meaning |
| --- | --- |
| `outcome` | one of `runs`, `check_clean` (a check-only program that compiled), `check_reject`, `emit_reject`, `invalid_wasm`, `trap`, `run_error`, `compiler_trap`, `timeout` |
| `exit` | the exit code of the last stage that ran. A failed case in a batch run reads 1. |
| `stdout` | the first 16 hex digits of the sha256 of what the program printed, or `""` when it did not run |
| `msg` | the first error, normalised as `regress.vl` normalises one (offsets, function indices and source positions erased). For a failed run it is the line under `Caused by:`, so a backtrace's mangled names do not count. |
| `module` | the first 16 hex digits of the sha256 of the module `vl check --codegen` kept, or `""` |
| `said` | on a `trap` line only: the last line the program printed, where a `__trap__` puts its sentence. Only the owed check reads it. |

Programs are graded in chunks of 100. For each chunk the tool runs one
`vl check --batch --json --codegen` and one `vl run --batch` of the modules the check kept,
`$JOBS` chunks at a time (default 4). A program that either batch leaves unanswered is graded
alone, for example one that calls `exit`.

## Commands

Run every command from the checkout root:

```sh
# one seed, the whole population (or --population cases|distilled|inventory)
vl run scripts/sweep.vl -- record --compiler <seed.wasm> --out base.jsonl [--std <dir>] [--vl <bin>]

# a deterministic shard: n shards cover the population exactly once
vl run scripts/sweep.vl -- record --compiler <seed.wasm> --shard 3/8 --out base-3.jsonl
vl run scripts/sweep.vl -- merge --out base.jsonl base-*.jsonl   # refuses a gap or an overlap

vl run scripts/sweep.vl -- diff base.jsonl cand.jsonl

# the population itself, `<key>\t<file>\t<run>` per program, witnesses written (for another grader)
vl run scripts/sweep.vl -- list [--population P] [--shard K/N]
```

`--std` is the `std/` the programs compile against (default `./std`). `--vl` is the host binary
that compiles them (default `$VL`, else the checkout's). Give each side its own std, so that a
candidate which changes std is measured with it. The sweep tool itself is always built with
`build/vl-compiler.wasm` (override with `$SWEEP_TOOL_COMPILER`).

`diff` prints these counts: same, bytes-only movers (module hash changed, nothing else changed),
output movers (outcome, exit, stdout or message changed), `runs → not-runs`, new compiler traps,
and programs recorded on one side only. It lists every output mover and every `runs → not-runs`
by key, then the first 20 bytes-only movers. It **exits 1** on any `runs → not-runs` or new
compiler trap, and exits 0 otherwise. Every other movement is printed for a person to read.

## Owed refusals

A clause-1 fix can turn a program that ran WRONG into an outcome the design owes: its witness
was check-clean and printed a wrong answer, and the fix refuses it at check, or makes it stop at
the run-time error the design gives it (a read before the first write traps and names the
binding, spec S3.2). That is a `runs → not-runs`, and the one the veto allows. The PR that earns
it lists the cell in `scripts/sweep-owed.txt`, one line each, naming the outcome:

```text
docs/internals/inventory/D16044.md#D16044 D16044
docs/internals/inventory/D16023.md#D16023 D16023 trap: read before it is assigned
```

`diff` then accepts that cell's `runs → not-runs` only when **all** of these hold:

* the new outcome is the listed one. A line with no `trap:` allows only `check_reject`. A line
  with `trap: <sentence>` allows only a `trap` that is a `__trap__` (its message is the wasm
  `unreachable` it lowers to) and whose last printed line (`said`) contains the sentence. A trap
  with another sentence or none, any other wasm trap, an emit refusal or any other outcome still
  blocks, since a trap is also what a compiler defect looks like;
* the cited row exists in `docs/internals/inventory/` or `inventory-2/`, and its status line says
  `clause 1`;
* the entry is used. A listed key that did not move from `runs` to its listed outcome fails as
  stale, so the list cannot rot. A key the base already has at that outcome is inert: the fix has
  merged, and the entry waits for the fold without failing other PRs' diffs.

An entry lives only in the PR that earns it, and the orchestrator clears the file at each fold.
`diff` prints the accepted cells under "owed refusals accepted", and `--owed <file>` reads
another list (the test's). Keep the `sweep` label on such a PR: removing it would turn the gate
green the same way an admin merge does.

A local proof against master looks like this:

```sh
b=.claude/worktrees/base
git worktree add "$b" origin/master
ln -s "$PWD/scripts/vl-host/target" "$b/scripts/vl-host/target"
mkdir -p "$b/build" && cp build/vl-compiler.wasm "$b/build/"
(cd "$b" && scripts/refresh-compiler.sh --prove-fixpoint)
vl run scripts/sweep.vl -- record --compiler "$b/build/vl-compiler.wasm" --std "$b/std" --out "$TMPDIR/base.jsonl"
vl run scripts/sweep.vl -- record --compiler build/vl-compiler.wasm --out "$TMPDIR/cand.jsonl"
vl run scripts/sweep.vl -- diff "$TMPDIR/base.jsonl" "$TMPDIR/cand.jsonl"
git worktree remove --force "$b"
```

Use fixpoint seeds on both sides (CLAUDE.md, "A cost regression shows up one bootstrap step
late"). On a 4-core box, the whole population takes about 60 s per side when the module cache is
warm, and about 100 s when it is cold. Each base seed costs about 70 s more. Witnesses are
written to `build/sweep/witnesses/`, a fixed path inside the checkout. A module records the path
of a source file that lies outside any project root, so a temporary directory would give the
same program different bytes on every run.

## In CI

`.github/workflows/sweep.yml` runs the same sweep without using your CPU:

* **On a pull request with the `sweep` label.** It re-runs on every push while the label is
  on. The base is the merge-base with the PR's base branch.
* **By hand:** `gh workflow run sweep.yml -f base_ref=master -f head_ref=<branch or sha>`.

The workflow builds each side's fixpoint seed, reusing ci.yml's caches. It records 8 shards per
side on 16 runners, merges and diffs them, and writes the diff to the job summary. A base
recording is kept for 7 days as artifact `sweep-base-<key>`; a later run whose key matches (same
base commit, head population, head-built sweep tool and workflow file, listed in the `base-cache`
job) restores it and records only the head side; `diff` reads it unchanged. Artifact
`sweep-result` holds both merged recordings, so you can re-diff them locally. The run fails
when `diff` does. The population and the tool come from the head commit.

Every pull_request run ends in `sweep-gate`, the status branch protection requires. Without the
label it passes at once; with it, it passes only if `diff` succeeded (a cancelled sweep fails it).
Adding the label re-runs the workflow (`labeled`), and removing it re-runs it green.
