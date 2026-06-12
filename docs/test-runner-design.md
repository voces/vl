# `vl test` — the test runner design

The in-language testing story that eventually replaces the corpus's
`@run`/`@log` directive fixtures for BEHAVIORAL tests (the `@check`/`@error`
family stays — compile-time verdicts are the language's spec corpus, not user
tests). Sibling design: `docs/std-design.md` D5 owns the in-language
`std:testing` surface; this doc owns discovery, execution, parallelism,
capture, and reporting — the Rust host's half.

Direction set by the maintainer: `*.test.vl` discovery with configurable
globs; jest-shaped `describe`/`it`/`beforeEach`/`afterEach`; `expect(...)`
matchers; files parallel / in-file serial by default, with opt-in
parallelism for blocks within a file; per-test stdout capture under
parallelism. The cross-language survey (jest/vitest, Deno.test, pytest,
go test, cargo-nextest, ExUnit, Zig, Swift Testing, JUnit 5) confirms the
shape and sharpens five decisions, folded in below.

## Execution model — two-phase registration, host-driven

1. **Collect**: the host compiles a `*.test.vl` file (module-aware — the
   existing fetch loop resolves its relative + `std:` imports) and
   instantiates it. The wasm start function runs the file's top level:
   `describe`/`it`/hook calls REGISTER into `std:testing`'s module-level
   registry and nothing else (registration-only `describe` bodies — the
   Deno-steps lesson; document loudly, lint later).
2. **Plan**: the host reads the registry through a small export protocol —
   `vltCount(): i32`, `vltNameLen(i)/vltNameAt(i,j)` (the full
   `describe/…/it` slash-path), `vltSerialOnly(i)` etc. — then applies
   filters (`-t`, `.only`, `.skip`) and schedules.
3. **Execute**: `vltRun(i): i32` per test (0 pass; a failed expectation
   prints its rendered FAIL line and `__trap__()`s — the host catches the
   trap, marks the test failed, and continues). Hooks run inside `vltRun`
   (the registry knows the enclosing scopes). Per-test host calls give trap
   isolation, output attribution, timeouts, and retries for free.

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
  shared host resources.
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
- `.only` (registers as only-mode; host runs only those, `--forbid-only` for
  CI), `.skip(reason)`, `.todo(name)`; runtime `t`-less `skip(reason)` inside
  a test marks SKIP (environment-dependent skips without conditional
  attributes).
- `path.test.vl:42` line targeting and `--failed-first` ride the
  compiler-injected call-site work (below) and the JSON event stream — v2.

## What v1 needs, by component

- **Rust host** (`scripts/vl-host/src/main.rs`, the only v1 implementation
  surface beyond std:testing itself): `test` subcommand; the walker; a
  capture-mode `run_program` variant (print closures → per-instance buffer,
  return the `Instance`); the `vlt*` export protocol driver (functype-aware —
  the hidden leading structref env param when `fnValUsed`, mangled `$m0`
  names: centralize the name predicate, both are bridge artifacts that the
  symbol-resolution revisit replaces); per-call trap catch; thread-pool
  scheduling; spec/dot reporters. ~400–500 LOC.
- **`std:testing` v1** (see std-design.md D5): registry + `describe`/`it`/
  hooks/`expect` over value unions + `__trap__` failure path.
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
   on generic exports + struct-eq emit coverage — std-design slices 2/6).
   Matcher quality IS diff quality; `std:fmt` grows debug-formatting early.
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
  directive fixtures indefinitely — they are the spec/soundness corpus.
- The sweep + align test remain the parity gates throughout; `vl test` adds
  the user-facing tier, it doesn't replace the oracle tiers until the TS host
  is gone.
