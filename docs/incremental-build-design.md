# VL incremental builds & caching

> Status: **partially landed; direction revised after review.** Landed: L0 (the
> content-addressed cache primitive), the **binaryen-`optimize()` stage cache**
> (hardened), and **L1** (CI caching). L2–L4 are proposal. The final word lands in
> `DECISIONS.md` at implementation time (same convention as
> `docs/modules-design.md` / `docs/collections-design.md`).
>
> **Priority: test-run throughput.** The thing being optimized *right now* is the
> speed of `deno task test`, especially under **many parallel headless agents**
> (which run the suite, not the editor). Editor/LSP and end-user `vl build` latency
> are real future goals we must not design *against* — but they are **not** the
> current focus. Where this doc weighs a lever, weigh it by test wall-clock first.
>
> This revision incorporates an adversarial multi-persona review (compiler-cache,
> build-systems, WASM/small-language, editor/LSP, and reproducible-builds lenses).
> Conclusions flagged inline with **[review]**: the optimize cache is
> **CI/release/test infra, not a codegen-dev accelerator**; the biggest *test*
> levers are an **in-memory warm harness** and **profile-and-cut on IR-build**;
> L4's earlier "merge wasm fragments for free" idea is **really a linker** and is
> demoted in favour of a **per-monomorphic-instance codegen cache (option d)**; and
> the **interface hash is the load-bearing artifact** for L3/L4. The L4 direction is
> chosen so as not to foreclose fast compile/LSP later.

## Why this exists

Three loops pay to recompile work that didn't change. They are listed **in
priority order** for this effort:

1. **Test runs (PRIMARY).** `deno task test` while developing VL, and especially
   **many parallel headless agents** each running the suite. The self-host tests
   recompile a large concatenated compiler module through the full pipeline once
   per sub-test — ~19 whole compiles, ~1.4 s each — and that cost is paid by every
   agent. This is the loop to make fast. Two angles matter: per-run wall-clock, and
   **reuse across concurrent agents** (a shared content-addressed cache lets agent B
   reuse agent A's compiles when they're on the same compiler state).
2. **CI** (GitHub Actions) — the same suite, cold each run. Secondary but cheap to
   help (L1), and the optimize cache's natural home.
