# `vl test` — the test runner design

The in-language testing story that eventually replaces the corpus's
`@run`/`@log` directive fixtures for BEHAVIORAL tests (the `@check`/`@error`
family stays — compile-time verdicts are the language's spec corpus, not user
tests; the far end-state, once the compiler is itself reachable as a std API,
is corpus files becoming `*.test.vl` files that inline sources and drive a
`std:`-exposed compile/run — deferred, noted in §Migration). Sibling design:
`docs/std-design.md` D5 owns the in-language `std:test` surface; this doc
owns discovery, execution, parallelism, capture, and reporting.

Direction set by the maintainer: `*.test.vl` discovery with configurable
globs; jest-shaped `describe`/`it`/`beforeEach`/`afterEach`; `expect(...)`
matchers; files parallel / in-file serial by default, with opt-in
parallelism for blocks within a file; per-test stdout capture under
parallelism; **runner logic in VL wherever possible, not Rust**. The
cross-language survey (jest/vitest, Deno.test, pytest, go test,
cargo-nextest, ExUnit, Zig, Swift Testing, JUnit 5) confirms the shape and
sharpens five decisions, folded in below.

## Architecture — the brain is VL; Rust is the mechanism pump

The runner splits along the same line as the compiler itself (`main.rs`
charter: "the brains land in the wasm, the adapter stays an I/O shim"):

- **`std:test/runner` — a VL program — owns all POLICY**: CLI-arg
  interpretation (the host passes argv through), the directory WALK and
  glob/filter matching (over raw fs primitives — below), the plan (which
  tests run where, `.only`/skip resolution, ordering), report formatting
  (the spec/dot trees, the summary line), and the exit-code decision.
