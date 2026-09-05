# `vl` CLI design — the brain is VL, the host is a pump

The native `vl` tool (`build`/`check`/`run`/`fmt`/`test`) follows the same
charter as the compiler and the test runner (`docs/internals/test-runner-design.md`):

> **The brain is VL; Rust is the mechanism pump.** The Rust host owns only the
> mechanism the wasm capability model cannot express, exposed as RAW primitives,
> never policy. The walk recursion, skip lists, glob matching, diagnostic
> formatting, severity gating, and fix application are VL code.

This matters because the Rust host is scheduled to shrink to a thin WASI shim and
then become optional (ROADMAP H-M2). Policy written in Rust dies with it; policy
written in VL survives the WASI transition unchanged — `listDir` becomes
`fd_readdir`, `readFile` becomes `path_open`+`fd_read`, and the VL code that
consumes them does not move.

A first cut of `check`/`fmt` put policy (glob matcher, dir walk, the
pretty/concise diagnostic formatter, severity gating) in the Rust host. This doc
specifies the protocol that moves it into VL, and the migration that retires the
host-side policy.

## What stays host, what moves to VL

**Host (raw mechanism only):**

- `listDir(path)` → entries `(name, isDir)` — one directory, no recursion, no
  skip-list, no glob (those are VL).
- `readFile(path)` → bytes / not-found.
- `writeFile(path, bytes)`.
- stdout / stderr line sinks; the process exit code.
- argv (passed through verbatim).
- wasm instantiation + execution + trap catching (for `vl run` — a capability VL
  cannot express), and the binaryen shell-outs (`wasm-opt` / `wasm-dis` for `-O` /
  `--wat` — external processes).

**VL (all policy):** argv interpretation, the directory walk (recursion +
`SKIP_DIRS` + `--exclude`/`--ignore` glob matching), running the checker
(`check`/`lint`/`format` — already VL, called directly in-module), diagnostic
formatting (concise + pretty/caret, severity ordering, the display floor and the
exit gate), `--fix` edit computation + application, the summary line, and the
exit-code decision.

`run` and `build` keep their host mechanism (execute wasm / shell binaryen) but
their *policy* (arg parsing, which file, output framing) is VL on the same
protocol; the host only performs the capability step the VL program asks for.

## The command-queue protocol

Identical in shape to the H3 module-fetch loop and the test runner: **the linker
stays EMPTY (no host-function imports)**. The VL program is a state machine over
its own globals; the host pumps it, executes the raw command it asks for, commits
the result back, and loops. Nothing in VL blocks on I/O — each `cliNext()` returns
the next command the program needs, the host satisfies it, and the next
`cliNext()` resumes from the program's explicit state (a work-stack of pending
directories/files, the accumulated diagnostics, the output buffer).

### Exports (driver / `cli.vl`)

```
// Argv — the host pushes each argument before the run loop.
cliArgReset()
cliArgPush(cp: i32)        // one code point
cliArgCommit()             // end the current argument

// The run loop — the host calls cliNext() until it returns CMD_DONE.
cliNext() -> i32           // a CMD_* code; advances the state machine

// Payload of the CURRENT command (valid until the next cliNext()):
cliCmdPathLen() / cliCmdPathAt(j)      // LIST_DIR / READ_FILE / WRITE_FILE path
cliCmdDataLen() / cliCmdDataAt(j)      // WRITE_FILE / PRINT_* payload (code points)
cliCmdDataStore(off, count) -> written // …and its BULK twin (see below)

// Commit the host's result for the current command:
cliDirEntryPush(namePush…, isDir: i32) // one entry of a LIST_DIR result
cliDirCommit()                         // end the directory listing
cliFileCommit(found: i32, dataPush…)   // READ_FILE result (found=0 ⇒ missing)
cliWriteCommit()                       // WRITE_FILE acknowledged

// After CMD_DONE:
cliExitCode() -> i32
```

(`namePush…` / `dataPush…` mirror the existing per-code-point push idiom —
`modKeyPush` / `srcPush` — so the host streams strings the same way it already
does.)

**File CONTENT rides a bulk path** (`perf-program.md` §6). `CMD_READ_FILE`'s
result is the only payload on this protocol big enough to matter — every `.vl`
file `vl check` / `vl fmt` / `vl test` reads arrives through it — so alongside
`cliResultPush(cp)` the driver exports

```
cliResultLoad(count: i32)   // append the `count` UTF-32LE code points the host
                            // wrote at byte 0 of the module's exported linear
                            // memory (`memory`, probed by the host as `ioMem`
                            // then `memory`); `compiler/driver.vl`'s `srcLoad`
                            // header owns the protocol
```

The two are alternatives, not a sequence: the host uses `cliResultLoad` when the
module exports it AND a memory, and falls back to `cliResultPush` per code point
otherwise, so an old seed and an old host both keep working.

