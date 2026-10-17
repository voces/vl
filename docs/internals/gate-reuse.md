# Gate result reuse

`scripts/gate.sh` reuses a row's previous GREEN result when nothing the row can read has
changed. The mechanism is `scripts/gate-reuse.sh`. This page covers its contract, the split
between a result and the proof behind it, why that split is sound, and the inputs it cannot
see.

## Two keys

A row opts in with `READS="<entries>" run <name> <argv...>`. Two keys are computed for it.

**The result key** says whether the stored result still applies. It is the sha256 of a
manifest holding:

* the row name, its argv (the checkout root spelled `<root>`), and a function row's body;
* `uname -sm`, the sha256 of the host binary (`$VL`) and of the seed (`$SEED`);
* the env vars `VL_*`, `SELFHOST_*`, `LC_ALL`, `LANG` and `TZ`;
* the content of every file under the implicit paths:
  * `std`, `scripts/gate.sh`, `scripts/gate-reuse.sh` and `scripts/compat`;
  * `build/vl-compiler.wasm` and its source-identity sidecar `build/vl-compiler.wasm.src`;
* the content of every file under each `READS` entry, code and data alike.

**The proof key** says whether the row's `READS` has been shown complete. A proof is the
record of one traced run that touched no repo path outside the declaration (see the read check
below). The proof key is the result key's manifest with two changes:

* The seed is left out, and so is the content of the `data:` and `run:` entries.
* Three things are added:
  * the `READS` text itself;
  * `compiler/cli.vl` and `compiler/driver.vl`, the two modules where the seed computes
    every path it asks the host to open;
  * the scan lines described under "Why the split is sound".

So a compiler change misses the result but keeps the proof, and so does an edit to a corpus,
an inventory row or a baseline the row only reads.

## `READS` entries

* `path` is CODE: a file or a directory, hashed recursively, in both keys.
* `data:path` is DATA: hashed into the result key only. Use it for files the row's programs
  check, format or parse, but never execute.
* `run:path` is DATA THE ROW EXECUTES, such as witnesses, probes or corpus cells. It is
  hashed into the result key, and its files that can touch the filesystem are hashed into
  the proof key (see `capable` below).
* `!path` excludes a row's own output under a declared directory.
* `@dir` keys only the directory's entry names. It covers a row that lists `dir` and reads
  only children it declares by name.

A code entry and a data entry may overlap. `run:scripts/silent-sweep/distilled` and the code
entry `scripts/silent-sweep/distilled/regress.vl` is one example.

A directory symlink inside the repo (`node_modules`, `scripts/vl-host/target`) is not walked
when its parent is hashed. A read under it is covered only by a declaration at or below the
link.

The store is `~/.cache/vl-gate/` (`GATE_REUSE_DIR` moves it). It lives outside every tree,
so the merge queue's audit trees and a builder's worktree share it. A result lives in
`<key>/`. A proof lives in `proof/<pkey>/`, which holds the proof manifest and the
outside-the-repo reads of the run that made it.

## A row, start to finish

1. **Result hit.** The row is not run. Its stored log is printed, and the report line reads
   `ok (reused <key>)`.
2. **Miss with a proof.** This covers a proof under the current proof key that is younger
   than `GATE_REUSE_PROOF_DAYS` (7 by default) and whose outside reads are unchanged. The row
   runs with no trace, and a green result is stored under its result key together with the
   proof's outside reads. The report reads `ok (miss, proven <pkey>)`.
3. **Miss with no proof.** The row runs under the read check. A green run with a clean audit
   stores both the result and the proof. The report reads `ok (miss, traced)`.

`GATE_REUSE_VERIFY=1` takes step 3 for every row, hits included. A row whose stored result is
green and whose fresh run is red then fails with `VERIFY FAILED`. `GATE_REUSE=0` turns reuse
off.

## The read check

A traced run follows every process with `strace -f`. It records every open, stat, access,
readlink, exec, mkdir, chdir and fork, resolved against each process's cwd and dirfd.

* A green row that touched a repo path its declaration does not cover is RED with rc 96. The
  log names each path.
* A green row with a clean audit is stored only if re-keying the tree after the run gives the
  same result key and the same proof key. A different key means a declared input changed
  while the row ran.
* A red row is never stored.

Each outside-the-repo file the row read or executed (tools, shared libraries, locale data) is
stored with its sha256. Each outside path it probed and did not find (PATH lookups) is stored
as absent, and an outside directory it opened as present. Every hit and every use of a proof
re-checks each entry, so a new `deno`, `strace` or libc on PATH is a miss and then a trace.
`/proc`, `/sys`, `/dev`, `/run`, `/tmp`, `$TMPDIR`, the store and `~/.cache/vl/modules` are
exempt.

## Why the split is sound

A proof says: with this code, this host and this std, the row opens only declared paths. An
untraced run under that proof is sound when nothing outside the proof key can make the row
open a repo path it did not open before.

A missed new read is not, on its own, a wrong result. Two things must both happen:

1. the row starts reading an undeclared path in an untraced run;
2. that path later changes while nothing in the result key does.

