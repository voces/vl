# Gate result reuse

`scripts/gate.sh` reuses a row's previous GREEN result when nothing the row can read has
changed. The mechanism is `scripts/gate-reuse.sh`; this page is its contract and the inputs it
cannot see.

## The key

A row opts in with `READS="<paths>" run <name> <argv...>`. Its key is the sha256 of a manifest
holding:

* the row name, its argv (the checkout root spelled `<root>`), and a function row's body;
* `uname -sm`, the sha256 of the host binary (`$VL`) and of the seed (`$SEED`);
* the env vars `VL_*`, `SELFHOST_*`, `LC_ALL`, `LANG` and `TZ`;
* the content of every file under the implicit paths (`std`, `scripts/gate.sh`,
  `scripts/gate-reuse.sh`, `scripts/compat`, `build/vl-compiler.wasm`) and under each entry of
  `READS`.

A `READS` entry is one of three forms:

* `path` is a file or a directory, and a directory is hashed recursively;
* `!path` excludes a row's own output under a declared directory;
* `@dir` keys only the directory's entry names. It covers a row that lists `dir` and reads
  only children it declares by name.

A directory symlink inside the repo (`node_modules`, `scripts/vl-host/target`) is not walked
when its parent is hashed. A read under it is covered only by a declaration at or below the
link.

The store is `~/.cache/vl-gate/<key>/` (`GATE_REUSE_DIR` moves it). It lives outside every
tree, so the merge queue's audit trees and a builder's worktree share it.

## The read check

A miss runs the row under `strace -f`. The trace covers every open, stat, access, readlink,
exec, mkdir, chdir and fork, and is resolved against each process's cwd and dirfd.

* A green row that touched a repo path its declaration does not cover is RED with rc 96, and
  the log names each path. So a declaration cannot go stale silently: the next miss after a
  row starts reading a new file is red.
* A green row with a clean audit is stored, unless re-keying the tree after the run gives a
  different key. That happens when a declared input changed while the row ran.
* A red row is never stored.

Each outside-the-repo file the row read or executed (tools, shared libraries, locale data) is
stored with its sha256. Each outside path it probed and did not find (PATH lookups) is stored
as absent, and an outside directory it opened as present. A hit re-checks every entry, so a new
`deno`, `strace` or libc on PATH is a miss.
`/proc`, `/sys`, `/dev`, `/run`, `/tmp`, `$TMPDIR`, the store and `~/.cache/vl/modules` are
exempt.

`GATE_REUSE_VERIFY=1` re-runs every hit under the check. A row whose stored result is green
and whose fresh run is red fails with `VERIFY FAILED`. `GATE_REUSE=0` turns reuse off.

## What is cached

Only rows whose inputs are a closed set of repo paths are keyed. Each keyed row's `READS` is
beside it in `gate.sh`. They are lint-self + fmt, plumb-shape cost, rep-fuzz, mono-tyaram
grid, filed witnesses, capability probes and the distilled corpus.

These rows are left uncached:

* The Deno rows (`deno task test`, ci-native, the lsp suites, typecheck and lint, `deno lint`,
  scaling shape, inventory refs). Their inputs include the Deno module cache, npm, V8 and
  tests that spawn arbitrary processes. Some also read most of `tests/`.
* The self-compile pair (the fixpoint, the L2 fuel tripwire and the survey profile). Its
  survey half reads nearly the whole tree, so it would miss on almost every PR.
* The rows under two CPU-seconds. A key costs about as much as they do.
* Rows that read git state (no-python, baseline freshness).

## Inputs that cannot be declared

A stale pass is ruled out only for inputs the key or the read check can see. These cannot be
seen:

* Reads through `mmap` of an already-open fd, or through an fd inherited from the gate. The
  trace sees the open, not the bytes.
* A directory LISTED outside the repo. Only files and probes outside the repo are recorded.
* Env vars outside the keyed set. A row that depends on another variable must add it to
  `reuse_manifest`.
* The CPU model and its features. Only `uname -sm` is keyed. A row whose result depends on
  timing reuses a result measured on another load. That is why scaling shape is uncached, and
  plumb-shape cost is keyed only because its fuel half is a count and its RSS half is graded
  against a ratio.
* The network. No keyed row uses it.
* The rest of `build/`. The host lists it only to prune stale `.cwasm` sidecars of the seed,
  so the read check allows that listing without keying the directory.

Reuse needs strace, so it is off on macOS (vidi) and wherever ptrace is denied. The gate
prints which case applies on its `== result reuse:` line. CI does not run `gate.sh`.

## Measured, 2026-10-17

Measured at 3f6a785db on the 24-thread WSL box under load, CPU = user+sys per row. At that
commit native fixpoint and self-compile time were keyed rows of their own; #3954 has since
folded them into the uncached self-compile pair, so they are listed apart below the total.

| row | no reuse | miss (traced) | hit |
| --- | ---: | ---: | ---: |
| lint-self + fmt | 39.5 | 46.0 | ~0 |
| plumb-shape cost | 54.7 | 53.5 | ~0 |
| rep-fuzz | 55.2 | 101.9 | ~0 |
| mono-tyaram-grid | 15.3 | 24.6 | ~0 |
| filed witnesses | 372.3 | 473.1 | ~0 |
| capability probes | 11.7 | 14.4 | ~0 |
| distilled corpus | 160.0 | 302.9 | ~0 |
| **seven keyed rows** | **708.7** | **1016.4** | **<3.6** |
| (native fixpoint, before #3954) | 113.0 | 112.0 | ~0 |
| (self-compile time, before #3954) | 92.9 | 40.5 | ~0 |

The whole gate read 2,961 CPU-s without reuse, so a run where the seven rows hit costs about
2,253. A miss pays the trace, mostly in `sys` for rows that start many processes: +308 CPU-s
over the seven rows. The hit figure is the measured total for all nine rows at that commit
(0.50 s wall, 2.48 user + 1.08 sys).
