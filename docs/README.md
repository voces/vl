# VL docs

Two tiers by audience. `README.md` (repo root) is the entry point; `ROADMAP.md`
(forward plan), `DECISIONS.md` (why), and `CHANGELOG.md` (shipped log) live at the
root. Agent operating instructions are `AGENTS.md` / `CLAUDE.md` at the root.

## High-level — using VL (`guide/`)

The language and CLI as a user mental model.

- [`guide/soundness.md`](guide/soundness.md) — the type-safety guarantees.
- [`guide/narrowing.md`](guide/narrowing.md) — flow narrowing (`is` / `?.` / null).
- [`guide/unions.md`](guide/unions.md) — union types and variant discrimination.
- [`guide/collections-design.md`](guide/collections-design.md) — `T[]` / `Map` / `Set` syntax and semantics.
- [`guide/strings-design.md`](guide/strings-design.md) — string representation and API.
- [`guide/lambda-param-skip-design.md`](guide/lambda-param-skip-design.md) — lambda param-skip ergonomics.
- [`guide/language-todo.md`](guide/language-todo.md) — language feature backlog.

## Low-level — developing VL (`internals/`)

Compiler internals, self-hosting, contributor and agent process.

- [`internals/cli-design.md`](internals/cli-design.md) — the `vl` command-queue pump.
- [`internals/genesis-design.md`](internals/genesis-design.md) — seed bootstrap and lineage.
- [`internals/codegen-architecture.md`](internals/codegen-architecture.md) — wasm emitter architecture.
- [`internals/codegen-builder-migration-plan.md`](internals/codegen-builder-migration-plan.md) — emitter builder refactor plan.
- [`internals/monomorphization-design.md`](internals/monomorphization-design.md) — generic instantiation.
- [`internals/modules-design.md`](internals/modules-design.md) — module system (`import`/`export`).
- [`internals/native-modules-design.md`](internals/native-modules-design.md) — module resolution in the native build.
- [`internals/incremental-build-design.md`](internals/incremental-build-design.md) — build caching.
- [`internals/std-design.md`](internals/std-design.md) — embedded `.vl` std and the `std:` scheme.
- [`internals/test-runner-design.md`](internals/test-runner-design.md) — `vl test` design.
- [`internals/binaryen-transition.md`](internals/binaryen-transition.md) — binaryen's role off V8.
- [`internals/wasm-toolchain-audit.md`](internals/wasm-toolchain-audit.md) — wasm toolchain survey.
- [`internals/wasmtime-parity.md`](internals/wasmtime-parity.md) — wasmtime execution parity.
- [`internals/deno-deprecation.md`](internals/deno-deprecation.md) — removing Deno.
- [`internals/selfhost-gaps.md`](internals/selfhost-gaps.md) — self-host front-end gaps.
- [`internals/selfhost-g2-spec.md`](internals/selfhost-g2-spec.md) — wasm binary-format spec.
- [`internals/selfhost-lambdas-design.md`](internals/selfhost-lambdas-design.md) — closures / HOFs in the emitter.
- [`internals/selfhost-numeric-types-design.md`](internals/selfhost-numeric-types-design.md) — numeric-type emission.
- [`internals/selfhost-spans-design.md`](internals/selfhost-spans-design.md) — source-position threading.
- [`internals/selfhost-name-section.md`](internals/selfhost-name-section.md) — wasm name-section emission.
- [`internals/selfhost-print-emit-plan.md`](internals/selfhost-print-emit-plan.md) — `print` emission staging.
- [`internals/selfhost-corpus-paydown-findings.md`](internals/selfhost-corpus-paydown-findings.md) — emitter coverage notes.
- [`internals/vl-tech-debt.md`](internals/vl-tech-debt.md) — remaining cleanups and limitations.
- [`internals/vl-dogfooding-notes.md`](internals/vl-dogfooding-notes.md) — dogfooding friction notes.
- [`internals/agent-playbook.md`](internals/agent-playbook.md) — agent operating playbook.
- [`internals/agent-pr-watch.md`](internals/agent-pr-watch.md) — PR-watch runbook.
