# `vl test` v1 — as built

`docs/internals/test-runner-design.md` is the CHARTER: it owns the direction
(`*.test.vl` discovery, jest-shaped `describe`/`it`, files parallel / in-file
serial, per-test trap isolation, output capture, the reporter and exit codes) and
the long tail of chartered follow-ups. This document records what v1 actually
SHIPS, and — where the charter was written before `compiler/cli.vl` existed —
where the implementation diverges and why.

Sibling: `docs/internals/std-design.md` D5 owns the `std:test` surface;
`docs/internals/cli-design.md` owns the command-queue pump this rides on.

## Where the design was followed, and where it was reconciled

The charter's load-bearing claim — **policy in VL, mechanism in Rust** — is
honoured exactly. Three things about WHERE the VL lives changed, because the
charter predates the CLI pump landing.

### 1. The brain is `compiler/cli.vl`, not a separate `std/test/runner.vl`

The charter specifies a runner PROGRAM at `std/test/runner.vl`, compiled by the
seed at `vl test` startup, driven by a new `rnNextCmd()` command queue, with the
directory walk written against a raw `listDir` primitive.

Every one of those pieces now exists — in `compiler/cli.vl`, built for `vl check`
and `vl fmt`: `cliNext()` IS the command queue, `CMD_LIST_DIR` IS the raw
`listDir` primitive, and the VL-side recursive walk with its skip-list and glob
`--exclude` matching is already written on top of it, along with file sorting,
the print drain and the exit-code decision. `docs/internals/cli-design.md`
anticipated this explicitly: *"New subcommands (`test`) reuse the same pump
unchanged"*, and lists wasm execution as the one capability the protocol was
still missing (`CMD_RUN_WASM`).

So `vl test` is a third subcommand on the existing brain (`cliCmd == 2`) rather
than a second brain with a second protocol. What this buys, concretely: the
walk, the skip list, `--exclude`, sorting, the per-run module source cache, the
module fetch loop, diagnostic rendering, the print drain and the exit-code path
are all REUSED, not reimplemented. The runner's own new VL is ~330 lines.

What it costs, honestly:

- The runner is no longer "the first nontrivial VL *program* in the tree" — one
  of the charter's three stated reasons for the split (dogfooding). The other
  two (threads are not WASI; the Rust host is scheduled to shrink) are unaffected
  — the CLI brain is exactly the artifact that survives the H-M2 transition.
- Changing the runner means rebuilding the seed. That is already true of `check`
  and `fmt`, and the gates (`refresh-compiler.sh --prove-fixpoint`,
  `native-fixpoint.sh`) already cover it.

If the dogfooding argument is later judged to outweigh the reuse, the move is
mechanical: the state machine below is self-contained and its host commands are
already generic.

### 2. Compilation is VL-side; only EXECUTION crosses

