# VL / Vital

A scripting-feel, structurally-typed language with **types hidden by aggressive
inference**, compiling to lean **WebAssembly** (WasmGC). Ships an LSP-backed editor
experience, a CLI, and an in-browser playground. See [`ROADMAP.md`](./ROADMAP.md) for
the plan and [`DECISIONS.md`](./DECISIONS.md) for the rationale; design notes live in
[`docs/`](./docs).

## Setup

Dependencies are npm packages (binaryen, the LSP libs, Monaco for the playground):

```
deno task install      # = npm ci  (one-time / after pulling dep changes)
```

The `playground` tasks run `npm install` automatically, so they work without a separate
setup step.

## Tasks

Run with `deno task <name>`.

| Task | What it does |
|---|---|
| `run <file.vl>` | Compile and run a `.vl` file (`-e "<src>"` for inline, or pipe stdin). |
| `build <file.vl>` | Compile to a `.wasm` (`-o <out>`, `--wat` for a text dump). |
| `check [path]` | Diagnostics only (type errors + lint), no run; CI exit code. `--exclude <glob>`, `--severity <level>`, `--concise`. |
| `fmt [path]` | AST-driven formatter (stdout / `-w` write / `--check` gate). |
| `test` | Run the test suite (`tests/` — the `.vl` corpus + unit tests). |
| `compile` | Build the native `vl` binary (`deno compile`, binaryen embedded). |
| `smoke` | Smoke-test the compiled binary. |
| `perf` | Run the performance harness. |
| `install` | `npm ci` — install pinned dependencies. |
| `playground` | Build the in-browser playground (Monaco + client-side LSP) and serve it. |
| `playground:build` | Build the playground bundle only. |
| `playground:verify` | Verify the playground bundle builds and its providers are wired. |

The shipped CLI binary is `vl`; `vl help` lists its commands. CI runs
`deno check compiler/*.ts tests/cases_test.ts`, `deno lint`, `deno task test`, and the
LSP build.