**The host-BOUND payload rides one too** (`perf-program.md` §7). `cliCmdData` is
where a whole formatted file leaves the module — `vl fmt compiler` moved
**4,520,527 code points, one host call each, 87 ms** — so alongside
`cliCmdDataAt(j)` the driver exports

```
cliCmdDataStore(off: i32, count: i32) -> written
                            // write `written` = min(count, cliCmdDataLen() - off)
                            // UTF-32LE code points at byte 0 of the module's
                            // exported linear memory, starting from `off`, and
                            // return the count; `compiler/driver.vl`'s
                            // `rbyteStore` header owns the OUT protocol
```

Same presence probe, same both-directions fallback, and the same window
(`ioMem`, then `memory`) as the intake half — the host's `StrOut` chunks at
`memory_size / 4` = 16,384 code points and copies each chunk out in one read. A
return of 0, a negative, or more than `count` FAILS the read rather than being
retried: re-asking from the same offset is an infinite loop.

**`cliCmdPath` deliberately has no `Store` twin.** It carries one path — tens of
code points, 0 ms at every volume measured — and leaving it on the per-code-point
accessor keeps the host's presence probe exercised in production, on every
`vl check`, instead of only against an old seed. Argv and directory entries stay
per-code-point for the same reason.

### Command codes

```
CMD_DONE       0   // the program is finished; read cliExitCode()
CMD_LIST_DIR   1   // list cliCmdPath(); commit entries via cliDirEntryPush + cliDirCommit
CMD_READ_FILE  2   // read cliCmdPath(); commit via cliFileCommit(found, data)
CMD_WRITE_FILE 3   // write cliCmdData() to cliCmdPath(); commit via cliWriteCommit
CMD_PRINT_OUT  4   // write cliCmdData() (+ newline) to stdout; no commit
CMD_PRINT_ERR  5   // write cliCmdData() (+ newline) to stderr; no commit
CMD_READ_STDIN 6   // slurp stdin; commit via cliFileCommit(found, data)
CMD_TEST_*   7-9   // see `test` below
CMD_VALIDATE  10   // validate the module now in rbyte*; commit via cliValidateCommit(ok)
```

### The host↔seed ABI generation

The seed exports `hostAbi()` (`compiler/driver.vl`) and a `vl` binary carries a
matching `HOST_ABI`. **They are compared with `==`, and a mismatch is a hard error**
— the same posture as a missing `wasm-opt`, and for the same reason: the two
artifacts do not fail loudly when they disagree, they produce **wrong output at a
successful exit code**.