Only then is a stale result reused. Each change that can cause step 1 without moving the
proof key is listed below with what bounds it.

### Bounded by the key

* **The host binary.** Every open request is served by the host (`read_module_key`, the
  CLI's file commands), and its sha256 is in the proof key. None of master's last 40 commits
  touched `scripts/vl-host/src`.
* **std.** A std module can open files when a script calls it, and `std/` is in the proof
  key. It had 0 commits in the last 40.
* **The seed's own path requests.** The seed asks the host to open a file in only two ways:
  * a CLI command's path (`CMD_READ_FILE`, `CMD_LIST_DIR`, `CMD_WRITE_FILE`, set through
    `cliCmdPath` in `compiler/cli.vl`);
  * a module key from import resolution (`modResolveSpecifier` and the loader in
    `compiler/driver.vl`).

  Both files are in the proof key. They had 3 of the 31 compiler commits in the last 40.
* **A row's own code.** Its scripts, shell wrappers and the libraries they import are code
  entries. So is any baseline that names paths the row opens; lint-self's budget baselines
  name their `targets` this way.
* **An executed data file gaining file access** (scan line `capable <file> <sha>`). Every
  file under a `run:` entry that names `std:fs`, `std:process` or a raw `__fs_*` / `__proc_*`
  import is hashed into the proof key. Such a file can open any path. Today that is 5
  inventory rows and 3 files under `scripts/silent-sweep/distilled`. A witness that newly
  imports `std:fs` moves the proof and is traced.
* **A data file naming a path outside the declaration** (scan line `escape <file> <string>`).
  Import resolution accepts only `std:` and relative specifiers, and refuses bare and
  absolute ones. So a module checked as data can reach outside its directory only through a
  `..` segment. The same goes for a probe or cell name that a script joins to its base
  directory. Every quoted string in a `data:` or `run:` entry with a `..` segment is
  resolved against its own file's directory. One that lands outside every declared path is a
  line in the proof key. This is conservative: a string a script joins to a deeper base, or a
  witness the grader copies to a temp dir, resolves no further outside than it does here. The
  scan runs over every data entry in under 0.1 s.

### Not bounded by the key

* **A compiler change outside `cli.vl` and `driver.vl` that changes which paths reach them.**
  Examples: a parser change to how an import specifier is read, or a miscompile of the string
  code that builds a path. That changes the seed, which is deliberately not in the proof key.
  Keying it would make every compiler PR trace (31 of the last 40 commits). The bounds are
  in time and process:
  * a proof expires after `GATE_REUSE_PROOF_DAYS`;
  * any change to a proof input traces again (7 of the last 40 commits did);
  * `GATE_REUSE_VERIFY=1` re-proves on demand.
* **Data steering a row's code onto a branch the proof run did not take.** A trace proves only
  the paths opened on the run it watched. A data edit can send the same code down another
  branch that opens a literal path from that code. Only an undeclared literal path matters
  here, and none of the rows has a way to find one statically: `scripts/lib` holds 20-odd
  repo-path literals that no single row uses. The bounds are the same as above. The miss also
  needs step 2: that path must later change while every declared input stays the same.
* **A `..` built from parts** (`".." + "/"`), or a path string in a data file that is not
  quoted. The `escape` scan sees only a literal quoted `..`. No data file in the tree builds
  one today, and a code entry that starts doing so is itself a proof-key change.

An untraced run also does not record outside reads. It inherits the proof's list, which every
later hit re-checks. A seed change that makes the row read a new outside file is the first
case above.

## What is cached

Only rows whose inputs are a closed set of repo paths are keyed. Each keyed row's `READS` is
beside it in `gate.sh`.

| row | code | data | run |
| --- | --- | --- | --- |
| lint-self + fmt | the script, its filter, 5 budget baselines | compiler, scripts, tests/{cases,fixtures,support}, bench | — |
| plumb-shape cost | the script, `scripts/lib`, `scripts/perf` | its baseline | — |
| rep-fuzz | the script and its 2 generators | its baseline | — |
| mono-tyaram-grid | the script and its cells | — | — |
| filed witnesses | the grader, `scripts/lib` | compiler | both inventories |
| capability probes | the runner, `scripts/lib` | compiler | `scripts/capability-probes` |
| distilled corpus | `regress.vl`, `scripts/lib` | — | `scripts/silent-sweep/distilled` |

These rows are left uncached:

* The Deno rows (`deno task test`, ci-native, the lsp suites, typecheck and lint, `deno lint`,
  scaling shape, inventory refs). Their inputs include the Deno module cache, npm, V8 and
  tests that spawn arbitrary processes. Some also read most of `tests/`.
* The self-compile pair (the fixpoint, the L2 fuel tripwire and the survey profile). Its
  survey half reads nearly the whole tree, so it would miss on almost every PR.
* The rows under two CPU-seconds. A key costs about as much as they do.
* Rows that read git state (no-python, baseline freshness).

### No keyed row is independent of the seed

A compiler PR changes the seed, so all seven rows miss on it unless the seed comes out
byte-identical. That is 31 of master's last 40 commits. No row's result can drop the seed
from its key:

