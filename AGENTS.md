# AGENTS.md — bootstrap for VL

VL / Vital is a scripting-feel language with types **hidden by aggressive inference**, structural,
fully type-safe, compiling to **WebAssembly (WasmGC)**. This file is the fast-start for an agent
working in this repo.

## Pipeline & layout

`source → hand-written lexer/parser → typed AST (compiler/ast.ts) → typecheck.ts (type algebra) →
toWasm.ts (binaryen WasmGC codegen) → wasm`. The headless entry point is `compile(source)` in
`compiler/compile.ts`.

- `compiler/` — the language core (compile, the parser, toAST, typecheck, toWasm, defaultScope).
- `lsp/` — VS Code extension + LSP server over the core (`lsp/src/server.ts`).
- `tests/` — the `.vl` corpus (`tests/cases/**`) + the runner (`tests/run.ts`).
- `samples/`, `docs/`, `reference/` (retired ts-interpreter, excluded from lint/test).

The parser is **hand-written** (`compiler/lexer.ts` + `compiler/parser.ts`) — no antlr, no grammar
file; the lexer/parser are the grammar.

## Commands

- **Gate (run all three after changes):**
  - `deno check compiler/*.ts tests/run.ts` — type-check the core + test runner.
  - `deno lint` — lint (excludes `reference/`).
  - `deno task test` — the `.vl` corpus (the behavior oracle).
- **Run / build / check a file:** `deno task run <file.vl>` · `deno task build <file> [-o out.wasm] [--wat]`
  · `deno task check <file>`. Also `deno task run -e "<snippet>"` or pipe stdin.
- **After ANY compiler change, rebuild the LSP bundle:** `cd lsp && deno task build` (the compiler core
  is bundled into the LSP; `lsp/dist` is gitignored). CI also builds it.

## Hard constraints

- **The compiler core is dual-runtime** — bundled into both the Deno CLI and the Node LSP server. Keep
  `compiler/*.ts` **side-effect-free** with **no unguarded `Deno`/`process` globals**. Runtime-specific
  code lives in `compiler/cli.ts` (Deno) and `lsp/` (Node).
- **WasmGC** is the allocation model; lean on binaryen's optimizer (Heap2Local) rather than hand-rolling
  scalarization. See `DECISIONS.md`.

## Adding a test

Drop a `.vl` file under `tests/cases/<area>/` with `// @directive` comments at the top:
`// @run` (compile + run), `// @log TEXT` (assert the Nth log line), `// @error TEXT` (assert an error
diagnostic contains TEXT; `// @error at L:C TEXT` for position), `// @warning TEXT`. The runner is
strict-by-default (an unexpected error fails the test).

To assert a value, use `print(x)` (logs any printable type; booleans render as `true`/`false`). The
raw `__store_*__`/`__log__` API is reserved for tests that exercise the memory builtins themselves.

## Where things live (read these first)

- **`ROADMAP.md`** — the forward plan: what's next, dependencies, what's REMAINING per item.
- **`DECISIONS.md`** — the durable *why* behind non-obvious choices (no-`this`/`self`, null-only `?.`,
  structural `==`, WasmGC, emit-direct self-hosting, …).
- **`docs/unions.md`**, **`docs/narrowing.md`** — mental models for the two subtle subsystems.

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

### Comments

Comments are **evergreen** — write them for a future reader of the current code. Do **not** put
history or changelog in comments: no "now exists", "previously", "was changed to", "temporary
until", or PR/issue references. That belongs in commits, the PR description, or `CHANGELOG.md`.