| generation | contract |
| --- | --- |
| 1 | strings are UTF-32 code points (pre-#1848) |
| 2 | strings are UTF-8 bytes |

The number covers the **guest→host string element unit**, the **bulk `Load`/`Store`
packing** over the staging window, and the **`CMD_*` table above**. Bump it in the
same commit that changes any of them, in all three places (`hostAbi()`, `HOST_ABI`,
and `EXPECTED_ABI` in `tests/vl_seed_abi_test.ts`).

**What went wrong without it.** #1848 flipped the string element unit while adding,
removing and re-typing nothing — so every export probe still succeeded, the ABI
negotiation reported "compatible", and the host read `4 * count` bytes where the
seed wrote `count`. The overshoot landed in the host's own leftover UTF-32 image of
the last file it staged, which decoded perfectly, so a stale `vl test` printed
readable chunks of `std/test.vl` and exited 0. `resolve_compiler` used to prefer a
**CWD-relative** `./build/vl-compiler.wasm` over the binary's own embedded seed, so
a released `vl` run inside a checkout picked up whatever was on disk — see
[Where a `vl` binary finds std and its seed](#where-a-vl-binary-finds-std-and-its-seed),
which is the rule that replaced it (D1574).

Only the string channel was silent. `CMD_VALIDATE = 10` was already loud on an old
host, whose dispatch bails on an unknown code — the string path is quiet precisely
because it was designed for graceful probing.

**A seed exporting nothing here predates the stamp**, which is the exact vintage
that produces the bug, so absent counts as a mismatch rather than a pass.

#### The generation gap took the seed-publish pipeline down (2026-08-25)

Recorded because it is the ask's own bug, happening to the project's own release
pipeline, and because the workflow's comments asserted it could not.

`seed-latest` is pinned at **`a45c4843`** — the commit immediately BEFORE #1848, so
it speaks **generation 1** while every current `vl` binary speaks generation 2.
`publish-seed.yml` bootstraps by self-compiling current source with that seed:

```
$ vl check x.vl --compiler <released seed-latest>
[^@^@^@H^@^@^@I^@^@^@N^@^@^@T^@^@^@]^@^@^@:^@^@^@ ...
```

Raw UTF-32LE, at exit 0. Reproduced directly, not inferred.

**The fixpoint does not catch it, and the workflow said it would.** Its comment read
*"the fixpoint step re-proves it regardless, so a cache hit never weakens the gate."*
The corruption is SELF-CONSISTENT — stage1 is built with mangled string literals,
stage2 and stage3 inherit them, and `stage3 == stage4` holds byte-for-byte over a
compiler that miscompiles. This is precisely the "fixpointing-but-miscompiling seed"
the corpus-oracle gate was added to backstop, and **the oracle is doing its job**:
every `publish-seed` run since #1848 has failed there, on `@hint`/`@error` cases whose
expected text contains an em dash (U+2014 arriving as its low byte, 0x14).

**Why it could not self-heal — and it was not what it looked like.** Both inputs were
generation 1: the warm path replayed the workflow's own cached seed and the cold path
fetched `seed-latest`. But the reason the cache never refreshed is that **the two
workflows keyed the same artifact into different namespaces** — `publish-seed` on
`vl-seed-`, `ci` on `vl-seedpair-`, over the identical `hashFiles('compiler/*.vl')`
input. Nothing but `publish-seed` ever wrote a `vl-seed-` entry, and it only writes one
when it SUCCEEDS, so a single failure froze the namespace at 2026-08-23 21:01 and every
later run restored that same frozen entry by restore-key.

Meanwhile `ci.yml` was passing **this very same corpus oracle on the very same commits**
off its own healthy `vl-seedpair-` entry. The source was never sick; only this job's
bootstrap input was, and the two jobs could not see each other's seeds.

**The fix is structural, not manual:** share the namespace. `ci` refreshes the seed on
every non-docs push, so a failure here can no longer freeze the input this job
bootstraps from, and the first green run re-points `seed-latest` through the full gate —
which repairs the cold path too. It costs no soundness: the fixpoint, the corpus oracle
and the native suites still gate whatever is restored, which is exactly how the stale
entry was caught rather than published.

**What the stamp would have changed.** Nothing about the corruption — it would have
refused to produce it. The host check names both generations at the FIRST bootstrap
step, instead of surfacing three steps later as an em-dash diff in a corpus fixture,
over a candidate seed that should never have been built. That is the whole argument
for the check being an error rather than a warning, and it is no longer hypothetical.

The set is deliberately tiny and grows only when a subcommand needs a genuinely
new capability. Diagnostics print on stderr (`CMD_PRINT_ERR`); program output and
formatted source print on stdout.

### The host pump (Rust)

```rust
push_argv(&inst, &mut store, &args);          // cliArgReset / cliArgPush / cliArgCommit
loop {
    match cli_next(&inst, &mut store)? {
        CMD_DONE => break,
        CMD_LIST_DIR  => { for e in read_dir(path)? { dir_entry_push(e) } dir_commit() }
        CMD_READ_FILE => { let r = read(path); file_commit(r.is_ok(), r.unwrap_or_default()) }
        CMD_WRITE_FILE => { write(path, data)?; write_commit() }
        CMD_PRINT_OUT => stdout.write_line(data),
        CMD_PRINT_ERR => stderr.write_line(data),
        _ => bail!("unknown CLI command"),
    }
}
std::process::exit(cli_exit_code(&inst, &mut store)?);
```

That is the *entire* host CLI surface — generic across every subcommand. It does
no policy: no skip-list, no glob, no formatting, no severity, no exit logic. New
subcommands (`test`) reuse the same pump unchanged.

### The VL program

A `cli.vl` module, joined into the compile alongside the driver, that:

1. reads argv, classifies the subcommand and flags (`--severity`, `--concise`,
   `--exclude`, `--include-std`, `-w`, `--fix`, …);
2. drives the work: for `check`/`fmt`, push the target onto a work-stack; while it
   has pending directories, emit `CMD_LIST_DIR` and, on each committed entry,
   apply `SKIP_DIRS` + the glob matcher (VL) to decide recurse / collect / skip;
   for each collected file emit `CMD_READ_FILE`;
3. on a committed file, runs the compiler **in-module, by direct VL call** (not
   through the `srcPush` ABI) — `check` + `lint` (or `format`) — and gets
   diagnostics as VL data;
4. formats them (VL): the concise `path: sev [L:C] msg` line or the pretty
   caret block, severity-ordered, filtered by the display floor; emits each via
   `CMD_PRINT_ERR`; for `fmt -w` emits `CMD_WRITE_FILE`, else `CMD_PRINT_OUT`;
5. computes `--fix` edits from the lint codes + ranges and emits `CMD_WRITE_FILE`;
6. tallies, emits the summary, sets `cliExitCode()`, returns `CMD_DONE`.

Because the CLI program lives in the same wasm module as the compiler, steps 3–5
call the existing lexer/parser/typecheck/lint/format/diagnostic functions
directly — no second copy of the compiler, no ABI marshalling inside the module.
The only ABI is the host I/O command-queue above.

Color: the host can't be asked "are you a TTY?" without a primitive, so the host
passes `--color=auto|always|never` resolution into argv (it knows `isatty` +
`NO_COLOR`), and the VL formatter honors the resolved flag — keeping the
TTY-detection (mechanism) in the host and the ANSI rendering (policy) in VL.

**A caller's own `--color=` is an override, and is resolved in the host.** The
synthetic argument is appended AFTER user argv and `cliParseArgs` takes the last
one it sees, so `vl check --color=always | less -R` used to resolve to `never` —
the flag was accepted and then overruled. `ColorChoice` in the host now folds the
two together before either is sent: `always`/`never` win over the isatty rule (and
over `NO_COLOR`, which the NO_COLOR spec asks to honor only "when it is not
overridden by a command-line option"), `auto` is the default and asks `color_ok`.
An unrecognized value is exit 2 rather than a silent "never". The VL side is
unchanged and still only ever sees `always` or `never`.

The same flag reaches `vl run`, where it gates a running program's own `print`
output — see docs/serde-design.md §"Print, templates, and color", Stage C0. That
is the one path where escapes are produced by the HOST rather than by VL: the
per-type print imports know a value's type, which is what makes Node's split
(`console.log(5)` colors, `console.log("s")` does not) expressible at all.

## `check --json` — machine-readable diagnostics

`vl check <path> --json` replaces the pretty/concise stderr rendering with **one
JSON array on a single stdout line** (via `CMD_PRINT_OUT`), so editors and CI
consume diagnostics with `JSON.parse(stdout)` instead of screen-scraping. One
object per diagnostic, in the same order the pretty renderer would print them
(per file, position-sorted); an empty run (clean tree, or no `.vl` files found)
still emits a parseable `[]`.

```json
[{"file":"src/a.vl","severity":"info","code":"prefer-const",
  "line":3,"col":1,"endCol":4,
  "message":"`x` is never reassigned; use `const` instead of `let`"}]
```

Fields:

- `file` — the diagnostic's owning file: the imported module's path for a
  graph-compile error, else the checked file (same resolution as the pretty
  label).
- `severity` — `"error" | "warning" | "info" | "hint"`.
- `code` — the stable machine id: the lint rule id (`prefer-const`,
  `unused-variable`, …) or `redundant-type` for the annotation hint. **Omitted**
  for compile (parse/type/emit/resolution) errors — those carry no code.
- `line` (1-based), `col` (1-based, inclusive), `endCol` (1-based, EXCLUSIVE —
  `endCol - col` is the caret-span length, ≥ 1). All three **omitted** for a
  positionless diagnostic.
- `message` — the diagnostic text, unstyled.

**The column base is the SAME on every channel.** The compiler carries columns 0-based
internally (the lexer's convention, and the corpus `@error-at` directive's) and every
renderer shifts once: `--concise`'s `[line:col]`, `--json`'s `col`/`endCol`, the pretty
block's `at file:line:col`, and the `path:line:col: message` that `vl run` / `vl build`
print from the host. The host was the exception until the code-quality survey found it: it
printed the raw 0-based column, so one diagnostic reached column 15 under `run` and 16
under `check`, and a suite pinned both. `tests/selfhost_native_diag_pos_test.ts` now runs
one diagnostic through three channels and requires one column.

Semantics shared with the human renderers, unchanged: `--severity` sets both the
display floor and the exit gate exactly as in pretty mode, and the exit codes are
identical (0 clean, 1 gating diagnostics, 2 usage/read error — usage and
cannot-read errors keep their stderr message and emit no JSON). ANSI is never
emitted in `--json` mode regardless of the host-resolved `--color`; the human
summary line is suppressed (stderr keeps only notes like the `--fix` count, so
stdout stays pure JSON).

## `std:` diagnostics are withheld unless asked for (`--include-std`)

A `vl check` target resolves its whole module graph, so every `import … from
"std:…"` puts std's own source under the same lint tier as the file being
checked. None of it is the author's to fix: `vl check tools/replay-info.vl` in an
external consumer printed 44 warnings, **42 of them inside std**, burying the two
that were about the target (glean VL-014, `~/glean/docs/vl-issues.md`; D1601).

So a diagnostic whose owning module key starts with `std:` — the spelling an
import resolves to — is withheld unless `--include-std` is passed. It counts
nowhere while withheld: not in the error/warning tally, not in the `--severity`
gate, not in the JSON array. A withheld run says so on stderr in both human and
`--json` mode (`(3 std warnings hidden — --include-std shows them)`), so nothing
is dropped in silence.

Two boundaries the rule keeps:

- **Errors are always shown.** A type error inside std means the toolchain is
  broken, not the program, and hiding it would leave a build failing with no
  diagnostic at all.
- **std's own author is unaffected.** `vl check std/fmt.vl` names its target
  `std/fmt.vl`, not `std:fmt`, so `scripts/lint-self.sh`'s `std/` run still
  gates on everything std reports.

The complementary half is in the lint: `comment-block-too-long`,
`comment-shouting`, `comment-history` and `comment-measurement-uncited` implement
`docs/internals/comment-style.md`, which is the **compiler's** rubric, and are
skipped for a std module — std's comments are consumer API surface and are graded
by `std-comment-audience` against `std-api-review.md` §4 instead.

## Where a `vl` binary finds std and its seed

**std ships INSIDE the binary, a pin is one file, and every on-disk copy is a
DEVELOPMENT override that is explicit and announced.** (Owner question 2026-09-03;
DECISIONS.md §"std ships inside the binary"; rows D1573 and D1574.)

Resolution, first hit wins:

| | seed | std |
| --- | --- | --- |
| explicit | `--compiler <wasm>` | — |
| explicit, announced | `$VL_COMPILER_WASM` | `$VL_STD` |
| development tree | `./build/vl-compiler.wasm`, then `<tree>/build/vl-compiler.wasm` | `<tree>/std` |
| always present | the seed embedded in this binary | the std embedded in this binary |

A **development tree** is a directory holding `compiler/entry.vl` AND a real `std/`
(`is_dev_tree`), found by walking the ancestors of the **EXE** — never a fixed depth,
because a binary copied or symlinked to another depth then resolves nothing. Two
markers rather than one: a lone `std/` is also what a release layout has beside a
pinned binary, and adopting *that* is the silent pairing D1573 is about.

**A DISTRIBUTION build (`--features embed-seed`) takes NEITHER development rung.**
The feature bakes the seed in, and a binary carrying its own seed is the shipped
artifact rather than a checkout's build output — so the same flag decides that the
filesystem is not consulted at all. **The current directory is never consulted by a
released `vl`.** A development build keeps `./build/vl-compiler.wasm`, because that
is how the repo's own scripts drive a freshly built seed.

Both defects this replaces were silent, and both are one command to see now:

- **D1573** — a `vl` on `PATH` paired a current seed with the `std/` of a checkout
  37 commits behind, because the host walked the EXE's ancestors for a `std/` and
  took the first one it found. Nothing warned.
- **D1574** — the same binary was two different compilers depending on the current
  directory: `dist/vl seed | wc -c` read 1,832,652 inside `~/vl` (a stale
  `./build/vl-compiler.wasm`) and 2,046,575 from anywhere else (the embedded seed).

`vl --version` now names both resolutions and the rung each came from, plus the
commit the binary was built from and a std digest; when a development override is in
effect it says so, and prints the embedded digest beside it so the difference is the
thing you see. A distribution binary also prints one stderr line the moment
`$VL_STD` or `$VL_COMPILER_WASM` is honoured. A development build does not — it *is*
the exception, `$VL_STD` is how its own gates pin the tree under test, and the
announcement would be one line per invocation across every suite.

### `vl std` — the sibling of `vl seed`

`vl seed` exists so an editor can ask an installed `vl` for the compiler that
matches it; `vl std` is the same rung for the sources. `--list` and `--hash` say
what is in the binary, `--dump <dir>` writes it out, and a bare `vl std` answers the
other question — which std THIS run will use, and whether the two differ.

The embedded copy is `scripts/vl-host/src/std_embedded.rs`, **generated by
`deno task gen-std`** — the same invocation, over the same walk, that writes the
editor's `std/embedded.ts`. One generator, so the CLI and the editor cannot end up
disagreeing about std, and `tests/std_embedded_test.ts` fails on either being stale
without needing a binary or a seed. It is checked in rather than staged by
`build.rs` so that editing std needs no Rust toolchain. The identity both print is
FNV-1a 64 over `<name>\0<length>\0<source>\0` per module in sorted order;
`tests/vl_std_cmd_test.ts` makes the host and the generator hash **the same tree**
and compares, so the digest is cross-checked rather than trusted.

CI asserts the distribution contract from a directory with no tree above it
(`ci-embed-seed`): a program importing `std:array`, `std:fmt` and `std:json` runs
from `/tmp`, `vl std --dump` diffs clean against the tree's `std/`, and a planted
`./build/vl-compiler.wasm` leaves `vl seed --path` saying `embedded`.

## defaultScope, std, and sync

Three layers, kept distinct:

- **The `cli*` protocol exports are compiler/driver-only — NOT `defaultScope`.**
  They are the host-pump ABI (the yield queue); no VL program calls `cliNext()`.
  `defaultScope` (the always-in-scope builtins — `print`, `Map`, …) is untouched.
  I/O is rightly *not* a global builtin anyway — like most languages, the fs/os
  surface should be an explicit `std:` import, not ambient.

- **The pure policy helpers are ordinary VL and CAN graduate to `std:` now**,
  independent of any host capability: the glob matcher, the diagnostic renderer,
  path utilities. They do no I/O, need no imports, and run anywhere — so they can
  move to std libraries whenever useful, and `cli.vl` would import them from there.

- **The I/O itself (`listDir`/`readFile`/`writeFile`/argv/stdout) becomes a std
  surface (`std:fs` / `std:os` / `std:io`) at the WASI transition, not before** —
  and this is the load-bearing constraint. A std `fs.readFile(path): string` that
  returns synchronously requires a host-function IMPORT the wasm calls (WASI's
  `path_open` + `fd_read`). But the seed is instantiated with an EMPTY linker by
  every consumer today — the playground (`new WebAssembly.Instance(m, {})`), the
  Node/LSP checker, `cases_wasm`, and the Rust host all provide no imports. A wasm
  module's declared imports are mandatory at instantiation, so adding I/O imports
  to the seed would break all of them. The command-queue (exports only — nothing
  to provide) is exactly what keeps one seed runnable by every host. So I/O stays
  the compiler-internal yield protocol until the host is a WASI runtime supplying
  `fd_*`; then `std:fs`/`std:os` wrap those imports as sync functions, `cli.vl`
  consumes std like any program, and the command-queue's commands map 1:1 onto the
  WASI calls (`CMD_LIST_DIR` ≈ `fd_readdir`, …) — the VL policy is unchanged.

**Sync: yes — everything is synchronous; VL has no async/await.** Under the
command-queue the CLI is a *state machine* (it returns the next command and is
resumed with the result): sync semantics, structured as a yield loop rather than
straight-line `readFile()` calls. Under WASI the same operations become
straight-line sync imports. No async is introduced either way.

## `test`

Landed on this pump, as this document predicted ("New subcommands (`test`) reuse
the same pump unchanged"). Three commands were added — the `CMD_RUN_WASM`-shaped
capability the protocol was missing, split into the three steps a runner actually
needs:

| code | command | host mechanism |
| ---- | ------- | -------------- |
| 7 | `CMD_TEST_STASH` | keep the module the brain just emitted (`rbyteLen`/`rbyteAt`/`rbyteStore`) |
| 8 | `CMD_TEST_COLLECT` | instantiate each stashed module across a thread pool, read its `vlt*` registry back |
| 9 | `CMD_TEST_RUN` | run the brain's plan across the pool, catching a trap per test |

Everything else — discovery (the same walk with a `*.test.vl` predicate),
compilation, the plan, `-t` filtering, the report and the exit code — is VL in
`cli.vl`. Shipped shape: `docs/internals/vl-test-design.md`.

## `check --codegen` validates its own output

| code | command | host mechanism |
| ---- | ------- | -------------- |
| 10 | `CMD_VALIDATE` | `Module::validate` over the module in `rbyte*`; the verdict returns through `cliValidateCommit(ok)`, with the engine's own message on `cliResult*` when `ok = 0` |

The FOURTH thing a VL program cannot do for itself, beside listing a directory,
reading a file and executing wasm: **decide whether bytes are a module.** The
validator lives in the engine and the engine is the host's.

That gap had a cost. `compileSrc()` returning 0 means "the emitter ran to
completion", which is a strictly weaker claim than "these bytes load" — so
`--codegen`, the flag whose whole promise is *this program lowers*, exited 0 over
programs that could not load. `build` and `run` had covered themselves for a while
(`validate_written_module`; `Module::new` validates before it translates) and
`check` had not, purely because its bytes never left the guest. They do now, on the
same `rbyte*` readback channel `CMD_TEST_STASH` already used — no new mechanism.

The verdict lands as a **positionless `error` with code `invalid-module`**: the
validator names a wasm offset and no map from one back to a VL span exists, so the
diagnostic names the file, says the fault is the compiler's rather than the
program's, and passes the engine's reason through verbatim. `--no-validate` opts
out, mirroring `vl build --no-validate`.

Measured over `tests/cases` (2,075 files): **11 flagged, and all 11 are exactly the
files the corpus already marks `@no-instantiate`** — no false positives, nothing
missed. That set equality is a test
(`tests/vl_check_codegen_test.ts`), so a fixed defect and a newly-introduced one
both redden the suite.

The commit is probed lazily, inside the arm, so a seed predating this command still
runs under a host that has it.

## `run` and `build`

- **`run`**: VL parses args + reads the source (`CMD_READ_FILE`) / takes `-e`/stdin
  (argv / a `CMD_READ_STDIN` later), then asks the host to compile+execute. Wasm
  execution is a host capability (a new `CMD_RUN_WASM` carrying the emitted bytes,
  or — simpler near-term — `run` stays a host path until the protocol matures,
  since its policy is thin). Trap → exit code is host mechanism surfaced back.
- **`build`**: VL owns arg parsing + the output path decision; the host writes the
  `.wasm` (`CMD_WRITE_FILE`) and runs binaryen for `-O`/`-O3`/`--wat` (process
  spawn — mechanism, a `CMD_OPTIMIZE` / `CMD_DISASM` or kept as a host step keyed
  off a flag the VL program surfaces).

`run`/`build` are lower priority for the migration than `check`/`fmt` (their
policy is thin and already mostly host-mechanism), so they can stay on today's
host path until the protocol is proven on `check`.

### `build` flags (today's host surface)

`build` is the one command whose flags are still parsed entirely in Rust
(`main.rs`), not in `cli.vl` — so this is where they are written down.

| flag | what it does |
|---|---|
| `-o <out.wasm>` | output path (default: the input with `.vl` → `.wasm`) |
| `-O` | **shrink rung** — one open-world `wasm-opt -O` |
| `-O3` | **release profile** — `wasm-opt --closed-world -O3 --gufa -O3` |
| `--wat` | also dump a `.wat` beside the module (`wasm-dis`), AFTER optimization |
| `--names` | embed the wasm `name` custom section (legible trap backtraces) |
| `--no-validate` | skip the "will the engine instantiate this" check |
| `--compiler <f>` | the compiler module to compile with |

Three rules hold across the two optimization rungs, and they are the contract:

- **Both carry the same feature enables** (`--enable-reference-types
  --enable-gc --enable-bulk-memory`, the shared `BINARYEN_FEATURES` that `--wat`
  also uses). Never `-all` — it turns on post-3.0 features wasmtime then refuses
  to load.
- **A missing binaryen is a soft no-op, not a failure**: a note naming the flag on
  stderr, the unoptimized module left on disk, exit 0. `$VL_WASM_OPT` /
  `$VL_WASM_DIS` override the PATH scan.
- **`-O3` outranks `-O`** when both are given; it is a superset of `-O`'s effect
  on every measured shape.

`-O3` is a PROFILE, not a level passed through — its load-bearing member,
`--closed-world`, is a claim about the module boundary (scalar-only, DECISIONS H6)
rather than an optimization level, and the level itself is measurably not the
lever. What it buys, what each flag is worth, and the two scratch shapes that do
NOT melt: `docs/internals/opt-profile-design.md`.

## Exit codes, and which module trapped

The whole table, and it is the host's to answer — the VL side picks between 0, 1
and 2 (`cliUsageErr`, the severity gate), and the two the host owns alone are the
two a VL program cannot reach:

| code | meaning | decided by |
| --- | --- | --- |
| 0 | success | VL policy / the host's `Ok(())` |
| 1 | the program or its compilation failed | `report`, `cliExitCode` |
| 2 | usage — unparseable command line, unreadable input | `arg_error`, `cliUsageErr` |
| 3 | `vl fmt` only: the formatted output failed to re-parse | `cli.vl` |
| 70 | **the COMPILER itself crashed** | `report` / `EXIT_COMPILER_BUG` |

**70 exists because a trap does not say which module raised it.** Two wasm modules
are live in a `vl run`: the seed the host loaded as the compiler, and the module it
instantiated from the compile result. wasmtime renders a trap out of either one
identically — `wasm trap: out of bounds array access` over a backtrace of
`<unknown>!<wasm function N>` frames, since the seed carries no name section — so a
compiler crash arrives wearing the user's own error. D1500 is the measured cost: the
first external VL consumer hit a seed bug on the first compile of a DEFLATE decoder
and went looking for an out-of-range index in their decoder.

**The attribution is recorded at the CALL BOUNDARY, never read off the message.**
`from_compiler` / `from_user` wrap the failing wasm call itself and write
`FAULT_IN_COMPILER`; the banner needs that flag AND a `Trap` in the cause chain, so
a link or I/O failure that never entered a module cannot be blamed on one. Both
arms write, which is what keeps the flag fresh: `vl test` runs user modules inside
the same process that drives the compiler and DISCARDS their failures into a
per-test outcome, so a one-way "the compiler faulted" latch would go stale the first
time a test trapped.

Where each side is marked:

- **compiler** — `load_compiler`'s instantiate (the seed's own start function),
  every call in `compile_vl_instance` (`compileSrc`, the staging and readback
  accessors, `render_diags`), `run_batch`'s per-case instantiate, and `cli_pump` as
  a whole, since its user modules are loaded only inside the two `*_test_file`
  functions that swallow their own errors.
- **user** — `run_program_with`'s `Module::new` and `instantiate_program`'s
  instantiate, which is the single door into a compiled program from `vl run`,
  `--batch` and both `vl test` phases.

A non-zero `rc` back from `compileSrc` is the compiler REPORTING on the program and
is deliberately not a fault: it reaches `report` through the same function as a trap
would, which is what makes it the control worth keeping in the suite
(`tests/vl_compiler_trap_banner_test.ts` pins both directions — a host that
bannered every trap is the same defect with the blame reversed).

## Migration sequence

1. **Protocol foundation + `vl check` (single file) in VL** — land the
   command-queue exports + host pump; the VL `check` policy (run check+lint,
   format, severity, exit) for one file. Retire the Rust-side check formatting
   (#432) on this path.
2. **`vl check` over a directory** — VL walk + `SKIP_DIRS` + glob `--exclude`/
   `--ignore` over `CMD_LIST_DIR`. Supersedes the closed #433.
3. **`vl fmt` in VL** — walk + write/stdout/`--check` over the same protocol;
   retire the Rust-side fmt walk/glob (#429).
4. **`vl check --fix`** — VL fix-edit computation (prefer-const; `redundant-type`,
   which removes an explicit annotation the initializer already infers) + `CMD_WRITE_FILE`.
   MODULE-AWARE: the fixes are computed in `cliCheckCurFile` AFTER the resolved
   module compile (so the checker's types are reliable), from the entry module's
   findings (`redunModuleAt == 0`); the file is written, then re-checked for the
   report. (`cliComputeFixes` only reads the populated redun + lint streams.)
5. **Retire `cli.ts` + the `cli_*` tests** — DONE. The behavioral tests were
   repointed to drive the native `vl` binary (`vl_check_severity`/`_codegen`/
   `_exclude`/`_fix`) and `compiler/cli.ts` is deleted, along with the `deno compile`
   release path it fed (`build-binary.ts`/`smoke-binary.ts` → native
   `build-binary.sh`). See `CHANGELOG.md`.
6. **`run`/`build` policy** — move arg parsing/output framing onto the protocol if
   it pays; keep wasm-exec + binaryen as host capabilities.

Each step rebuilds the seed (the `.vl` CLI is in the compiled source), so the
native fixpoint + golden gates apply.

## Why the pump and not WASI now (decision)

The pump is **bespoke**, not a standard — it mirrors the in-repo module-fetch
loop. WASI is the standard. We chose the pump for the near term anyway, for three
reasons (heaviest first):

1. **ABI mismatch with WASI Preview 1.** Preview 1 is linear-memory/iovec-based
   (`path_open(path_ptr, path_len)`, `fd_read` into memory); VL is WasmGC —
   strings/arrays are GC refs, not memory regions. Bridging Preview 1 means a
   linear memory + a GC↔linear *copy at every syscall* (the marshalling H-M2's
   roadmap entry plans as its one emitter prerequisite). The pump instead uses
   VL's existing GC-native per-code-point accessors (`srcPush`/`diagMsgAt`/…) —
   zero marshalling. Preview 2 (native `string`/`list`) is the clean fit but its
   async/tooling story is still settling.
2. **The seed is import-free and most embedders do no I/O.** wasmtime gives WASI
   p1 for free, but **browsers don't implement WASI** — the playground checks code
   in-memory and would have to ship a JS WASI shim for imports it never calls.
   The pump (exports only) runs identically in wasmtime, deno, and the browser.
3. **Consistency** — the module-fetch loop is already this exact empty-linker queue.

This does **not** handcuff VL to Preview 2. The WASI transport, when it lands, can
be *either* the roadmap's marshal-copy (H-M2: a linear memory + GC→linear copies)
*or* native unmanaged linear-memory string/array objects (a larger language
feature — a distinct unmanaged type with its own ops + lifetime/arena story — that
makes WASI/FFI zero-copy). **The VL policy (walk, glob, formatting, severity, fix)
is identical under all three**; only the I/O transport differs. The pump unblocks
the CLI now and defers the transport choice.

## WASI end-state

Every command code maps onto a WASI primitive — `CMD_LIST_DIR` ≈ `fd_readdir`,
`CMD_READ_FILE` ≈ `path_open`+`fd_read`, `CMD_WRITE_FILE` ≈ `fd_write`,
`CMD_PRINT_*` ≈ `fd_write` to 1/2, argv ≈ `args_get`. When the host becomes a WASI
shim (or a stock WASI runtime), the VL CLI program is unchanged; only the queue's
transport swaps (per the marshal-copy or native-linear-objects choice above).