* Every row runs the seed. lint-self runs `vl check` and `vl fmt`, rep-fuzz and mono compile
  their generated programs, plumb measures the fuel of a build, and the other three run
  `--compiler "$SEED"`.
* filed witnesses also reads `compiler/*.vl` as data. It compares their FNV hash with
  `build/vl-compiler.wasm.src` to refuse a stale seed. That sidecar was exempt from the read
  check and unkeyed before this change; it is now an implicit result input.
* capability probes reads `compiler/*.vl` to check that each live-site literal still exists.

So on a compiler PR the saving comes from the proof, which turns the miss from traced into
plain, and not from a hit.

## Inputs that cannot be declared

A stale pass is ruled out only for inputs the keys or the read check can see. These cannot be
seen:

* Reads through `mmap` of an already-open fd, or through an fd inherited from the gate. The
  trace sees the open, not the bytes.
* A directory LISTED outside the repo. Only files and probes outside the repo are recorded.
* Env vars outside the keyed set. A row that depends on another variable must add it to
  `reuse_common`.
* The CPU model and its features. Only `uname -sm` is keyed. A row whose result depends on
  timing reuses a result measured on another load. That is why scaling shape is uncached.
  plumb-shape cost is keyed only because its fuel half is a count and its RSS half is graded
  against a ratio.
* The network. No keyed row uses it.
* The rest of `build/`. The host lists it only to prune stale `.cwasm` sidecars of the seed,
  so the read check allows that listing without keying the directory.

Reuse needs strace, so it is off on macOS (vidi) and wherever ptrace is denied. The gate
prints which case applies on its `== result reuse:` line. CI does not run `gate.sh`.

## Measured, 2026-10-17

All numbers are CPU seconds (user + sys) of the row's own process tree, on the 24-thread WSL
box. The box was heavily loaded throughout (load average 22 to 84, from concurrent agents), so
read each pair as a same-moment comparison, not as an absolute cost. The `escape` scan was
widened from `../` to any `..` after these runs. That changes every key and no cost.

**A miss with a proof is a plain run.** Each row was run plain and then, right after, as a
proven miss (result deleted, proof kept):

| row | plain | proven miss |
| --- | ---: | ---: |
| mono-tyaram-grid | 13.9 | 14.0 |
| capability probes | 13.6 | 9.6 |
| plumb-shape cost | 34.1 | 30.4 |
| rep-fuzz | 23.6 | 23.3 |
| lint-self + fmt | 22.8 | 26.4 |
| distilled corpus | 185.3 | 96.8 |
| filed witnesses | 309.0 | 278.7 |
| **total** | **602.3** | **479.2** |

The differences are load noise in both directions. The bookkeeping itself is the two keys and
the scan, 0.14 to 0.24 s a row, plus storing the result.

**A traced miss** (`GATE_REUSE_VERIFY=1`), paired the same way:

| row | plain | traced |
| --- | ---: | ---: |
| mono-tyaram-grid | 10.5 | 31.3 |
| capability probes | 7.4 | 13.6 |
| plumb-shape cost | 42.1 | 46.8 |
| rep-fuzz | 75.8 | 49.0 |
| lint-self + fmt | 29.3 | 37.4 |
| distilled corpus | 175.4 | 119.3 |
| filed witnesses | 258.6 | 395.0 |
| **total** | **599.1** | **692.4** |

The tracing cost over all seven rows was +93 here and +308 in an earlier pair. Under the
heaviest load (the first gate run, empty store) it was larger still.

**All seven rows hit:** 3.1 CPU-s and 2.3 s wall in total, 0.3 to 0.7 a row.

**Two full gate runs.** The first, from an empty store, traced every keyed row and stored five
proofs. The second, on a fresh fixpoint seed, passed every gate in 241 s wall and about
2,570 CPU-s for the whole gate. In it five rows ran as proven misses (plumb 49.7, rep-fuzz
33.5, mono 14.4, probes 17.8, distilled 164.5) and two traced (lint-self 45.6, witnesses 424.9),
because their `READS` had been edited between the runs.

### Expected change per audit

Over master's last 40 commits, mapped onto the keys path by path:

* 31 change the seed. Every keyed row misses. Each miss is plain, so these audits cost the
  same as with no reuse.
* 9 do not. On those, the rows that would have run cost 253 CPU-s on average against 709
  with no reuse. Two of the 9 edited `gate.sh` and missed everything; three hit everything.
* 7 changed a proof input and pay one traced miss, five of them over all seven rows and two
  over one row.
* Every audit pays the bookkeeping, about 3 CPU-s.

At that 78/22 mix, the saving is 9 × 456 = 4,100 CPU-s per 40 audits. The cost is 7 traced
misses, 600 to 1,700 CPU-s, plus 120 CPU-s of bookkeeping. **The net is −57 to −84 CPU-s per
audit against no reuse**, 2 to 3% of the gate's about 2,570.

The first version of this change traced every miss, so every seed change paid the tracing
cost, +16 to +51% of 709. That comes to −6 to +210 CPU-s per audit: on this mix it saved
nothing, and at the upper reading it cost more than the gate without reuse.