The charter has the host compile test files ("the `*.test.vl` walker + file reads
as command executors"). Here the brain compiles each file itself — it is inside
the compiler, so `compileSrc()` is a direct call, and the module fetch loop that
resolves a test file's `std:` and relative imports is the same one `vl check`
already drives. This is what makes "a test file that does not compile is a
FAILING ENTRY and the run continues" fall out for free, with the compiler's real
positioned diagnostics, rather than needing a second diagnostic path in Rust.

### 3. `.only` is not spellable, so runner-side selection is the whole story

The charter keeps both halves of the focus story: `-t`/path filters AND jest's
`.only`/`.skip(reason)`. VL has no property access on a function value, so
`it.only` / `it.skip` cannot be written. v1 therefore ships:

- `-t <substring>` against the scope-qualified name — which the charter itself
  calls "the primary selection mechanism";
- `itSkip(name, body)` as the `#[ignore]`/`@Disabled` analog.

`.only` and `--forbid-only` wait on a language feature, not on runner work.

## The protocol

Three commands, all additions to the existing pump (`compiler/cli.vl` ↔
`scripts/vl-host/src/main.rs`):

| code | command | the host's job |
| ---- | ------- | -------------- |
| 7 | `CMD_TEST_STASH` | keep the module the brain just emitted (read off the driver's own `rbyteLen`/`rbyteAt`/`rbyteStore` channel, exactly as `vl build` does) |
| 8 | `CMD_TEST_COLLECT` | load + instantiate every stashed module across the pool, read each registry back, commit them in stash order |
| 9 | `CMD_TEST_RUN` | read the plan, run it across the pool, commit each outcome |

The brain's phases:

1. **Discover** — the shared walk with a `*.test.vl` predicate (`cliEndsTestVl`).
2. **Compile**, one file at a time: read → resolve imports → `compileSrc()` →
   `CMD_TEST_STASH`. A nonzero rc records the rendered diagnostics as that file's
   one report entry and the loop moves on.
3. **Collect** — `CMD_TEST_COLLECT`. Instantiating a test module RUNS its start
   function, which is the registration pass; the host then reads
   `vltCount`/`vltNameLen`/`vltNameAt`/`vltSkipped` and commits the registry.
4. **Plan** — apply `-t`. Two-phase, exactly as the charter argues: the tree
   exists before anything runs, so filtering is single-pass.
5. **Run** — `CMD_TEST_RUN`. One instance per file; the file's selected tests run
   serially in it; files run concurrently.
6. **Report + exit** — deterministic order (files sorted, tests in registration
   order) however the pool scheduled them.

### The appended protocol re-export

A test file does not write any boilerplate. Before compiling one, the brain
APPENDS

```
export { vltCount, vltNameLen, vltNameAt, vltSkipped, vltRun, vltFailLen, vltFailAt } from "std:test"
```

to its source. Appending (never prepending) leaves every diagnostic position in
the user's file untouched — the meta-test asserts that a compile error in
`broken.test.vl` still reports at `7:10`.

Consequence worth knowing: a test file that defines its own `vltCount` gets a
duplicate-export error, which surfaces as that file's compile failure like any
other.

### Failure messages are structural, not scraped

A failing matcher records its rendered message in a `std:test` module global and
then `__trap__()`s. The host catches the trap for that call and reads the message
back off the (unwound but intact) instance via `vltFailLen`/`vltFailAt`. A trap
carrying no recorded message — a raw `__trap__()`, an out-of-bounds index — falls
back to the engine's own trap text. This is why the report says
`expected 7 to equal 8` rather than `wasm trap: unreachable`.

### Isolation

After a trap the host RE-INSTANTIATES the module before the next test. The
registration pass replays deterministically, so test indices are stable and the
next test starts from clean module state. This is the charter's stated recovery
and it is what the meta-test's `trap.test.vl` proves: two tests trap and the test
declared after them still runs and passes.

### Parallelism

`std::thread::scope` over an atomic cursor (`parallel_map`), no new host
dependency — the host's whole dependency list is still wasmtime + anyhow. Both
phases use it, so the Cranelift compile of each test module is parallel too.
`--jobs N`, defaulting to `available_parallelism()`.

**One engine, both phases.** A `Module` belongs to the `Engine` that compiled it.
Building a second engine for the run phase fails at instantiation with
`incompatible import type for imports::__print_i32__` — the import types are
structurally identical but engine-local, so the error names the print ABI and is
nothing to do with it. `test_engine()` builds one lazily and shares it.

## The `std:test` tail-type rule

This is the sharpest edge in the surface, and it is a LANGUAGE property, not a
runner choice. A VL function's result type is its TAIL statement's, and a test
body is typed `() => void`. The statements that yield nothing are: a call to a
void function, a `while`, a `const` declaration, and an `if` whose branches are
void. An assignment and a `.push` both YIELD A VALUE.

So `it("x", () => { expect(1).toEqual(1) })` typechecks (the matchers are void by
construction — each one's tail is a call to `vltAdjudicate`), while
`beforeEach(() => { hits = hits + 1 })` does not:

```
argument 1: expected () -> void, got () -> i32
```

`std:test` exports `done()`, a void no-op, as the documented terminator:
`beforeEach(() => { hits = hits + 1  done() })`.

## Known gaps (v1)

0. **`vl fmt`'s trailing-lambda rule — CLOSED.** The runner PR filed this as its
   top follow-up: `vl fmt` exploded a call with a BLOCK-bodied lambda argument
   into a vertical argument list STRUCTURALLY, not on width, so a 34-column
   `it("adds", () => { … })` became six lines and every table-driven test file
   was disfigured.

   Shipped as the trailing-lambda exception — when the FINAL argument of a call
   is a block-bodied lambda, the preceding arguments all fit on one line, and the
   head line fits `fmtWidth`, the call hugs:

   ```
   it("adds", () => {
     expect(1 + 1).toEqual(2)
   })
   ```

   The three design questions this section deferred (only the last argument? two
   lambdas? a lambda followed by another argument?) are answered with a ruling
   and a corpus measurement each in
   `docs/internals/fmt-trailing-lambda-design.md`; they turned out to be one
   guard set, not three rules. Blast radius on the gated tree was ZERO.

   The fixtures under `tests/fixtures/vl-test*/` are therefore now `vl fmt`-clean
   AS WRITTEN — the readable form IS the canonical form — and
   `tests/vl_fmt_test.ts` pins that, so a regression in the rule reddens there
   rather than silently disfiguring every test file again.
1. **Void-return covariance on function values.** The wart above. The fix is not
   a relaxed check: the array's element type IS the interned `$fnsig`, so a
   `() => i32` closure in a `(() => void)[]` needs a real coercion at the store,
   with the call site dropping the result. Worth doing — every user meets this —
   but it is emitter work, not runner work.
2. **f64 has no failure rendering.** `std:fmt` defers shortest-round-trip
   f64→string (std-design D4), so `vltShow` renders an f64 operand as `<f64>` and
   the matcher `print`s both values instead, which the runner captures as the
   test's output. Closes when `std:fmt` grows the renderer.
3. **No per-test timings in the report.** The charter's sample output carries
   them. Omitted deliberately in v1 so the report is byte-deterministic and the
   meta-test can assert it whole; wasmtime epoch interruption (which the
   `$VL_PROFILE_GUEST` path already configures) is the mechanism when per-test
   TIMEOUTS land, and timings ride in with it.
4. **No `--no-capture`, no `dot`/`json` reporters, no watch mode.** All charter
   follow-ups; the capture is already structural (per-instance sink), so
   `--no-capture` is a host-side streaming switch when wanted.
5. **`beforeAll`/`afterAll` are absent.** `beforeEach`/`afterEach` ship;
   file-level one-shot setup is expressible today as module top-level code,
   which runs once at instantiation.
6. **A test file that imports another test file** merges both registries (whole-
   program merge), so the importer reports the imported file's tests too. Legal,
   surprising, and untested — treat `*.test.vl` as leaves.

## Measurement

`tests/vl_test_runner_test.ts` drives the real binary over
`tests/fixtures/vl-test/` (green, failing, trapping, non-compiling) and
`tests/fixtures/vl-test-parallel/` (four ~250 ms tests), asserting the report
text, all three exit codes, isolation-after-trap, `-t`, discovery (including that
a plain `.vl` and a bare `test.vl` are NOT collected and `node_modules` is not
walked), and that `--jobs 4` finishes in under 70% of `--jobs 1`'s wall clock.
