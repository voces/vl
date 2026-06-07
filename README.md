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

## Building the Native Binary

`deno task compile` produces a standalone `vl` binary in `dist/` via `deno compile`. The binary
embeds the compiler, the `npm:binaryen@130` wasm toolchain (a ~92 MB Emscripten build with the
wasm payload inlined as base64), and all TypeScript sources — no Deno or network access is needed
at runtime.

```sh
deno task compile          # build dist/vl (host platform)
deno task smoke            # verify: run, build, check all work inside the binary
./dist/vl hello.vl         # use the compiled binary directly
```

Cross-compilation (for release artifacts):

```sh
deno run -A scripts/build-binary.ts --target x86_64-apple-darwin
deno run -A scripts/build-binary.ts --all     # all five supported targets
```

The `dist/` directory is `.gitignore`d — don't commit the built binary. See `DECISIONS.md`
("Parser, distribution & bootstrapping") for the flag rationale (`--node-modules-dir=none
--no-lock` keeps the binary from embedding unused LSP packages).

## GitHub Syntax Highlighting

`.vl` files are highlighted on GitHub as **TypeScript** via a `.gitattributes`
`linguist-language` override (VL is not a registered Linguist language).

**Why TypeScript?** VL's token set is closest to TypeScript: shared keywords
(`function`, `let`, `const`, `type`), generic angle-brackets (`<T>`), union
types (`A | B`), intersection (`A & B`), negation (`!A`), optional chaining
(`?.`), null-coalesce (`??`), `//`/`///` comments, double-quoted strings,
single-quoted char literals, `0x`/`0b`/`0o` numeric prefixes with `_`
digit-separators, and `is`-narrowing that reads like a TS type predicate.

**Runner-up:** Kotlin — also has `fun`-adjacent `function`-like declarations and
structural types, but its object/lambda syntax and comment conventions diverge
more from VL than TypeScript's do.

**Stats note:** `.vl` is also marked `linguist-detectable=false` so the
TypeScript percentage in the repo stats bar is not inflated by VL sources.
Remove that line in `.gitattributes` if you want `.vl` counted in the bar.

To switch to a different base grammar, change the `linguist-language=TypeScript`
line in `.gitattributes` — the [Linguist language list](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml)
has the canonical names. Reference: [github-linguist/linguist docs/overrides.md](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md).
