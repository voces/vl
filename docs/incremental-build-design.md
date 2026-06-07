# VL incremental builds & caching

> Status: **design — open for review.** One piece is already implemented and
> landed (L0: the content-addressed build-cache primitive + the self-host test
> cache that rides on it); everything past L1 is proposal. This doc is the place
> to weigh alternatives before committing — the final word lands in
> `DECISIONS.md` at implementation time (same convention as
> `docs/modules-design.md` / `docs/collections-design.md`).
>
> Reviewed leanings so far: **L4 should be a dev-vs-release split** (incremental
> per-module dev builds; whole-program optimized release builds). Priorities
> across the other layers are still open.

## Why this exists

Three loops dominate VL ergonomics, and all three pay to recompile work that
didn't change:

1. **Developing VL** (editing `compiler/*.ts` / `compiler/*.vl`, then
   `deno task test`). The self-host tests recompile a large concatenated
   compiler module through the full pipeline once per sub-test — ~19 whole
   compiles, ~1.4 s each.
2. **Developing *in* VL** (`vl run` / `vl build` / the playground / the LSP on a
   `.vl` project). Every invocation recompiles the whole program from scratch,
   even for a one-line edit.
3. **CI** (GitHub Actions). Each run starts cold: re-resolves Deno deps, and runs
   the full test suite with no reuse from prior runs.

The throughline: VL compilation is **deterministic** — a given (source, compiler)
always produces the same wasm — but **monolithic** — there are no boundaries at
which partial results can be reused. This doc is about adding (a) caching at the
boundaries that already exist, and (b) the boundaries themselves where they
don't.

### The core obstacle: no codegen boundaries

`compile(source)` is two phases (measured on the self-host module, warm):

| Stage | Cost | Pure function of… | Reusable per unit? |
|---|---:|---|---|
| lex + parse | ~part of 60 ms | file bytes | **yes**, per file |
| typecheck / resolve (`checkOnly`) | ~part of 60 ms | whole program (scopes resolved program-wide) | only with **module interfaces** |
| IR-build (`toWasm`) | ~780 ms | whole AST | only with **separate compilation** |
| `m.optimize()` | ~610 ms | whole module (global: inline, DCE) | **no** (inherently whole-module) |
| emit | ~6 ms | module | n/a |

Even the module system (`compileProgram` / `compiler/modules.ts`) **merges every
module into one AST and emits one wasm**, and `optimize()` is a whole-module pass.
So today "isolated change → isolated recompile" is *impossible at the codegen
level*: any change re-runs IR-build + optimize over everything.

Two distinct levers follow from that table:

- **Artifact caching** (cheap, available now): content-address the *whole* output
  so "nothing relevant changed" rebuilds are instant. Helps loops 1–3 enormously
  on unchanged inputs; does nothing for "one function changed."
- **Splitting** (the real incrementality): introduce module boundaries into
  codegen so a changed module — and only its dependents — recompiles. This is the
  big architectural commitment and trades away cross-module optimization in dev.

## Design principles (apply to every layer)

1. **Determinism is the contract.** Only cache stages that are pure functions of
   declared inputs. If a stage reads ambient state (env, clock, FS order), it is
   either made deterministic or not cached.
2. **The compiler is always part of the key.** Every cache key folds in a
   *compiler fingerprint* so output produced by one compiler is never served to
   another. Correctness beats hit-rate: a coarse fingerprint that over-invalidates
   is acceptable; a fingerprint that misses an input is a correctness bug.
3. **Content-addressed, not timestamp-addressed.** Keys are hashes of content, so
   the cache is safe to share across machines/branches/CI and immune to
   `git checkout` mtime churn.
4. **Cache is an optimization, never a source of truth.** A corrupt/missing entry
   must degrade to a recompile, never to a wrong build. Writes are atomic.
5. **Dev vs release.** Fast/incremental is the *dev* default; maximal/whole-program
   optimization is an explicit *release* mode. (Decided direction for L4.)

## What's already landed (L0)

`compiler/buildCache.ts` — a Deno-only dev/build layer (peer to `cli.ts`; the
runtime-agnostic core stays Deno-free):

- `compilerFingerprint()` — memoized SHA-256 of every `compiler/**/*.ts` plus the
  `deno.json`/`deno.lock` dependency pins.
- `cacheKey(...parts)` — a key with that fingerprint always folded in.
- `readCachedBlob` / `writeCachedBlob` — atomic content-addressed blob store under
  `<tmpdir>/vl-cache` (`VL_CACHE_DIR` override, `VL_NO_CACHE` bypass).

