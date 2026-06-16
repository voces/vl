# `vl` CLI design — the brain is VL, the host is a pump

The native `vl` tool (`build`/`check`/`run`/`fmt`, later `test`) follows the same
charter as the compiler and the test runner (`docs/test-runner-design.md`):

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

### Command codes

```
CMD_DONE       0   // the program is finished; read cliExitCode()
CMD_LIST_DIR   1   // list cliCmdPath(); commit entries via cliDirEntryPush + cliDirCommit
CMD_READ_FILE  2   // read cliCmdPath(); commit via cliFileCommit(found, data)
CMD_WRITE_FILE 3   // write cliCmdData() to cliCmdPath(); commit via cliWriteCommit
CMD_PRINT_OUT  4   // write cliCmdData() (+ newline) to stdout; no commit
CMD_PRINT_ERR  5   // write cliCmdData() (+ newline) to stderr; no commit
```

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
   `--exclude`, `-w`, `--fix`, …);
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

## `run` and `build`

- **`run`**: VL parses args + reads the source (`CMD_READ_FILE`) / takes `-e`/stdin
  (argv / a `CMD_READ_STDIN` later), then asks the host to compile+execute. Wasm
  execution is a host capability (a new `CMD_RUN_WASM` carrying the emitted bytes,
  or — simpler near-term — `run` stays a host path until the protocol matures,
  since its policy is thin). Trap → exit code is host mechanism surfaced back.
- **`build`**: VL owns arg parsing + the output path decision; the host writes the
  `.wasm` (`CMD_WRITE_FILE`) and runs binaryen for `-O`/`--wat` (process spawn —
  mechanism, a `CMD_OPTIMIZE` / `CMD_DISASM` or kept as a host step keyed off a
  flag the VL program surfaces).

`run`/`build` are lower priority for the migration than `check`/`fmt` (their
policy is thin and already mostly host-mechanism), so they can stay on today's
host path until the protocol is proven on `check`.

## Migration sequence

1. **Protocol foundation + `vl check` (single file) in VL** — land the
   command-queue exports + host pump; the VL `check` policy (run check+lint,
   format, severity, exit) for one file. Retire the Rust-side check formatting
   (#432) on this path.
2. **`vl check` over a directory** — VL walk + `SKIP_DIRS` + glob `--exclude`/
   `--ignore` over `CMD_LIST_DIR`. Supersedes the closed #433.
3. **`vl fmt` in VL** — walk + write/stdout/`--check` over the same protocol;
   retire the Rust-side fmt walk/glob (#429).
4. **`vl check --fix`** — VL fix-edit computation (prefer-const, unused-var
   `_`-prefix) + `CMD_WRITE_FILE`.
5. **Retire `cli.ts` + the `cli_*` tests** — repoint the behavioral ones
   (`cli_severity`/`cli_fmt`/`cli_fix`) to drive the `vl` binary; the TS-internal
   `cli_excludes` unit test + the binaryen-specific `cli_codegen` retire.
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