- **The Rust host owns only the MECHANISM the wasm capability model cannot
  express**, exposed as RAW primitives, never policy: `listDir(path)` →
  entries (name, isDir) — the walk recursion, skip lists, and glob matching
  are VL code consuming it; `readFile`; the thread pool; wasm instance
  lifecycle (instantiate/kill/re-instantiate); print-sink capture buffers;
  per-call trap catching; timeouts (epoch interruption). (A batched
  `walk`/`glob` primitive is a later PERF option if pumping `listDir`
  per-directory ever shows up; start with the rawest primitive that works —
  it is also exactly `fd_readdir`, so the VL walk code survives the WASI
  transition with only the primitive's transport changing.)

The two talk through a **command-queue protocol** — the same shape as the H3
module fetch loop (the wasm holds a pending list; the host drains it and
commits results; the linker stays EMPTY, no host-function imports): the host
pumps `rnNextCmd()` (e.g. "walk these globs", "collect file X", "run test i
of file X concurrent", "emit this report line"), executes each, and pushes
results back through commit exports. The runner program is a pure state
machine; the host is a loop.

Why this split is load-bearing and not taste:
- **Threads are not WASI** (wasi-threads never standardized; the component
  model's async story is still settling) — even a pure-WASI runner cannot
  spawn. Parallel scheduling is host-side in EVERY design; the only question
  is whether the policy around it is Rust or VL. VL.
- **The Rust host is scheduled to die** (ROADMAP H-M2: the binary becomes a
  thin WASI shim, then optional). A Rust-heavy runner deepens the host
  exactly when the plan is to shrink it; the VL brain survives the H-M2
  transition unchanged while the fs-walk half of the mechanism dissolves
  into WASI preopens.
- **Dogfood**: the runner is the first nontrivial VL *program* (not compiler
  module) in the tree — more demand-driven discovery.

The runner program is compiled at `vl test` startup by the seed (~ms) from
`std/test/runner.vl` — no second prebuilt artifact.

Estimated Rust: ~200 LOC (subcommand + walker + pump + capture + pool),
down from ~450 in the all-Rust draft.

## Execution model — two-phase registration, runner-driven

1. **Collect**: a test file compiles (module-aware — the existing fetch loop
   resolves its relative + `std:` imports) and instantiates. The wasm start
   function runs the file's top level: `describe`/`it`/hook calls REGISTER
   into `std:test`'s module-level registry and nothing else
   (registration-only `describe` bodies — the Deno-steps lesson; document
   loudly, lint later).
2. **Plan**: the runner reads each file's registry, relayed by the host.
   Mechanically (no strings-as-code, no parsing): the RUNNER instance issues
   a `collect <path>` command; the host compiles + instantiates that TEST
   FILE as a second instance, whose start function has just run the
   registrations; the host then reads the test file's registry through ITS
   exports (`vltCount()`, then per test the slash-path name via the
   per-codepoint `vltNameLen(i)`/`vltNameAt(i, j)` idiom — the same
   string-crossing protocol the compiler driver and fetch loop already use)
   and commits the entries into the runner instance through the runner's
   push/commit exports. Two live instances, host as relay; nothing is ever
   evaluated from strings. The runner then applies filters (`-t`, `.only`,
   `.skip`) and schedules.
3. **Execute**: `vltRun(i): i32` per test (0 pass; a failed expectation
   prints its rendered FAIL line and `__trap__()`s — the host catches the
   trap for that call, reports it to the runner, and continues). Hooks run
   inside `vltRun` (the registry knows the enclosing scopes). Per-test calls
   give trap isolation, output attribution, timeouts, and retries for free.

Why two-phase (vs Deno-style steps discovered during execution): listing,
`-t` filtering, `.only`, line targeting, and parallel scheduling all need the
tree before running. The price — `describe` bodies must not do work — is a
documented convention every two-phase runner shares.

A trap killing the store is recoverable: re-instantiate the module (the
compiled `Module` is reused; instantiation is cheap and the start function
re-registers deterministically), resume at the next test. Re-instantiation is
also the better-isolation fallback if post-trap stores misbehave.

## Parallelism + isolation — instances, not threads

Wasm instances are single-threaded and share nothing; that maps the jest
model onto wasm cleanly:

- **Files parallel by default** (the maintainer's lean, strengthened by the
  survey: ExUnit's `async: true` opt-in exists because BEAM tests share a
  node — VL instances share nothing by construction, so parallel-by-default
  is safe). One wasm instance per file, scheduled across a Rust thread pool
  (`--jobs`, default ncpu). A per-file `serial` opt-out covers files touching
  shared host resources. (Why a HOST pool and not VL/WASI threads:
  wasi-threads was never standardized and the component-model async story is
  still settling — no portable wasm program can spawn today. In-language
  concurrency is the B12 async/await track, far future; if/when wasm gains a
  portable spawn, the command-queue protocol absorbs it without redesign —
  the runner already expresses the plan, only the executor changes.)
- **Tests within a file: serial**, sharing the instance — `beforeAll`-style
  expensive setup and closure-shared state work as in jest.
- **In-file parallel blocks (opt-in)**: `it.concurrent`/`describe.concurrent`
  means "may run in a FRESH instance of this module, concurrently": the host
  instantiates another copy (registration replays deterministically) and runs
  just that test there. Contract: a concurrent test cannot see sibling tests'
  mutations of module state — which is exactly nextest's process-per-test
  isolation, opt-in and nearly free. This sidesteps Vitest's
  concurrent-context pitfalls entirely (no shared mutable attribution state).
- Instance granularity also gives **per-test timeouts** (wasmtime epoch
  interruption; kill + re-instantiate) and **retries/flaky detection** later,
  without in-language support — the nextest lessons.

## Output capture + reporting

The host owns the `__print_*__` sinks, so capture is structural, not
console-patching: each instance's prints buffer into the currently-running
test's record (`vltRun(i)` brackets attribute output exactly; instances run
one test at a time). Defaults follow nextest: buffer everything, show a
failing test's captured output immediately (failure-first), passing output
hidden, `--no-capture` to stream.

Reporters: `spec` (default, tty — the indented describe/it tree), `dot` (CI),
`json` event stream later (drives watch mode, LSP code-lens "run test", JUnit
XML export).

```
core/list.test.vl
  list push/pop
    ok   grows past capacity        (1.2ms)
    FAIL pops in LIFO order         (0.4ms)
         FAIL list push/pop > pops in LIFO order: expected 7, got 8
         --- captured output ---
         debug: cap=8 len=9
12 files · 87 passed · 1 failed · 2 skipped   (0.9s)
```

Exit codes: 0 all green, 1 any failure (compile failure of a test file = that
file FAILs and the run continues), 2 usage — consistent with the binary today.

## Discovery + filtering

- Default: walk the given paths (default `.`) for `*.test.vl`, skipping
  `node_modules`, `dist`, `build`, `target`, `reference`, `.git`. Positional
  args accept files, dirs, or globs (`vl test 'src/**/parser*'`).
- `-t <substring/regex>` matches the slash-path (`describe/inner/it name` —
  go test's `-run` hierarchy, the survey's standout filter UX).
- **Focused/skipped tests — `.only`/`.skip(reason)`/`.todo(name)`.** The
  ecosystem survey splits cleanly: in-code focus markers are a JS idiom
  (jest/vitest `.only`, jasmine `fit`/`xit` — pure aliases for the same
  bits); the typed/compiled ecosystems do RUNNER-SIDE selection instead —
  Go has no focus marker (`go test -run Name` filters), Rust has
  `cargo test <filter>` + `#[ignore]` (run them back with `--ignored`),
  Swift Testing has `.disabled(reason)` + runner/IDE filters, JUnit/Kotlin
  `@Disabled`/`@Tag` + engine filters, pytest `-k`/marks, ExUnit tags +
  `path:line`. Their reasoning: edit-code-to-configure-a-run is a footgun (a
  committed focus mark silently skips the suite). VL keeps BOTH halves:
  `-t`/path filters are the primary selection mechanism (and `path:line`
  targeting once call-site injection lands — the ExUnit workflow), and
  `.only` exists for the editor-proximate jest workflow with
  `--forbid-only` as the CI guard. One spelling, no `fit`/`xit` aliases.
  Two-phase registration makes `.only` naturally SINGLE-PASS: the registry
  marks focused entries during collect, the plan drops the rest — no re-run.
  `.skip(reason)` doubles as the `#[ignore]`/`@Disabled` analog (reasons
  surface in the report); runtime `skip(reason)` inside a test marks SKIP
  (environment-dependent skips without conditional attributes).
- **Changed-file selection (jest's `--changedSince`, chartered v2)**: the
  module graph already exists in the compiler — map changed files through
  the import closure to the affected `*.test.vl` set. There are TWO change
  ranges, both workable (each is just a different `git diff --name-only`
  feeding the same closure): (a) the WORKING TREE (uncommitted edits —
  `git status`), the local-loop default; (b) AGAINST A BASE
  (`--changed-since=<ref>`, typically `origin/master` — the branch's whole
  diff), the CI/branch range. Defaults per the maintainer: working tree
  dirty → affected tests; clean → all (locally; falling back to (b) against
  the branch base when on a branch is a possible refinement — decide from
  use). `--changed-priority[=<ref>]` for CI: run everything, AFFECTED FIRST,
  so a likely failure surfaces in seconds while the full run continues
  (fail-fast ordering without losing coverage). The graph walk is VL-side
  (the runner brain — the compiler's own module scanner is reachable there);
  the git queries are one host command primitive.
- `path.test.vl:42` line targeting and `--failed-first` ride the
  compiler-injected call-site work (below) and the JSON event stream — v2.

## What v1 needs, by component

- **`std:test/runner` (VL — the brain)**: the command-queue state machine
  (plan/filter/schedule policy, reporters, summary, exit code). Compiled by
  the seed at `vl test` startup.
- **Rust host (the mechanism pump, ~200 LOC)**: `test` subcommand; the
  `*.test.vl` walker + file reads (as command executors); the pump loop; a
  capture-mode `run_program` variant (print closures → per-instance buffer,
  return the `Instance`); the `vlt*` per-file protocol driver
  (functype-aware — the hidden leading structref env param when `fnValUsed`,
  mangled `$m0` names: centralize the name predicate, both are bridge
  artifacts the symbol-resolution revisit replaces); per-call trap catch +
  epoch timeouts; the thread pool.
- **`std:test` v1** (see std-design.md D5): registry + `describe`/`it`/
  hooks/`expect` + `__trap__` failure path.
- **Compiler**: nothing for v1 beyond std-design Slice 0's `__trap__`.
- **Corpus/CI**: dogfood `*.test.vl` files for the runner itself; a ci-native
  step running `vl test` over them; from this slice on, new behavioral tests
  are written as `*.test.vl` (directive-corpus growth stops).

## Chartered follow-ups (not v1)

1. **Compiler-injected call sites** — the `#[track_caller]` analog: `it`/
   `expect` receive an implicit `file:line` argument stamped by the compiler.
   The survey's highest-leverage finding (every framework without failure
   locations regrets it; VL owns both compilers, no macros needed). Unlocks
   `path:line` targeting and clickable failures.
2. **Generic `expect<T>`** + structural diff rendering via `std:fmt` (gated
   on generic exports — std-design slice 2; structural `==` over
   structs/lists already works in both compilers). Matcher quality IS diff
   quality; `std:fmt` grows debug-formatting early.
3. **Power-`assert`** — compile-time rewriting of plain `assert a == b` to
   print sub-expression values (pytest/Swift's killer UX). VL owns its
   compiler; post-1.0 differentiator.
4. **Sanitizers** — the host knows about leaked instances/pending host state
   at test end (the Deno lesson); cheap leak checks once `vl test` owns real
   resources.
5. **Watch mode** + `--failed-first` (persist last-run results), JSON event
   stream consumers (LSP code-lens).
6. **Expected-trap tests** (the 4 `@trap` corpus files' shape) — an
   `it.traps(name, fn)` registration or runner flag; tiny population, keep as
   directives meanwhile.

## Migration of the directive corpus

- `@run`/`@log` (316 files): converts mechanically (each file becomes one
  `it` with `expect` calls) — but NOT until the TS-host tiers die; the
  directives are the cross-compiler parity vehicle until then. The immediate
  effect of v1 is freezing the directive corpus, not converting it.
- `@check`/`@error`/`@error-at`/`@warning`/`@hint`/`@info` (~260): stay
  directive fixtures for now — they are the spec/soundness corpus. The far
  end-state (maintainer direction, deferred): once the COMPILER is reachable
  as a std API (`std:compile`-class — compile this source string, give me
  diagnostics/wasm), even these become `*.test.vl` files that inline the
  source under test and expect on the diagnostics — the directive runners'
  job, in-language. That waits on the H-M2-era "compiler as a library"
  surface; no directive machinery should grow meanwhile.
- The sweep + align test remain the parity gates throughout; `vl test` adds
  the user-facing tier, it doesn't replace the oracle tiers until the TS host
  is gone.
