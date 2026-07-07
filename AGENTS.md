# AGENTS.md — bootstrap for VL

VL / Vital is a scripting-feel language with types **hidden by aggressive inference**, structural,
fully type-safe, compiling to **WebAssembly (WasmGC)**. This file is the fast-start for an agent
working in this repo.

## Pipeline & layout

`source → compiler/lexer.vl → compiler/parser.vl (hand-written AST, compiler/ast.vl) →
compiler/typecheck.vl (type algebra) → compiler/wasmEmit.vl + emit_*.vl (WasmGC codegen) → wasm`.
The self-hosted compiler (`compiler/*.vl`) is itself compiled to a wasm *seed*
(`build/vl-compiler.wasm`); a thin native Rust host (`scripts/vl-host`, over wasmtime) embeds that
seed and drives it through a source-in/bytes-out ABI (`compiler/driver.vl`, re-exported under bare
names by `compiler/entry.vl`) — every `vl run`/`build`/`check`/`fmt` invocation shells through this
host.

- `compiler/` — the self-hosted compiler (`*.vl`: lexer, parser, ast, typecheck, wasmEmit/emit_*,
  lint, format, driver, entry, cli). The only `.ts` left are the dependency-free type leaves
  `coreTypes.ts`/`diagnostics.ts`, imported by the LSP + browser playground.
- `scripts/vl-host/` — the native Rust host that embeds the wasm seed and exposes the `vl` CLI.
- `lsp/` — VS Code extension + LSP server over the seed (`lsp/src/server.ts`).
- `tests/` — the `.vl` corpus (`tests/cases/**`) + the runner (`tests/run.ts`).
- `docs/`, `reference/` (retired ts-interpreter, excluded from lint/test).

The parser is **hand-written** (`compiler/lexer.vl` + `compiler/parser.vl`) — no antlr, no grammar
file; the lexer/parser are the grammar.

## Commands

- **Gate (run after changes):**
  - `deno check compiler/*.ts` — type-check the TS leaves (`coreTypes.ts`/`diagnostics.ts`).
  - `deno lint` — lint (excludes `reference/`).
  - `deno task test` — the test suite, including the `.vl` corpus (`tests/cases_wasm_test.ts`, the behavior oracle).
  - After a `compiler/*.vl` change: `scripts/refresh-compiler.sh` (rebuild the seed),
    `scripts/native-fixpoint.sh` (byte-exact self-compile), `scripts/lint-self.sh`
    (self-lint + fmt-check) — the CI `ci-native` job runs all three.
- **Run / build / check / fmt a file:** the native `vl` binary (`scripts/vl-host`, built with
  `cd scripts/vl-host && cargo build --release`): `vl run <file.vl>` (also `-e "<src>"` / stdin /
  a prebuilt `.wasm`) · `vl build <file> [-o out.wasm]` · `vl check <path>` · `vl fmt <file> [-w|--check]`.
  `vl build` also takes `-O` (optimize) and `--wat` (text dump) — both shell out to binaryen
  (`wasm-opt`/`wasm-dis`; `brew install binaryen`), soft no-op when absent. `vl check` reports errors
  + lint (warnings/hints), `--severity <level>` (gate + display floor), `--concise`, `--codegen`,
  `--fix` (the `prefer-const` lint fix), and takes a file OR a
  directory (recursive; `vl check` ≡ `vl check .`; `--exclude <glob>`). `vl` is a command-queue
  pump — all CLI policy is VL (`compiler/cli.vl`); see [`docs/internals/cli-design.md`](docs/internals/cli-design.md).
- **After ANY compiler change, rebuild the LSP bundle:** `cd lsp && deno task build` (the compiler core
  is bundled into the LSP; `lsp/dist` is gitignored). CI also builds it.

## Hard constraints

- **The TS compiler is gone — the compiler is `compiler/*.vl` (the wasm seed).** The TS front end was
  deleted; only the dependency-free type leaves `compiler/coreTypes.ts` + `compiler/diagnostics.ts`
  remain (the diagnostic/position vocabulary the Node LSP and browser playground import — both drive
  the seed for all checking). Keep those leaves **side-effect-free** with **no `Deno`/`process`
  globals**. The shipping CLI is the native Rust host (`scripts/vl-host`); language/semantics changes
  land once, in the `.vl` source.
- **WasmGC** is the allocation model; lean on binaryen's optimizer (Heap2Local) rather than hand-rolling
  scalarization. See `DECISIONS.md`.

## Adding a test

Drop a `.vl` file under `tests/cases/<area>/` with `// @directive` comments at the top:
`// @run` (compile + run), `// @log TEXT` (assert the Nth log line), `// @error TEXT` (assert an error
diagnostic contains TEXT; `// @error at L:C TEXT` for position), `// @emit-error TEXT` (assert the
full compile fails at the EMIT stage with a message containing TEXT — pins the emitter's fail-loudly
rejects, which `@error` cannot), `// @warning TEXT`. The runner is
strict-by-default (an unexpected error fails the test).

To assert a value, use `print(x)` (logs any printable type; booleans render as `true`/`false`). The
raw `__store_*__`/`__log__` API is reserved for tests that exercise the memory builtins themselves.

## Where things live (read these first)

- **`ROADMAP.md`** — the forward plan: what's next, dependencies, what's REMAINING per item.
- **`DECISIONS.md`** — the durable *why* behind non-obvious choices (no-`this`/`self`, null-only `?.`,
  structural `==`, WasmGC, emit-direct self-hosting, …).
- **`docs/guide/unions.md`**, **`docs/guide/narrowing.md`** — mental models for the two subtle subsystems.

## Doc discipline (keep the roadmap maintainable)

The roadmap is *forward-looking*, not a changelog. When you finish work: set the roadmap item to a
**one-line done marker**; put any rationale in `DECISIONS.md`; put a subsystem mental-model in
`docs/` only if it genuinely aids future work. **Do not paste implementation narrative into
`ROADMAP.md`.**

**`DECISIONS.md` entries are terse (≈2–4 lines): the decision plus the "why X over Y" rationale and
any non-obvious trade-off — *not* an implementation walkthrough.** No code-path or function names, no
bug narratives, no step-by-step mechanics; those live in the code, the PR description, and git
history. Litmus: if it would change when the code is refactored (without changing the *decision*), it
doesn't belong here.

## Conventions

- End commit messages with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Branch from `master` (CI runs the gate + LSP build on PRs and on push to `master`).
- **Always open a PR for work you push, and auto-watch it** — don't leave finished work
  on an un-PR'd branch. Open the PR, subscribe to its activity, and follow it through
  until it is merged or closed (investigate CI failures and review comments; fix the
  small/clear ones, ask on anything ambiguous). The *how* (one `Monitor` over all open
  PRs, the notification tools, replying to review feedback) is in
  [`docs/internals/agent-pr-watch.md`](docs/internals/agent-pr-watch.md).

### Comments

Comments are **evergreen** — write them for a future reader of the current code. Do **not** put
history or changelog in comments: no "now exists", "previously", "was changed to", "temporary
until", or PR/issue references. That belongs in commits, the PR description, or `CHANGELOG.md`.