`tests/_selfhost_cache.ts` rides on it: warm `deno task test` ≈ 5 s (vs ~16 s),
suite green; a one-line edit to any `compiler/*.ts` busts the cache (verified).

**Known limitation by design:** the fingerprint is coarse — *any* compiler edit
invalidates *every* entry. Fine for the test loop; the motivation for finer keys
(L3/L4) is precisely to stop a `toWasm.ts` edit from re-doing front-end work that
didn't depend on it.

---

## The layered roadmap

Each layer is independently shippable and built on L0.

### L1 — CI plumbing (cheap, no architecture change)

**Goal:** stop CI starting cold.

**Approach.** `.github/workflows/ci.yml` today caches *npm* (via `setup-node`) but
not Deno's module cache, and keeps nothing between runs:

- Cache `DENO_DIR` (`~/.cache/deno`) keyed on `deno.lock` — avoids re-downloading
  esbuild, the jsr loader, and re-resolving `npm:binaryen` every run.
- Persist the build cache (`<tmpdir>/vl-cache`) via `actions/cache`, keyed on the
  compiler fingerprint with a restore-key prefix so a partial/older cache can
  still seed a run.

**Alternatives.**
- *`denoland/setup-deno` built-in cache* vs *manual `actions/cache` on `DENO_DIR`.*
  Built-in is less config; manual gives explicit key control. Lean: built-in for
  deps, manual `actions/cache` for the VL build cache.
- *Cache key = fingerprint* (busts on any compiler change → compiler PRs get no
  test speedup) vs *finer keys* (needs L3/L4). For L1, accept the coarse key; it
  still helps the large fraction of PRs that touch only corpus/docs/tests.

**Effort:** low. **Risk:** low (cache is advisory). **Payoff:** every
compiler-unchanged PR + all of `master` CI goes warm; meaningful wall-clock and
runner-minute savings.

### L2 — `vl build` / `vl run` artifact cache

**Goal:** the "developing *in* VL" loop — re-running an unchanged program is
instant.

**Approach.** Wrap the CLI's `compileFile` so the emitted wasm **and source map**
are cached, keyed on the compiler fingerprint + the program's full input.
- *Single file:* key on the file's content.
- *Multi-file (`import`):* key on the content of **all reachable modules** (walk
  the same import graph `compileProgram` resolves). Missing any input here is a
  correctness bug (principle 2), so the safe v1 hashes the whole reachable set.

**Alternatives.**
- *Cache only `vl build` output* vs *also `vl run`.* `run` benefits most (tight
  loop) but must also cache the source map for trap→source mapping. Lean: both,
  caching `{ wasm, sourceMap }`.
- *Where to store:* `<tmpdir>/vl-cache` (shared, ephemeral) vs a project-local
  `.vl/cache` (survives reboots, per-checkout, gitignored). Lean: project-local
  for `vl`, configurable via `VL_CACHE_DIR`.

**Effort:** low–medium. **Risk:** medium — end-user correctness; the multi-file
key must be exhaustive. **Payoff:** instant no-op rebuilds for VL projects.

### L3 — front-end (parse + typecheck) cache & incremental checking

**Goal:** snappier LSP + `vl check`, and rechecking only what changed.

**Approach.** Cache the front-end result (tokens / AST / diagnostics / symbols)
per file content. Then build a **dependency graph** from imports and, on a change,
recheck the changed file plus its **dependents** — where a dependent only needs
rechecking if the changed file's **public interface** changed, not its body
(interface fingerprinting). The LSP already calls `checkOnly`/`parseSymbols` per
keystroke; an in-memory per-document cache is the first win, the on-disk +
cross-file graph the second.

**Alternatives.**
- *In-memory only (LSP session)* vs *on-disk (shared with CLI).* Both; in-memory
  first (simplest, biggest LSP win).
- *Recheck all dependents on any change* vs *interface-hash gate.* The gate is the
  whole point of incrementality but needs a well-defined module interface (ties
  into `docs/modules-design.md`). Lean: ship dependents-on-any-change first,
  add the interface gate with the module work.

**Effort:** medium. **Risk:** medium (AST/symbol objects must be safely
serializable or kept in-memory; span/offset correctness). **Payoff:** editor
latency; fast project-wide `check`.

### L4 — separate compilation (true codegen splitting)

**Goal:** the actual "isolated change → isolated recompile" at the codegen level.

