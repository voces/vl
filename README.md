# VL / Vital

A scripting-feel, structurally-typed language with **types hidden by aggressive
inference**, compiling to lean **WebAssembly** (WasmGC). Ships an LSP-backed editor
experience, a CLI, and an in-browser playground. See [`ROADMAP.md`](./ROADMAP.md) for
the plan and [`DECISIONS.md`](./DECISIONS.md) for the rationale; design notes live in
[`docs/`](./docs).

**VL is self-hosted.** The compiler is written in VL ([`compiler/*.vl`](./compiler)),
compiled to a WebAssembly *seed* (`build/vl-compiler.wasm`), and run through a thin
Rust host ([`scripts/vl-host`](./scripts/vl-host)) — an OS/wasmtime shim that never
parses or types VL itself. See [`docs/genesis-design.md`](./docs/genesis-design.md)
for how the seed is bootstrapped.

## Quick start (native)

You need **Rust** (for the host) and a **compiler seed**. For a sandboxed,
batteries-included environment (node + deno + rust + Claude behind a network
firewall, safe for `claude --dangerously-skip-permissions`), see the
[Dev Container](./.devcontainer/README.md).

```sh
# 1. Build the native `vl` host (~once)
cargo build --release --manifest-path scripts/vl-host/Cargo.toml

# 2. Get a compiler seed into build/vl-compiler.wasm
scripts/fetch-seed.sh           # download the published compiler seed
#   …or, from a source checkout with an existing seed:
scripts/refresh-compiler.sh     # self-compile compiler/*.vl with the seed (~3s)

# 3. Run a program
echo 'print(6 * 7)' > hello.vl
scripts/vl-host/target/release/vl run hello.vl
```

Put the host on your `PATH` for convenience:

```sh
export PATH="$PWD/scripts/vl-host/target/release:$PATH"
vl run hello.vl
```

## The `vl` tool

```
usage: vl <build|check|run|fmt> <file.vl> [-o out.wasm] [-w|--check] [--compiler vl-compiler.wasm]
```

The compiler seed is resolved in order:
`--compiler <path>`  →  `$VL_COMPILER_WASM`  →  `./build/vl-compiler.wasm`.

| Command | What it does |
|---|---|
| `vl run <file.vl>` | Compile and run; program output goes to stdout. |
| `vl build <file.vl>` | Compile to WebAssembly (`-o <out.wasm>`). |
| `vl check <file.vl>` | Type-check + report diagnostics only; non-zero exit on error (CI gate). |
| `vl fmt <path>` | Format (AST-driven, via `format.vl`): stdout, `-w` write in place, `--check` CI gate, dirs recurse. |

The brains live in VL (the seed); `vl` is a thin host. A `test` subcommand is planned (see
[`docs/test-runner-design.md`](./docs/test-runner-design.md)). Some richer `cli.ts` conveniences
aren't ported to `vl` yet (`run -e`/stdin, `build --wat`, `check` over a dir / `--fix` / `--severity`) —
run those via `deno run -A compiler/cli.ts …` for now.

## Self-hosting & bootstrap

The compiler compiles *itself*: the seed compiles the current `compiler/*.vl` into a
new seed, and the result is a byte-for-byte fixpoint.

```sh
scripts/refresh-compiler.sh     # rebuild the seed from current source (self-compile)
scripts/native-fixpoint.sh      # prove stage3 == stage4 byte-identical
```

The *first* seed (genesis) is fetched from a published release artifact via
`scripts/fetch-seed.sh` (`--ts-genesis` is an offline break-glass). Full design in
[`docs/genesis-design.md`](./docs/genesis-design.md).

## Developer tooling (deno)

The test suite, the LSP, and the playground run on **deno + npm**. Install pinned deps
once, then use the tasks:

```sh
deno task install               # = npm ci
```

| Task | What it does |
|---|---|
| `deno task test` | Run the suite (`tests/` — the `.vl` corpus + unit tests). |
| `deno task playground` | Build the in-browser playground (Monaco + client-side LSP) and serve it. |
| `deno task playground:build` / `:verify` | Build / verify just the playground bundle. |

### Editor (LSP)

The language server lives in [`lsp/`](./lsp). It type-checks via the wasm seed in-process,
selectable with the `vital.checker` setting (`ts | wasm | both`).

## Repository layout

| Path | Contents |
|---|---|
| [`compiler/`](./compiler) | The self-hosted compiler — `lexer.vl`, `parser.vl`, `typecheck.vl`, `wasmEmit.vl`. |
| [`scripts/vl-host/`](./scripts/vl-host) | The Rust `vl` host (wasmtime embedding). |
| [`scripts/`](./scripts) | Bootstrap + fixpoint scripts (`fetch-seed.sh`, `refresh-compiler.sh`, `native-fixpoint.sh`). |
| [`std/`](./std) | The VL standard library (`std:` modules, e.g. `std:fmt`). |
| [`tests/`](./tests) | The `.vl` corpus (`tests/cases/`) + unit/integration tests. |
| [`lsp/`](./lsp) · [`playground/`](./playground) | Editor server and in-browser playground. |
| [`docs/`](./docs) | Design notes (genesis, std, test-runner, native-modules, …). |