3. **Developing *in* VL / editor** (`vl run`/`vl build`, the LSP). Real future
   goals; **not** the current priority. Decisions here must not be made *against*
   eventual fast compile/LSP, but this work is deferred (see "Editor/compile —
   deferred").

The throughline: VL compilation is **deterministic** — a given (source, compiler,
toolchain) always produces the same wasm — but **monolithic**: there are no
boundaries at which partial results can be reused. This doc adds (a) caching at
the boundaries that already exist, and (b) the boundaries themselves where they
don't — while being honest about where caching is *not* the right lever.

### The core obstacle: no codegen boundaries

`compile(source)` is two phases (measured on the self-host module *with a driver*,
warm — this is the test workload):

| Stage | Cost | Pure function of… | Reusable per unit? |
|---|---:|---|---|
| lex + parse | part of ~60 ms | file bytes | **yes**, per file |
| typecheck / resolve (`checkOnly`) | part of ~60 ms | whole program (scopes resolved program-wide) | only with **module interfaces** |
| IR-build (`toWasm`) | ~780 ms (**~56%**) | whole AST | only with **separate compilation** |
| `m.optimize()` | ~610 ms (**~40%**) | whole module (global: inline, DCE) | by content (see optimize cache) |
| emit | ~6 ms | module | n/a |

Two facts the review sharpened:

- **IR-build, not optimize, is the bigger half.** optimize is ~40%; the optimize
  cache therefore caps at ~40% even on a perfect hit. For the *no-driver* library
  compile, optimize is nearly free (~tens of ms) and IR-build dominates entirely.
- Even the module system (`compileProgram` / `compiler/modules.ts`) **merges every
  module into one AST and emits one wasm** via a single `TypeBuilder`/rec-group, so
  GC type identity is currently "free" *because there is one type section*. This is
  load-bearing for the L4 discussion.

Two levers follow:

- **Artifact caching** (cheap, landed): content-address outputs so "nothing
  relevant changed" rebuilds are instant. Helps loops 1–3 on unchanged inputs;
  does nothing for "one function changed."
- **Splitting** (the real incrementality): make codegen reuse partial results when
  *part* of the program changed. **[review]** the right unit is the
  **monomorphic instance**, cached inside the existing single-module pipeline —
  not a separately-linked per-module wasm (see L4).

## Design principles

1. **Determinism is a *specified* contract, not an assumption.** Only cache stages
   that are pure functions of declared inputs, and *enforce* it (see
   "Determinism requirements"). Content-addressing rests entirely on this.
2. **The full toolchain is part of the key.** Every key folds in a fingerprint of
   the compiler **and** the toolchain (Deno version, os/arch) so output from one
   toolchain is never served to another. Correctness beats hit-rate; a fingerprint
   that *misses* an input is a correctness bug, an over-coarse one only wastes time.
3. **Content-addressed, not timestamp-addressed.** Hashes of content — safe across
   machines/branches/CI, immune to `git checkout` mtime churn.
4. **Cache is an optimization, never a source of truth.** A corrupt/missing entry
   degrades to a recompile, never a wrong build. Writes are atomic.
5. **Dev vs release is *provisional*.** **[review]** A fast dev mode + a fully
   optimized release mode is the assumed end-state, but it is only worth a
   permanent semantic fork if codegen can't be made incremental *within one mode*.
   Option (d) below may obviate it; do not commit to the split until L4 is decided.

## What's already landed

**L0 — the cache primitive.** `compiler/buildCache.ts`, a Deno-only dev/build
layer (peer to `cli.ts`; the runtime-agnostic core stays Deno-free):

- `compilerFingerprint()` — memoized SHA-256 of every `compiler/**/*.ts` (folded in
  by path **relative** to `compiler/`, so it's machine-independent) + the
  `deno.json`/`deno.lock` pins + the Deno version + `Deno.build.target`.
- `binaryenFingerprint()` — binaryen's integrity parsed from `deno.lock` **by key**
  (not a line grep) + os/arch.
- `cacheKey(...)`, `readCachedBlob`/`writeCachedBlob` — atomic content-addressed
  blob store under `<tmpdir>/vl-cache` (`VL_CACHE_DIR` override, `VL_NO_CACHE`).

**Whole-compile cache** (`tests/_selfhost_cache.ts`): keyed on source + the whole
compiler/toolchain. A full hit is free; busts on any compiler edit. Warm
`deno task test` ≈ 5 s (vs ~16 s).

**Optimize-stage cache** (`toWasm` `OptimizeCache` seam + `createOptimizeCache()`):
keys the `optimize()` result on `(unoptimized bytes ⊕ binaryen pin ⊕ os/arch)`.
Verified byte-identical (no-cache == miss == hit); survives compiler churn.

**L1 — CI caching** (`ci.yml`): caches `~/.cache/deno` (keyed on `deno.lock`) and
persists the build cache (in `${runner.temp}`, not the workspace) under a rolling
key.

## Why the optimize stage is cacheable — and what it is *not* for

The decisive observation (owner): **near-term commits almost all change the
compiler, but mostly *add features* rather than change existing programs' output.**
So:

1. Any cache keyed on a **compiler source fingerprint** (the whole-compile tier;
   any front-end or IR-build cache) is invalidated on nearly every commit.
2. But the **emitted bytes** of existing programs are usually unchanged by a
   feature-add — so a cache **content-addressed on those bytes** hits, *if* its
   transform's fingerprint is stable.

`optimize()` is the one stage whose transform depends on **nothing in
`compiler/*.ts`** — only on binaryen. Keying it on `(unopt bytes ⊕ binaryen)` is
both sound and churn-proof.

**[review] But be honest about its scope.** Two limits mean the optimize cache is
**CI/release/corpus infrastructure, not a develop-VL accelerator**:

- **The IR-build floor.** You must run IR-build (~56%) to *produce* the key bytes;
  the cache only saves the ~40% optimize pass.
- **Anti-correlation with the work.** During codegen development, the modules you
  edit are exactly the ones whose unopt bytes change → optimize *misses* on them.

It still earns its place for the test priority: **warm re-runs** (re-running the
suite after a non-codegen change, or after editing a test) and **cross-agent
reuse** (parallel agents on the same compiler state share hits) both benefit. What
it does *not* do is speed up the inner loop of hacking on `toWasm` itself — for that
the warm harness and IR-build profiling are the levers.

**[review] The test-throughput levers** (the primary goal — track these
*alongside* the landed caches, ranked by test wall-clock won per unit effort):

1. **In-memory warm harness — the highest-value test lever.** The self-host tests
   recompile the *same* concatenated base ~19× per suite run (only the small driver
   differs per sub-test). Within a test process, build the shared base once and
   reuse it across sub-tests (cache the parsed/checked base; ideally reuse the
   binaryen module up to the driver). This attacks the redundancy directly, **works
   even cold and even while editing `toWasm`** (unlike the disk optimize cache), and
   preserves optimizer coverage. Precedent: TS `tsserver`, Roslyn/Kotlin/Gradle
   daemons, `ghcid`. This is the F9b idea and should lead.
2. **Profile-and-cut IR-build.** The biggest historical win (`structSig`
   memoization, 3.6×) was a profile-and-cut, not a cache. IR-build is the bigger
   half and isn't churn-limited — find the next `structSig`. Helps every compile,
   including every agent's.
3. **Shared cache across parallel agents.** The landed content-addressed caches in a
   common `VL_CACHE_DIR` already let concurrent agents reuse each other's compiles
   when on the same compiler state (whole-compile hits) or same codegen output
   (optimize hits). Ensure agents point at one shared dir; add `VL_CACHE_STATS` to
   confirm cross-agent hit rates.
4. **`VL_NO_OPT` for tests** would skip optimize for the suite (~20–25 s) far more
   simply than caching it — the owner chose caching to preserve optimizer coverage.
   Given the test-first priority, the **middle path is worth revisiting**: skip
   optimize in most test files and keep *one* that exercises it on the self-host
   module for coverage. Cheapest large test win; flagged for decision.

---

## The layered roadmap

### L1 — CI plumbing (LANDED)

Caches Deno modules + the build cache (rolling key, content-addressed blobs).
Because optimize blobs survive compiler changes, feature-add PRs reuse master's
`optimize()` results. **[review] To do:** add `VL_CACHE_STATS` + a size-bounded
LRU sweep before the cache grows (GitHub's 10 GB LRU can evict mid-PR silently);
scope the persisted key to the toolchain so cross-runner reuse can't serve across
arch/Deno versions (now partly covered by folding os/arch into the fingerprints).

### Editor/compile — deferred (not the current priority) **[review]**

Recorded so we don't lose it and don't design against it, but **out of scope for
the test-throughput focus** (the LSP isn't on the test path). When editor latency
becomes the priority, the loop is one bug and one small cache away from good,
*independent of L3*:

1. **`lsp/src/server.ts` `onDidChangeContent` calls `compile()`** (full binaryen
   codegen, ~1.4 s) on every keystroke, using only `diagnostics`. It should call
   **`checkOnly()`** (~60 ms, binaryen-free). One-line fix, ~20× faster diagnostics;
   the LSP should never produce wasm at all. (Cheap enough to land opportunistically
   even now, but it does nothing for test runs.)
2. **Debounce** + **cancel** in-flight checks on a newer edit.
3. An **in-memory `CheckResult` cache keyed on `(uri, version)`**, shared across
   handlers.

L3 (front-end cache + incremental checking) is likewise deferred behind the test
work — but note its churn objection only applies to compiler devs, so it remains
valuable for the develop-*in*-VL audience when that becomes the focus.

### L2 — `vl build` / `vl run` artifact cache

Cache `{ wasm, sourceMap }` from `compileFile`, keyed on the toolchain fingerprint
+ the program's full input. **[review] Hard requirements before this is on by
default:**

- **Multi-file key completeness is a correctness invariant, not a comment.** The
  hashed set MUST equal the set the resolver reads (every transitively-imported
  module). A missed input → a stale build that passes — the Gradle `UP-TO-DATE`
  lie. Prove it (assert hashed-set == read-set), don't assume it.
- **Source maps must be project-relative** before they're cached, or a cached map
  carries another machine's absolute paths.
- **Discoverable escape hatches**: `vl build --no-cache` / `vl run --no-cache`
  surfaced in `vl help`, and a `vl cache clean` with a documented location. (env
  `VL_NO_CACHE`/`VL_CACHE_DIR` exist but aren't discoverable.)
- **Default location**: project-local `.vl/cache` (auto-gitignored on first write)
  or the user cache dir — decide and document. Consider **off-by-default** for end
  users until trusted.

### L3 — front-end cache & incremental checking

**[review] Reprioritized.** It was deprioritized because source-fingerprinted keys
churn — but *that argument is about developing VL, not writing VL*. A VL **user**
isn't editing `compiler/*.ts`, so their per-file front-end results are perfectly
stable and cacheable. For the develop-*in*-VL audience, incremental **checking**
matters more than any wasm cache.

- In-memory first (the LSP-immediates cache above), on-disk later.
- Recheck the changed file first and deliver its diagnostics immediately; recheck
  dependents in the background. A dependent only needs rechecking if the changed
  file's **interface hash** changed (early cutoff — see below).
- Prior art: rust-analyzer (salsa demand + early cutoff — adopt the *idea*, not the
  framework), gopls snapshots, the TS LanguageService, MoonBit's pre-codegen
  interface check.

### L4 — incremental codegen **[review, substantially revised]**

**Goal:** edit one function/module → recompile only it + dependents, *without*
giving up VL's single-output-module (H-M2) or its free GC type identity.

**Leading option (d): per-monomorphic-instance codegen cache, inside the existing
one-module pipeline.** Cache each monomorphic instance keyed on
`(generic-id, concrete type args, compiler fp)`; assemble cached + freshly-built
instances into the single `TypeBuilder`/one-module emit that exists today, then run
one whole-program `optimize()` (already cached). This is the Rust codegen-units /
serialized-MIR model. **Pros:** no linker; keeps H-M2 and free type identity
*exactly as today*; gives true "edit one function → rebuild that function + its
dependent instances" incrementality *within one mode* — which may remove the need
for a dev/release split. **Cons:** requires per-instance codegen boundaries inside
`toWasm`; still one whole-program optimize per build (the cached ~40%).

**Demoted options:**

- **(b) merge per-module *wasm fragments* via `readBinary`.** The earlier "types
  re-intern for free" claim is **wrong in general [review]**: only the type section
  re-interns. Function/global/type *indices*, table/elem & data segments, start
  functions, imports/exports, and name/debug sections are all index-relative, so
  merging N fragments is **a wasm linker** (`wasm-ld`/`wasm-merge`) that reintroduces
  whole-program relocation. "readBinary then re-optimize" *is* the linker path, not
  a shortcut. Grain hit exactly this WasmGC cross-module-index wall.
- **(a) runtime-link many wasm modules** and **(c) per-module optimize + link** —
  both produce a multi-module artifact that fights H-M2, and monomorphization makes
  true separate codegen mostly pointless (instances live at the use site).

**dev/release gate.** If a split is kept, verify it with **differential fuzzing**
(random valid VL → run dev-wasm vs release-wasm under wasmtime → diff observable
output + traps), *not* a corpus byte-identity assertion (which asserts the wrong
invariant and is blind to input-dependent divergence). VL's defined traps + minimal
UB make the two modes observationally equivalent for defined behavior — state that
invariant explicitly and fuzz it.

## The interface hash — the load-bearing artifact **[review, NEW]**

Both L3's early-cutoff and L4's per-unit keys depend on one thing: a hash that
changes when a module's **public contract** changes and *not* when only its body
does. Design it once, before L3/L4. Requirements:

- **Two tiers.** A *resilient sig-hash* (exported concrete signatures + exported
  types + transitively-exposed type shapes) gates dependent recompilation. A
  *body/unfolding-hash* covers exported **generics/inlinables**, whose bodies are
  part of dependents' codegen under monomorphization — these necessarily degrade
  toward source-hashing (GHC `.hi` unfoldings are the precedent and the warning).
  The dependents-gate fires on the sig-hash only.
- **Derived from typechecker output, before codegen** — never from wasm bytes, or
  any codegen change spuriously invalidates everything (Elm's early mistake;
  MoonBit/OCaml `.cmi` do it pre-codegen).
- VL's `export` keyword is the stable-surface primitive (OCaml's `.mli` lesson:
  an explicit interface stabilizes the ABI hash).

## Determinism requirements **[review, was an "audit", now a spec]**

Content-addressing is only sound if these hold; treat as hard requirements with a
`--verify-cache` mode (recompile, byte-compare) and a per-blob reproducibility
manifest (records the exact input hashes — also the basis for any future shared
cache's trust model):

- **No absolute paths** in emitted wasm or source maps — source-map `sources` must
  be project-relative.
- **No timestamps / host metadata** in wasm custom sections (name/producers).
- **Declaration-driven graph traversal** — never depend on `Deno.readDir` order.
- **Canonical ordering** — module merge order = topological then declaration order;
  stable symbol/index assignment; no reliance on incidental `Map`/`Set` order.
- **binaryen byte-identity asserted on CI** across the OSes/arches the cache is
  shared on (or partition the key by arch — currently folded into the fingerprint).

## Fingerprint taxonomy & the future ecosystem **[review, NEW]**

Today everything folds into one compiler fingerprint. That won't scale to the
std-library-in-VL and a future `pkg:` ecosystem. Separate the keys (Go's
`GOCACHE` + `go.sum` split is the model):

- **compiler/toolchain fingerprint** (current).
- **std-library fingerprint**, distinct from the compiler impl — so a `std:fmt`
  edit doesn't bust every cached compile that didn't use `std:fmt`.
- **user-source fingerprint** (per-module content).
- **package-lock fingerprint** (when `pkg:` lands).

For a future **shared/remote cache**, name the trust model now so L2/L4 don't
foreclose it: content-addressed CAS + signed entries + the reproducibility manifest
above (Nix substituters / Bazel remote cache are the references). Out of scope to
build, in scope to not preclude.

## Cross-cutting concerns

- **Eviction.** `<tmpdir>` is ephemeral, but project-local (L2) and CI caches are
  not. Add a size/count-bounded LRU sweep and `vl cache clean`.
- **Observability.** `VL_CACHE_STATS` (hit/miss/size) — cheap, makes regressions and
  cache growth visible. Do it alongside L1.
- **Concurrency.** Atomic temp+rename (landed) makes same-key races safe; require a
  same-filesystem cache dir (rename isn't atomic across mounts).
- **Tier-1 diagnostics.** A whole-compile hit returns `diagnostics: []`; consistent
  for the self-host tests (warnings are a pure function of source+compiler), but if
  the cache widens, cache+replay diagnostics so a hit can't mask a lint regression.

## Open questions

1. **Test-throughput next step** — the warm in-memory harness (compile the
   self-host base once per process) vs revisiting the `VL_NO_OPT`-with-coverage
   middle path. Both target the primary goal directly; the harness preserves
   coverage, the skip is cheaper. **This is the near-term decision.**
2. **L4 model — (d) per-instance codegen cache vs (b) fragment-linker.** The review
   strongly favours (d); it also keeps the door open to fast compile/LSP later.
   Confirm before building L4.
3. **Interface hash** — exact two-tier definition and how exported generics fold in.
   Shared with `docs/modules-design.md`; design before L3/L4.
4. **Is the dev/release split needed at all** if (d) gives in-mode incrementality?
5. **L2 cache home + default-on?** (lower priority — end-user loop, deferred.)

## Decision log

- **Landed:** L0 primitive; binaryen-`optimize()` stage cache (hardened: structured
  binaryen integrity, relative paths, os/arch + Deno version in keys, multi-file
  wiring); L1 CI caching.
- **[review] Priority = test throughput** (parallel headless agents running the
  suite; the LSP is *not* on that path). Editor/`vl build` speed is a deferred,
  non-foreclosed goal.
- **[review] Reframed:** the optimize cache is **CI/release/test-rerun infra**, not
  a codegen-dev accelerator (IR-build floor + anti-correlation). The top *test*
  levers are an **in-memory warm harness** (compile the self-host base once per
  process — the F9b idea) and **profile-and-cut on IR-build**; a shared cache dir
  gives cross-agent reuse.
- **[review] Deferred:** the LSP fixes (checkOnly-on-keystroke + debounce + in-memory
  CheckResult cache) and L3 — valuable later, but off the test-speed path.
- **[review] L4 direction:** prefer **option (d)** (per-monomorphic-instance codegen
  cache in the single-module pipeline); **option (b) demoted** — "merge fragments
  for free" is actually a wasm linker. dev/release split is **provisional**, gated by
  whether (d) makes it unnecessary; if kept, verify with **differential fuzzing**.
- *(pending)* confirm L4 = (d); design the two-tier interface hash first.