**Approach.** Compile each module to its **own** wasm, cached by
`hash(module source + dependency *interface* hashes + compiler fp + flags)`; on a
change, only that module and its transitive dependents recompile; the rest are
served from cache and **relinked**. Per principle 5, this is the **dev** path;
a **release** build keeps today's whole-program merge+optimize for maximal output.

**The hard part — WasmGC cross-module identity.** VL's values are WasmGC
structs/arrays. Today all types live in one module's type section, so structural
identity is trivial. Splitting means two separately-compiled modules must agree on
the *same* GC types and on a calling convention for cross-module functions. Options:

- **(a) Runtime linking of many wasm modules.** Each VL module → one wasm module;
  shared GC types via wasm type imports / a shared rec group; cross-module calls
  via function imports/exports. *Pro:* genuine separate compilation; smallest
  recompile unit. *Con:* WasmGC type-sharing across modules is bleeding-edge and
  toolchain-dependent; a multi-module artifact conflicts with the H-M2 end-state
  ("the whole compiler is *one* wasm module", `docs/modules-design.md`).
- **(b) Cache per-module *binaryen IR / pre-optimize* fragments, merge + optimize
  at build.** Keep one final module, but skip re-*building* IR for unchanged
  modules by caching a serialized per-module IR slice, then run one whole-program
  optimize. *Pro:* one output module (fits H-M2); recovers the ~780 ms IR-build
  incrementally. *Con:* still one whole-module optimize (~610 ms) every build —
  partial incrementality; binaryen IR isn't trivially serializable across module
  instances, so this may mean caching emitted-then-reparsed wasm fragments.
- **(c) Per-module optimize + lightweight final link, accept no cross-module
  inlining in dev.** Each module optimized independently and cached; dev builds
  link them with minimal global optimization; release builds do (a-less) whole
  program. *Pro:* both IR-build *and* optimize become incremental in dev. *Con:*
  dev/release output diverges more; needs the linking story from (a).

**Open architectural question:** reconcile "many modules" incrementality with the
H-M2 "one wasm module" goal. (b) is the most compatible (always one module) but
the least incremental on optimize; (a)/(c) are the most incremental but pull
against single-module distribution. This is the crux to settle before building L4.

**Effort:** high (multi-week). **Risk:** high. **Payoff:** the real prize — edit
one module, rebuild only it + dependents.

---

## Cross-cutting concerns

- **Cache location & eviction.** L0 uses `<tmpdir>/vl-cache`; stale entries
  accumulate (each compiler change orphans the old set). v1 leaves them (tmp is
  ephemeral, blobs are small). A size/age-bounded GC (LRU by mtime) is a later
  nicety; project-local `.vl/cache` (L2) wants it more than tmp does.
- **Fingerprint granularity.** L0's whole-compiler fingerprint is the correctness-
  first choice. Finer fingerprints (key a compile only on the compiler *stages it
  used*) raise hit-rate for compiler PRs but risk under-keying; defer until the
  stage boundaries (L3/L4) make "which stages" well-defined.
- **Determinism audit.** Before caching any stage, confirm it doesn't depend on
  `Deno.readDir` order, map iteration order, timestamps, or absolute paths baked
  into output (e.g. source-map `sources`). The self-host cache already relies on
  `compile()` being deterministic; widening the cache widens that requirement.
- **Concurrency.** Parallel test workers / parallel module compiles may produce
  the same key at once; atomic temp+rename (L0) makes that safe. Same-key races
  just write identical bytes.
- **Observability.** A `VL_CACHE_STATS` (hit/miss/written counts) would make
  regressions visible and is cheap to add alongside L1.

## Open questions

1. **L4 module model** — (a) multi-module runtime linking vs (b) cached IR
   fragments + one optimize vs (c) per-module optimize + link. Gated on the H-M2
   single-module commitment.
2. **Interface fingerprinting** — what exactly is a module's "public interface" for
   the dependents-gate (exported signatures + exported types + transitively-exposed
   types)? Shared with `docs/modules-design.md`.
3. **Cache home for `vl`** — project-local `.vl/cache` vs user cache dir vs tmp;
   gitignore + docs implications.
4. **Priority order** — L1 (CI) and L2 (CLI) are the cheapest big wins; L3 helps
   the editor; L4 is the architecture. Sequence TBD.

## Decision log

- *(pending)* L4 direction: **dev-vs-release modes** (reviewed leaning) — exact
  module model (a/b/c) still open.
