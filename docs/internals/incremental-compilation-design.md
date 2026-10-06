# Incremental and cached compilation (lane IC)

Status: **design, nothing built.** Written 2026-10-06 for the owner's direction of that day:

> We should consider: 1. Compiling multiple things at the same time (in memory caching etc),
> such as with tests 2. Compiling things iteratively with watching, optimizing speed for small
> deltas 3. Compiling things iteratively with individual runs, using a file cache (somewhat
> combined with 2)

It is bound by the owner's test-isolation ruling of the same day (SP-041 ask 2, answer **C**;
**B** — one module per `vl test` run — a strong no): test files are fully independent, with no
shared state, no cross-file inference coupling and no shared failure. So every form of reuse
below has to be invisible: **a cached or shared result is byte-for-byte what a fresh compile
of the same inputs would produce**, and the design is graded on how it proves that.

This supersedes `incremental-build-design.md`, which describes the retired TypeScript
pipeline (`compiler/buildCache.ts`, `toWasm`, binaryen.js `optimize()`). Its two durable ideas
are kept here: a cache keyed on emitted bytes survives compiler churn, and the unit of real
incrementality inside one module is the function or monomorphic instance, not a linked
per-module wasm.

## Summary

1. VL compiles a whole import graph at a time, and every phase after parsing reads the merged
   program. Today the only result that is a function of fewer inputs than the whole graph is a
   module's token stream.
2. So the first stage is the coarsest sound one: cache a compile's **output keyed on everything
   the compile read** (ccache "direct mode", Go's action ID). It needs no compiler change, and
   it is what `C-test-cache` asks for.
3. It saves the compiles whose graph did not change. It does nothing for the compile whose
   graph did, and on sunpa that is the expensive one. For that case, profile-and-cut work beats
   caching. sunpa's graph costs about 10 times the compiler's own per-line fuel.
4. Finer reuse is per function or instance inside the one-module emit. It has two
   prerequisites: importer-independent phase outputs and symbolic indices in the emitter. The
   owner has to rule on one known exception to importer independence (Q1).

## 1. The problem, measured

### sunpa

Measured 2026-10-06, 14:07–14:11, on the shared master host (`vl 0.1.0`, commit `082c36f12`).
The box had 24 cores at load 10–16. Each figure is a single run, so treat wall times as ±20%.
Fuel is a count, so load cannot move it.

| what | figure |
| --- | --- |
| `src/game.vl`'s import graph | 57 `.vl` files, 35,596 lines; `game.vl` itself is 4,195 |
| `vl check game.vl` | 5.20 s wall, 3.84 s user CPU, 303 MB peak |
| `vl build game.vl` (no `-O`) | 27.8 s wall, 25.8 s user CPU, 2.42 GB peak, 1,741,572 bytes out |
| the same, `VL_FUEL=1` | 82.1 G guest fuel, 2.36 GB guest allocation |
| `vl build -O3`, `VL_PROFILE=1` | 42.9 s wall: `compile.call` 30.5 s, host `-O` steps 0.73 s, `opt.rung` (wasm-opt) 9.87 s, `stage_program` 0.15 s, `load_compiler` 26 ms |

Two readings follow from the table:

- **The front end is the minority.** `vl check` runs parse, the full checker (including the
  literal-binding fixpoint) and the lint, which `build` never runs. It takes 5.2 s of a build's
  27.8 s. So monomorphization and emit are at least ~80% of a plain build.
- **binaryen is about a quarter of an `-O3` build.** Host start-up and staging are noise.

#3394's commit message measured the same file at **46.3 G** fuel and "~9 s" warm on its own
box. sunpa merged a large branch at 12:49 that day, after #3394 measured, so the two numbers
describe different programs. Nobody has re-measured them on one tree, and this doc cites the
82.1 G figure only for the tree it measured.

**`vl test`.** From ROADMAP `C-test-cache`, measured 2026-10-06: sunpa's `vl test src/` (3
files, 36 tests) takes 25.7 s, of which `rules.test.vl`'s compile is 24.5 s and the tests
themselves ~40 ms. #3393's pool (vl-test-design.md §"The compile pool") brought it down from
33.4 s by compiling the three files at once. The two small files compile in 0.2–0.4 s beside
the large one, so the run is bounded by one compile of `game.vl`'s graph.

### The self-compile

The L2 tripwire's baseline is **54.35 G** fuel for the candidate compiling `compiler/entry.vl`
(`scripts/self-compile-baseline.json`, commit `93b93319e`). `compiler/*.vl` is 31 modules,
238,578 lines on 2026-10-06.

Compare that with sunpa's 82.1 G over 35,596 lines:

| graph | fuel per 1,000 lines |
| --- | --- |
| the compiler | ≈ 0.23 G |
| sunpa | ≈ 2.3 G |

That is a 10× gap per line. Lines are a crude unit, but a 10× gap is not noise. It says sunpa's
program shape still reaches super-linear paths that the self-compile does not, the same family
#3394 and #3395 cut into. Profile-and-cut has more headroom on sunpa than any cache can give the
compile whose input changed.

The self-compile gains little from a whole-graph cache, and this doc says so rather than
counting it:

- Every compiler edit changes the graph, and the fixpoint step changes the seed, so both miss.
- Only a re-run with nothing changed hits, for example `refresh-compiler.sh` after a docs-only
  rebase.

### The loops the three modes serve

| loop | who | what changes between runs |
| --- | --- | --- |
| edit one test file, re-run `vl test` | sunpa (SP-041), every consumer with tests | one entry; the shared modules do not |
| edit a shared module, re-run | sunpa editing `game.vl` | every graph that imports it |
| re-run with nothing changed | agents re-gating, CI, `vl run` of an unchanged script | nothing |
| keystroke in the editor | LSP | one document; the check result is all that is wanted |
| plumb's generated units | plumb (paused) | units are independent graphs already; the axis is per-unit cost and memory |

## 2. How other toolchains do it

Each entry names the mechanism, what VL can reuse, and the failure the toolchain is known for.
The failures matter more than the mechanisms: every one of them is a cached answer that was
not equal to a fresh compile.

### rustc incremental, and the salsa / rust-analyzer query model

**Mechanism.** The compiler is a graph of memoised QUERIES (`type_of(def)`, `mir_built(def)`,
`codegen_unit(cgu)`), each recording which other queries it read. Between sessions rustc keeps
the dependency graph and the results on disk (`target/incremental/`). On a rebuild it re-runs
only the INPUT queries (source text), then walks the old graph "red/green": a query whose
inputs are all green is reused without running; a query whose input went red is re-run, and if
its new result HASHES equal to the old one it turns green again (**early cutoff**), so its
dependents never run. Codegen is split into codegen units (CGUs); a CGU whose items are all
green reuses its object file. salsa (rust-analyzer's engine) is the same model held in memory
for an IDE: inputs are set by the editor, derived queries are re-validated on demand, and
revisions let a cancelled computation be abandoned.

**Reusable for VL.** Early cutoff is the idea: re-run a phase, compare its result's hash, stop
propagating if equal. Recording what a phase READ, rather than declaring what it should read,
is the only way the key stays complete as the compiler changes.

**What goes wrong.** rustc's incremental mode has shipped wrong results more than once. 1.52.0
turned on fingerprint verification, which turned a common, previously silent class of stale
results into ICEs, and 1.52.1 disabled incremental compilation by default until 1.54. The cause
each time was a query whose result
depended on something its recorded inputs did not cover — the exact failure the memo census
(`memo-generation-census-2026-09.md`) already documents inside one VL compile. And the query
model is a rewrite of the whole compiler: rustc took years, and every pass had to stop reading
global mutable state. VL's compiler is the opposite shape (module-level tables filled in
place, `emitPassGen`, in-place `fRetKind` writes).

### TypeScript: tsserver, `--incremental` / `.tsbuildinfo`, project references

**Mechanism.** `tsserver` keeps one `Program` in memory and, on an edit, builds a new program
that REUSES unchanged `SourceFile` ASTs from the old one (structure reuse); type checking is
lazy and per file. `--incremental` writes `.tsbuildinfo`: per file, a content hash, the hash of
its emitted `.d.ts` SIGNATURE, and its reference graph; the next run re-checks a file only if
it, or the signature of something it imports, changed. Project references go further: a
referenced project is consumed through its emitted `.d.ts`, never its source, so a downstream
project is never re-checked against an upstream body.

**Reusable.** The split between a file's content hash and its SIGNATURE hash, with dependents
keyed only on the signature, is the cutoff that matters. And `.tsbuildinfo` shows the cache is
small if it stores hashes and graph edges, not ASTs.

**What goes wrong.** TS can do this because its type system is structural and every exported
declaration's type is computable from its own module plus the `.d.ts` of its imports — and
where it is NOT (an exported `const` whose type is inferred from an expression),
`isolatedDeclarations`
(TS 5.5) exists precisely to make it an error, so `.d.ts` emission can be done per file without
a checker. That flag is the TS community's admission that inferred exports defeat
per-module compilation. TS's other failure is that `tsc -b` with stale `.tsbuildinfo` after a
compiler upgrade was, for years, a source of "works after `rm -rf`" reports; the compiler
version is now in the file.

### Go: the build cache and per-package compilation

**Mechanism.** One package compiles to one object plus an EXPORT DATA blob (types, function
signatures, inlinable bodies, generic bodies). The cache (`GOCACHE`) is content-addressed by an
ACTION ID: a hash of the compiler binary, flags, GOOS/GOARCH, the package's source files, and the
export data (not the source) of every dependency. If a dependency's body changes but its export
data does not, dependents' action IDs are unchanged and they are reused. Generics compile by
GC-shape stenciling with dictionaries, so most instances are produced per package without
seeing the caller.

**Reusable.** The ACTION ID shape — hash everything the action reads, and for dependencies hash
the INTERFACE they exported, not their source — is the cleanest statement of a sound key. The
cache needs no invalidation logic at all: a changed input is a different key, and old entries
are trimmed by age (`go clean -cache`, 5-day unused trim).

**What goes wrong.** Very little at the cache layer, because Go was DESIGNED for it: no cross-
package inference, explicit signatures on every exported function, no overloading. The cost Go
paid is the language: every exported function is annotated. Inlining across packages makes a
body change leak into export data, so a change to a small inlinable function does recompile its
importers (correctly). And `-trimpath`, `GOFLAGS` and cgo's environment had to be added to the
key one at a time after builds were served across environments that differed.

### Zig: the incremental compiler

**Mechanism.** Zig compiles one whole program at a time (like VL: lazy analysis, comptime,
generic instantiation at use) and is building incrementality INSIDE that model: the
InternPool holds every type and value with stable indices, analysis records fine-grained
dependencies (a decl's value, its type, a namespace's member set, a source hash), and on a
change only the dependent "analysis units" are re-analysed and only the affected functions
re-emitted, patched INTO the existing output binary in place (the self-hosted x86 and wasm
backends were written with in-place patching in mind). `--watch` keeps the compiler process
resident and `-fincremental` turns this on; as of 2025 it is still marked experimental and the
LLVM backend is excluded.

**Reusable.** Zig is the closest analogue: whole-program, monomorphizing, comptime-heavy, no
separate compilation — and its answer is a RESIDENT compiler with in-memory dependency tracking,
not object files. The serialised on-disk form came last, and is the hard part.

**What goes wrong.** It has taken the Zig team several years and a rewrite of the
InternPool and the backends. Incremental results that disagree with a clean build were the
standing bug class through 0.12–0.14; the project's own guidance is to compare against a clean
build when in doubt. The lesson for VL is the order: in-memory reuse in a resident process
before any on-disk partial results.

### OCaml `.cmi` and Haskell `.hi` interface files

**Mechanism.** Each compilation unit writes an interface file: OCaml `.cmi` is the typed
signature (from `.mli` if present, else inferred); GHC `.hi` holds the signature plus
UNFOLDINGS (bodies of small or `INLINABLE` functions) plus specialisations. A dependent is
recompiled only if the interface hash changed. GHC's recompilation checker records, per
module, the fingerprint of every imported ENTITY it used, not the whole interface, so an
unrelated addition to an import does not trigger recompilation.

**Reusable.** Per-entity usage fingerprints ("I used `Foo.bar`'s type and `Foo.Baz`'s
constructors") are the finest sound cutoff anyone ships. OCaml's `.mli` shows an explicit
interface turns the ABI hash from "whatever inference produced" into a contract.

**What goes wrong.** Unfoldings and specialisation pragmas make `.hi` change on body edits, so
`-O` builds recompile far more than `-O0` builds — GHC's incremental speed is largely an `-O0`
story. OCaml's inferred `.cmi` (no `.mli`) changes whenever an inferred type changes, which
cascades. Both are the VL monomorphization problem in miniature: a generic's body IS part of
its interface.

### Swift and Kotlin incremental

**Mechanism.** Swift's driver tracks per-file "provides/depends" sets (`.swiftdeps`, now
fine-grained dependency graphs keyed by declaration) and recompiles a file when something it
depends on changed; whole-module optimisation (WMO) mode disables most of it. Kotlin's
incremental compilation (in Gradle and the daemon) tracks ABI snapshots per class and lookups
per symbol, and recompiles the files whose lookups hit a changed symbol.

**Reusable.** Both demonstrate the "daemon" half: a resident compiler process (the Gradle and
Kotlin daemons, Swift's build-system integration) amortises startup and keeps caches warm. And
Swift's WMO trade-off is VL's exactly: whole-module optimisation and fine-grained incremental
are, in practice, alternatives.

**What goes wrong.** Both are notorious for over- and under-invalidation. Swift's
`.swiftdeps` era had cascading rebuilds from type-inference-dependent "member lookups", and
the fine-grained graph that replaced it still loses correctness around extensions and
operators. Kotlin IC falls back to a full rebuild on many changes (inline functions, constant
values, sealed hierarchies) and has had stale-cache miscompiles that required
`--rerun-tasks`. Inference across files is the root cause in both — the same property VL has.

### esbuild and Vite watch

**Mechanism.** esbuild's `watch`/`serve` modes keep the parsed AST of every file in memory and,
on a change, re-parse only the changed files and redo linking and printing for the bundle;
parsing is per file and embarrassingly parallel, linking is whole-bundle but cheap. Vite in
dev mode does not bundle at all: it serves per-module transforms, caches each by content, and
pre-bundles dependencies once into `node_modules/.vite` keyed by the lockfile hash.

**Reusable.** Per-file PARSE results cached in memory across rebuilds — VL's parse bank is
already the in-compile form of this — and a resident watcher that keeps them. esbuild is fast
because the expensive work is per file and the whole-program step is cheap, which is the
reverse of VL (parse is cheap, the whole-program steps are not).

**What goes wrong.** Vite's dependency pre-bundle cache keyed on the lockfile goes stale when a
dependency is edited in place (`npm link`), and `--force` exists for it. A watch keyed on file
events misses edits made by tools that replace files atomically on some filesystems, and
editors that write via rename; esbuild polls as a fallback.

### Bazel and ccache: content addressing

**Mechanism.** Bazel keys every action on the digest of its command line, its declared input
files and its toolchain, stores outputs in a content-addressed store (local or remote), and
never trusts mtimes. ccache hashes the preprocessed source (or, in direct mode, the source plus
every header the compiler REPORTED reading, via `-MD`) plus the compiler binary and flags.

**Reusable.** Two ideas. Bazel: an action is hermetic only if its inputs are DECLARED and the
sandbox prevents reading anything else; the key is then complete by construction. ccache direct
mode: let the compiler report what it read, and key on that — the host's `CMD_READ_FILE` log
is exactly this report for VL, and it cannot under-report because the brain has no other way
to read a file.

**What goes wrong.** Undeclared inputs: an environment variable, a file read outside the
sandbox, `__DATE__`, an absolute path in debug info. Each is a cache hit that differs from a
fresh build. Bazel's answer is sandboxing plus remote-execution checks; ccache's is a list of
"sloppiness" knobs that each trade a known unsoundness for hit rate. VL's equivalents are the
`VL_*` environment variables that reach the compile, the seed, and std.

### What the survey says, in one table

| toolchain | unit reused | key | VL analogue today |
| --- | --- | --- | --- |
| Go | package object + export data | action id: sources, flags, compiler, deps' export data | none — closest to Stage 1 |
| ccache / Bazel | one compiler invocation's output | everything the invocation read | Stage 1 exactly |
| esbuild / Vite | parsed file | file content | the parse bank, per compile |
| TS `--incremental` | per-file check result | content hash + imports' signature hashes | none — needs an interface |
| OCaml / GHC | module object + interface | interface hashes (GHC: per entity used) | none — needs an interface |
| Zig | analysis unit, function body, in memory | fine-grained dependency on InternPool entries | none — needs resident compiler |
| rustc / salsa | any query result | recorded reads + early cutoff | the memo generation keys, within one compile |
| Swift / Kotlin | file | provides/depends sets | none |

Every toolchain that reuses a result SMALLER than the whole program either has explicit
interfaces at the unit boundary (Go, OCaml, GHC, TS with `isolatedDeclarations`) or tracks
dependencies inside a resident compiler at a fine grain (Zig, salsa, rustc). The ones that
reuse the WHOLE invocation (ccache, Bazel, Go's top level) need neither, and are the only ones
with no history of unsound hits once the key is complete.

## 3. VL's obstacle: which phase outputs are a function of what

This section maps the compiler as it stands on `082c36f12`. Every claim cites a file and a line.
The probes in §3.2 were run on that commit the same day.

### 3.1 The pipeline and its global state

**Staging (host).**
- `stage_program` (`scripts/vl-host/src/main.rs:2842`) decides which path a source takes:
  - A source with an `import {` or `export {` line, or a template hole, goes through the
    **module fetch loop**: `modReset`, `modCommit`, then `modPending*` reads, one file at a time,
    with `std:` served by `read_std_module` (`main.rs:965`).
  - Any other source goes through one `src` buffer.
- `vl check`/`fmt`/`test` reach the same reads through the CLI pump's `CMD_READ_FILE`
  (cli-design.md §"The command-queue protocol").
- **Every file the compiler sees passes through the host.** That fact is what makes Stage 1
  possible.

**Driver (guest).**
- `compileSrc` (`compiler/driver.vl:1001`) resets its tables by hand (1002–1028). There is no
  single reset function.
- For a module graph, `modCompile` (4185) does the rest, in order:
  1. orders modules depth-first (`modVisit`, 4202);
  2. parses every module into **one shared node arena**, `P.nodes` (4241–4257);
  3. renames every module's top level to `name$mN`, where **N is the module's discovery
     position** (`modBuildRename`, 4561);
  4. builds the export alias tables for module 0 only (4311–4363);
  5. concatenates every module's statements into **one `Program`** (4366–4380);
  6. runs `checkProgram`, `jwSecondPass` and `emitProgram` on that merged program.

**Checker.**
- `checkProgram` (`typecheck.vl:56312`) runs one pass, then repeats a full `checkProgramAgain`
  while literal-binding inference (`lbiSolve`, 16390) or record adoption (`recAdSolve`, 37241)
  produce new pins.
- It ends with `canonEmitTypeNames` and A20's inferred-return recording (56422–56448).
- `typecheck.vl` alone has about 1,205 module-level bindings.

**Emitter.**
- `emitProgram` (`emit_sections.vl:6485`) runs a pass table (6637–6675). Among its passes:
  `collectU`/`collectS`/`collectA`, `collectFns`, `buildFnMap`, `computeRetInference` (a
  fixpoint over all `fnStmts`), `dispatchRewrite` and `monomorphize`, followed by re-scans.
- `emitModule` (5415) then does the global assignment:
  - function and helper indices;
  - the string pool (`collectStrPool`, 5293, which scans all of `P.nodes`);
  - heap-type indices (`mAssignTypeIndices`);
  - every section.
- `emit_state.vl` has about 560 module-level bindings, `emit_classify.vl` about 242.

**Host after the compile.**
- `-O`/`-O3` run, in order: strip `vl-src`, the inline-record step, the multi-value step, the
  escape-inline step, `rung_scan`, then `wasm-opt` (`optimize_in_place`, `main.rs:6648`).
- `wasm-opt` is found on `PATH` or through `$VL_WASM_OPT` (`binaryen_tool`, 5431).
- `run` and `test` compile the result with Cranelift.

### 3.2 Per phase: a function of what, and is it importer-independent?

"Importer-independent" means module M's result is the same whichever graph M is compiled in.
That is the property per-module reuse needs. For `vl test`, it means `game.vl`'s result is
the same under `rules.test.vl` as under `beast.test.vl`.

| phase | output is a function of | importer-independent? | reusable per module today? |
| --- | --- | --- | --- |
| lex | the module's bytes | yes | **yes**, and already reused within one instance (`modCache*`, `driver.vl:558–636`; the LSP's `modCommitCached`, 3095) |
| parse | the module's tokens | the AST content is; its **node indices are not** (one shared arena, offset by earlier modules) | needs relocation, or a per-module arena |
| order + rename | the whole graph | **no**: `$mN` is the discovery position, so adding an import above M renames everything in M | needs a stable module id (path- or content-derived); a compiler-internal change, no ruling |
| checker: exported `let` inference | M + its imports | **yes, by rule**: "an exported `let` is typed only by its own module's uses; an importer's use is an ordinary use" (DECISIONS.md, the B′+C literal-binding entry). Probe below. | yes, after rename and arena are fixed |
| checker: un-annotated `const` | each use site | yes: typed per use, "no cross-module effect" (same entry) | yes |
| checker: record adoption | **the importers' deliveries** | **no**. Probe below. | **needs an owner ruling (Q1)** |
| checker: a generic's body | each instance's arguments | diagnostics land at the importer's call site | the generic's BODY is part of M's interface (GHC's unfoldings) |
| A20 inferred returns | M + its imports' signatures | plausibly yes, but unproven for 1,205 bindings | after a differential test (Stage 5's gate) |
| monomorphization | every call site in the graph | **no** by construction: the instance set is the union over importers | per instance, keyed on (generic body, type arguments) |
| `computeRetInference`, rewrites | the merged program, after mono | no | only after Stage 6 |
| union tags, type, function and global indices, string pool | the program order of the whole graph | **no**: one appended row per first sighting (`uVariantsPush`, `emit_classify.vl:34155`) | only with symbolic indices (Stage 6) |
| record layout | the whole program, plus `-O`'s inline step | no; `--stable-layout` pins the boundary rule | linked units already need `--stable-layout` (layout ruling, 2026-10-05) |
| export section | module 0 only | n/a (entry-only) | n/a |
| host `-O` steps, `wasm-opt` | the emitted bytes, flags, host and binaryen versions | n/a (whole module) | **yes, keyed on bytes** (Stage 2) |
| Cranelift | the final bytes and the engine tag | n/a | **already cached** (`user_module`, `main.rs:2354`) |

**The probes.** Each was a two-file graph built with `vl build --wat`, reading the global or
struct type the emitter chose.

1. **Exported `let` across a module boundary.**
   - `export let level = 0` in `b.vl`, delivered to an importer's `x: i64` parameter: the
     global stays `(mut i32)`. The value widens at the use.
   - A store of an `i64` from the importer is refused: "`level` on line 1 of b.vl has no
     annotation, so its literal defaulted to `i32`; annotate it".
   - The same delivery inside one file makes the binding `i64`.
   - The rule holds as written.

2. **Record adoption across a module boundary.**

   `r.vl`:
   ```vl
   export let pt = { x: 1, y: 2 }
   export function show() { print(pt.x) }
   ```
   The importer:
   ```vl
   import { pt, show } from "./r"
   type W = { x: i64, y: i64 }
   function take(w: W) { print(w.x * 4000000000) }
   take(pt)
   show()
   ```
   `r.vl`'s record is emitted as `(struct (field (mut i64)) (field (mut i64)))`. Under an
   importer that only calls `show()`, it is `(struct (field (mut i32)) (field (mut i32)))`.
   So **an importer's delivery changes the layout of a binding the imported module owns.**
   That is the cross-module inference the `let` rule refuses, arrived at by a sibling rule.
   The ROADMAP's old `C-test-shared-compile` text predicted this for `let`; it is false for
   `let` and true for record adoption.

3. **Generic instance sets.**
   - `export function pick(x) { x }` called as `pick(3)` emits 2 functions.
   - Adding `pick("s")` emits 9.
   - The instance set is the importers'.

4. **A generic body's error is reported at the importer's call site.**
   - `export function twice(x) { x * 2 }` checks clean alone and under `twice(3)`.
   - Under `twice("s")` it reports "operator '*' is not defined for string and i32 (the body
     of `twice` applies '*' to this argument)" at `m14.vl:2:13`.
   - M's own diagnostics stay importer-independent. Its interface has to carry the body.

**What this says.**

- Up to the checker, VL is closer to per-module than its "whole-program" reputation suggests.
  - The language already chose module-local inference for exported `let`s and per-use typing
    for `const`s.
  - Generics behave like C++ templates or Zig: the body travels with the interface, and
    instance errors belong to the instantiator.
  - One known exception crosses: record adoption.
- From monomorphization on, everything is a function of the graph. That will not change
  without an emitter that assigns indices late.
- And it is the emitter that costs 80% (§1).

So per-module reuse of the CHECKER is reachable with one ruling and a rename change. But it buys
at most the 5 s that `vl check` costs. The build's other 22 s is only reachable by Stage 6.

### 3.3 What needs a ruling, and what does not

**Compiler-internal (no ruling needed):**
- a stable module id in place of the discovery position;
- a per-module arena, or a relocatable one;
- a host read log;
- symbolic indices in the emitter;
- every cache in §4.

**Needs a ruling:**
- **record adoption across a module boundary (Q1)**;
- whether exported signatures must be annotated to give modules a frozen interface (Q4). The
  recommendation is no;
- the user-visible surfaces: cache default and location (Q2), and a watch command (Q3).

## 4. The design: one mechanism, three modes

### 4.1 The mechanism: an action, its read log, and its key

An **action** is one invocation of the compiler that produces a result:

- compile entry E to unoptimized wasm, or a test module;
- check E and produce its diagnostics;
- run the host's `-O` chain on given bytes.

Its result is a pure function of its inputs, **provided the inputs are complete**. Every
miscompile in the §2 survey is an input that was left out. So the key is built from what the
action actually READ, recorded as it ran, not from a declared list.

**The read log is complete by construction for files.**
- The guest has no filesystem. Every module reaches it through the host:
  - `stage_program`'s fetch loop for `build` and `run`;
  - `CMD_READ_FILE` for `check`, `fmt` and `test`;
  - `read_std_module` for `std:`.
- So the host records, per action, the ordered list of `(path as the guest asked for it,
  resolved path, SHA-256 of the bytes served)`.
- It also records each **miss**. A probe that found nothing is an input too: a file appearing
  later at that path changes resolution.
- This is ccache's direct mode, with the advantage that the compiler cannot read around the log.

**The non-file inputs are a short list, and each one goes in the key.**

| input | how it is keyed | why |
| --- | --- | --- |
| the compiler | SHA-256 of the seed bytes (the embedded seed's or `--compiler`'s) | the seed is the brain; `seed_content_key` (`main.rs:1696`) is FNV, fine for a sidecar name but not a cache key |
| the host | its build id: commit plus a hash of the executable, computed once per process | the `-O` steps, staging and argv handling are host code |
| flags | the exact argv the guest receives, plus every host flag that reaches an output (`-O*`, `--names`, `--source-map`, layout flags, `--stable-layout`, `--extern` values) | — |
| environment | **every `VL_*` variable except a named inert list** (`VL_CACHE_*`, `VL_TEST_TRACE`, `VL_PROFILE*`, `VL_GC_STATS`, `VL_FUEL`), plus `BINARYEN_CORES` until it is measured inert | defaults to over-keying: a missing input is a lie, an extra one only a miss |
| binaryen | the `wasm-opt` path, its `--version`, and a hash of the binary | `binaryen_tool` takes whatever is on `PATH` |
| paths | the entry path as given, and the canonical working directory | `vl-src` rows and source maps carry file names |
| std | covered by the read log: `read_std_module` serves bytes, and they are hashed | `$VL_STD` overrides become reads of different bytes |

**Two-level lookup** (Go's action ID; ccache's manifest):

- **manifest key** = `H(compiler, host, flags, env, binaryen when -O, entry path, cwd, action
  kind)`.
  - It names a small manifest file: the most recent few read logs seen under that key.
- **result key** = `H(manifest key, the read log's (path, hash-or-absent) list)`.
  - It names the stored result.

**The lookup:**
1. Read the manifest.
2. For each recorded log, newest first, re-hash its files. Most runs use `(mtime, size)` to skip
   hashing an unchanged file. The content hash is the authority; the stat is only a shortcut.
3. If every file matches, load the result. **No compiler instance is created.**
4. On a miss, run the action, then write the result and prepend its log to the manifest.

**What a result holds.**
- the output bytes (the module, or the `.map` beside it);
- the exact stderr and stdout text the action printed (warnings, the `wrote …` line excluded);
- the exit status.

A replayed result is therefore indistinguishable from a fresh one. Results that are never
stored:
- a compiler trap (exit 70);
- any action that read stdin;
- `-e`.

Each of these is either a defect to surface every time or an input the log does not see.

### 4.2 Correctness: how a cached result is shown equal to a fresh compile

The claim is "a hit is byte-identical to a cold compile of the same inputs". Four gates hold it.
Each says what it compares.

1. **`VL_CACHE_VERIFY=1`.**
   - On every hit, the action also runs cold and the two are compared byte for byte (bytes,
     printed text, exit status).
   - A mismatch is exit 70 with both keys and the first differing offset. The cached copy is
     never served on a mismatch.
   - Agents and CI turn it on. Users do not pay for it.
2. **A cold-versus-hit test** (`tests/vl_compile_cache_test.ts`, new).
   - Population: a fixed, named sample of `tests/cases` modules that import (so the fetch loop
     runs), plus `tests/fixtures/vl-test-*`.
   - Each is built three times in a fresh cache directory: cold, populating, hit. All three
     must `cmp`-equal.
   - The population and its count are printed. This is a check over N named programs, not a
     claim about all programs.
3. **A mutation matrix**, in the same test.
   - Each input kind is changed one at a time, and the next lookup must MISS:
     - the entry;
     - a dependency;
     - a new file at a recorded-absent probe path;
     - `$VL_STD`;
     - the seed (`--compiler`);
     - one flag of each class;
     - one non-inert `VL_*` variable;
     - `wasm-opt` (a wrapper script on `PATH`);
     - the host id (a test-only salt).
   - The control is a run that changes only an inert variable; it must HIT. Without it, a
     matrix that always misses would pass.
4. **The gates stay cache-free.** `gate.sh` and CI's compiler gates run with `VL_NO_CACHE=1`.
   Otherwise a cache defect could hide a compiler regression, and a compiler regression could
   be served from a cache. Only the cache's own test and the verify-mode agents exercise it.

**The precondition is determinism.** A compile must be a pure function of its read log. The
evidence today is indirect:
- the fixpoint;
- the "byte-identical" claims of every perf PR;
- the memo census.

Two cheap, direct checks belong in gate 2:
- the same build from two working directories that differ only in name, with relative entry
  paths;
- the same `-O3` build under `BINARYEN_CORES=1` and the default.

If either differs, that input joins the key (and the second one leaves the inert list).

### 4.3 Memory and disk bounds

- **On disk.**
  - Results live beside the existing `modules/` cache: `<cache dir>/compiles/`, same root,
    same 0700 ownership rule, same temp-file and rename writes.
  - They are pruned by the same least-recently-used policy under their own soft budget,
    `VL_CACHE_COMPILES_MB`, default 512.
  - For scale: sunpa's unoptimized module is 1.74 MB and its manifest a few KB, so the default
    holds a few hundred builds of that size.
- **In memory (the watch mode).**
  - The last result per action and its read log; for sunpa, a few MB.
  - At most one warm compiler instance per pool worker.
  - Workers are released after an idle period, because each is budgeted at 1 GiB
    (`TEST_COMPILE_BUDGET`).
- **Nothing GC-heap-shaped is shared across instances.** A wasmtime GC heap belongs to its
  store, so there is no unsound "share the checked `game.vl` between workers" to be tempted by.
  That is the isolation ruling enforced by the runtime.

### 4.4 Concurrency with the #3393 pool

- **Lookups first.** The host resolves every queued file's lookup before it sizes the pool.
  Only misses take a worker, so a run where one file changed starts one instance, not three.
- **One log per worker.** Each pooled worker services its own `CMD_READ_FILE`s, so its log is
  per file already. A worker that falls back to serial (`--jobs 1`) logs per file too, because
  the state machine runs file by file.
- **Same key in two processes** (two agents on one cache directory): both compile, and both
  write identical bytes by temp-file and rename. Last writer wins, and either copy is correct;
  verify mode would expose the case where they are not.
- **Results commit in queue order**, exactly as today. The report stays byte-identical to
  `--jobs 1`'s, with or without hits; the runner test asserts that already and gains a warm leg.

### 4.5 The LSP

The LSP reuses the compiler core in one long-lived instance (`lsp/src/wasmChecker.ts`). On
every edit it re-checks the whole graph, re-lexing only changed dependencies through
`modCommitCached`. Stage 1 cannot help it: the document being typed in is always a changed
input.

What does help it, in order:
- **Stage 5**, a per-module checker result with an interface-hash cutoff;
- later, a resident query layer.

Two constraints from the dual-runtime rule:
- Any guest-side change is exercised by both the Rust host and the TS LSP host. That covers a
  stable module id, a per-module arena and a read-set export.
- The disk cache stays Rust-host-only. It is not ported to the TS host.

### 4.6 `-O` and binaryen

An `-O` build is two actions chained:

| action | input | key |
| --- | --- | --- |
| A1 | source graph | → unoptimized bytes |
| A2 | unoptimized bytes (with `vl-src` already stripped unless `--source-map`) + optimizing flags + host id + binaryen id | → final bytes |

- A2's key carries no compiler identity: the bytes are the input. So A2 hits across compiler
  changes that do not move the emitted code, the same insight `incremental-build-design.md`
  recorded for binaryen.js.
- It also hits across source edits that change no emitted byte once `vl-src` is stripped, such
  as a comment or formatting edit that moves no line. Which edits qualify is measured by S2's
  savings gate, not assumed.
- On sunpa that is the 10.6 s of host steps and `wasm-opt` in a 42.9 s `-O3` build.
- Cranelift is already the third link of the chain (`user_module`).

### 4.7 Mode 3: individual runs with a file cache

This is Stage 1 on disk, applied to `vl test` (per file), `vl build`, `vl run` and `vl check`
(diagnostics only).

For sunpa:

| run | today | with Stage 1 |
| --- | --- | --- |
| `vl test src/`, nothing changed | 25.7 s | the cost of re-hashing ~2 MB of source, instantiating three test modules from cached `.cwasm` and running 36 tests: well under a second (an estimate, to be measured) |
| edit `beast.test.vl`, re-run | 25.7 s | beast's own 0.2–0.4 s compile plus the above |
| edit `rules.test.vl`, or anything `game.vl` imports | 25.7 s | 25.7 s, no change |

### 4.8 Mode 1: many compiles at once

The pool already parallelizes. This mode adds, in order of value:

- (a) **Lookups before instances** (§4.4), so a mostly-warm run costs no compiler memory.
- (b) **Dedupe within a run.** Two queued actions with one manifest key and one read log
  compile once. This is rare for `vl test` (entries differ) and common for `vl check --batch`
  and gate harnesses.
- (c) **A shared cache directory across processes**, which is what concurrent agents need.

What mode 1 **cannot** do under the ruling is compile `game.vl` once and hand it to three
test files. That would take either B (refused) or separate compilation (plumb's track). The
per-file CPU and memory of the files that DO need compiling stays what the pool made it.

### 4.9 Mode 2: watching, and small deltas

A resident host process (`--watch`, Q3) runs the same actions and keeps:
- each action's read log and last result in memory;
- the warm instances;
- each instance's own token cache (`modCache*`, which a one-shot compile throws away).

**The loop:**
1. Poll the union of the logs' paths, including absent ones, and, for `vl test`, the
   directories discovery listed. Use `(mtime, size)` every 250 ms and confirm a change by hash.
2. Mark the actions whose log holds a changed path.
3. Re-run only those, through the pool.
4. Print the same report a cold run would.

The result equals a cold run's by the same argument as Stage 1, and verify mode applies
unchanged.

Polling rather than inotify keeps the host's dependency list at wasmtime and anyhow. It also
sidesteps editors that save by rename. A notify-based watcher is a later swap behind the same
interface.

**What watching does NOT give is speed on the action that changed.** Residency saves:
- the instance start, 26 ms of `load_compiler`;
- staging, 0.15 s;
- re-lexing unchanged modules (a slice of the 5.2 s front end).

All of that is against a 27.8 s compile. "Optimizing speed for small deltas" therefore has two
real levers, and neither is a cache of whole results:

1. **Make the compile cheaper** (Stage 4). sunpa pays 10× the self-compile's fuel per line
   (§1), and #3394 alone removed 57% of one snapshot's fuel.
2. **Reuse inside the compile** (Stages 5–6):
   - the checker per module, once it is importer-independent;
   - then emitted function bodies keyed by their real inputs, with indices assigned in a late
     pass.

   This is Zig's model (§2): incremental inside one whole-program compiler, resident first and
   on disk last.

## 5. The staged plan

Cheapest and highest-value first. Each stage names its gate: how we know it is sound, and how
we know what it saved. Effort is agent-days for one lane at the current CPU cap. Wins are
sunpa's unless stated, and anything not yet measured is marked as an estimate.

| stage | what | effort | expected win | soundness gate | savings gate |
| --- | --- | --- | --- | --- | --- |
| **S0** | Phase marks: the guest reports parse, check, mono, emit and sections boundaries to `VL_PROFILE` (a fuel or clock stamp at each `emitProgram` pass-table step) | ½–1 | none directly; it turns §1's "≥ 80% emit" bound into a split, which decides S4 versus S6 | byte-identical output with marks on (marks are host-side reads) | it prints the split for sunpa and the self-compile |
| **S1** | The whole-action file cache (§4.1–4.4, 4.7): host read log, two-level key, results with replayed text, `VL_CACHE_VERIFY`, `VL_NO_CACHE`, `VL_CACHE_TRACE`, pruning; for `test`, `build`, `run`, `check` | 4–6 | an unchanged `vl test src/` goes from 25.7 s to under ~1 s (estimate); editing a small test file costs that file's compile; agents re-gating an unchanged tree skip every repeated compile | gates 1–4 of §4.2 | `VL_CACHE_TRACE` hit and miss counts on sunpa's edit loop, and on one agent day's harness compiles |
| **S2** | The `-O` chain cache (A2 in §4.6) | 1 | up to 10.6 s of sunpa's 42.9 s `-O3` when the emitted bytes did not move | the same verify mode; the mutation matrix gains "one emitted byte" and "one `-O` flag" | the hit rate over a week of sunpa's `-O3` builds |
| **S3** | `--watch` for `test`, `build`, `run` and `check` (§4.9), resident, polling, pool-backed | 3–5 | no per-action speed beyond S1; the loop becomes automatic, and unchanged files cost nothing | a watch session's report must equal a cold run's after each edit in a scripted edit sequence | wall time from save to report for the beast-edit case |
| **S4** | Keep cutting compile cost on sunpa's shape (`C-compile-hotspots` and its successors) | ongoing | the only stage that speeds the compile whose input changed; headroom suggested by the 10× per-line gap | byte-identical output, which every perf PR already shows | fuel on a committed sunpa-shaped generator, beside `plumb-shape-cost.py` |
| **S5** | An importer-independent checker per module: stable module ids, a per-module or relocatable arena, Q1 ruled, an **interface hash** (exported signatures, exported generic bodies, exported types' shapes) computed from checker output | 10–15, after Q1 | the LSP re-checks only the edited module and those whose imports' interface hash moved; `vl check` of a one-module edit goes from 5.2 s toward the edited module's share | a differential test: every module of a named population checked alone and inside N different importer graphs gives identical per-module results (types, diagnostics, pins) — the measurement §3.2 could only sample with probes | LSP latency on sunpa and on `compiler/entry.vl` |
| **S6** | Per-function and per-instance emit reuse: the emitter writes bodies against symbolic indices (function, type, global, string, union tag) and a late pass assigns and patches them, inside the one module; cache each body keyed on its typed body and the interface hashes of what it references | months; high risk | the edited graph's compile scales with what changed: most of a 27.8 s build when one function body changes (estimate, pending S0) | cold-versus-incremental byte identity over the whole corpus and the self-compile, run continuously; the memo census's in-place-fill lesson says this is where staleness would hide | S0's split, before and after |
| — | separate compilation and linking (plumb) | separate track | — | — | — |

**Why this order.**
- S1 is the only stage whose soundness argument fits in one paragraph, and it serves sunpa's
  most frequent loop with no compiler change.
- S2 and S3 are small extensions of S1's mechanism.
- S4 is already running, and it is the only stage that helps the expensive compile.
- S5 and S6 are the real incremental compiler. They are listed so that nothing in S1–S4
  forecloses them, and so that S0 can decide whether S6 is worth its cost against S4.

## 6. Risks and open questions

### Risks

- **An unlogged input.** This is the whole risk of S1, and the survey's every failure.
  - Mitigations: the host is the only door to files; over-keying of the environment by
    default; verify mode in agents and CI; the mutation matrix with its control.
  - Residual exposure: a future host-to-guest channel added without joining the key. The cache
    test should fail on a new `CMD_*` code it does not classify, the way `ladder-budget.py`
    fails on a new kind.
- **Non-determinism we have not seen.** For example, a `Map` iteration order that depends on
  allocation, or binaryen threads. Verify mode is the detector. It turns this into a loud
  error instead of a stale serve.
- **Cache hits hiding compiler regressions in gates.** This is why gate 4 runs the gates
  cache-free.
- **Disk growth and a shared directory.** The existing `modules/` policy is reused: private
  directory, envelope checks, least-recently-used pruning.
- **Watch mode and memory.** Warm instances are 1 GiB each by budget, so idle workers are
  released.
- **S5 and S6 are a long road.** rustc, Swift, Kotlin and Zig each shipped incremental
  miscompiles for years. They are justified only if S0 and S4 show the compile cannot be made
  cheap enough. The plan keeps them last on purpose.

### Owner questions

Each question lists options with code and a recommendation. None is decided here.

**Q1. Should record adoption stop at a module boundary, as literal-binding inference does?**

Today, as probed in §3.2:

```vl
// r.vl
export let pt = { x: 1, y: 2 }
export function show() { print(pt.x) }

// main.vl
import { pt, show } from "./r"
type W = { x: i64, y: i64 }
function take(w: W) { print(w.x * 4000000000) }
take(pt)      // today: r.vl's `pt` becomes { x: i64, y: i64 } in this graph only
```

- **(A) Module-local, like an exported `let`.** An exported binding's record type is fixed by
  its own module's uses. An importer's delivery to a wider record is an ordinary delivery:
  - the fresh-record rule does not apply, because `pt` is not fresh to the importer;
  - the existing-record rule then applies: refused, with a fix message naming the annotation.

  ```vl
  take(pt)  // error: `pt` (r.vl line 1) has type { x: i32, y: i32 }; annotate it in r.vl:
            // `export let pt: W = …`, or pass a copy: `take({ x: pt.x, y: pt.y })`
  ```

- **(B) Keep the cross-module adoption.** One module's layout then depends on which graph
  compiles it, so S5 has to treat every exported record binding as importer-dependent.
- **(C) Module-local, with the importer's use widening by copy at the use**, as an integer
  `let` does. This needs the element-converting copy the record covariance ruling defers.

**Recommendation: A.**
- It is the rule the language already wrote for `let` ("an exported `let` is typed only by its
  own module's uses").
- It makes a module's types a function of the module.
- It turns a silent layout change into a message with a fix.
- Before ruling, count how many programs use the cross-module form: a grep over `tests/cases`,
  `std` and the consumers. The cost is likely near zero, but it has not been measured.

**Q2. Should the compile cache be on by default, and where should it live?**

```sh
vl test src/             # (A) cached by default; VL_NO_CACHE=1 or --no-cache opts out
vl test src/ --cache     # (B) opt-in per run
```

- **(A) On by default, in the existing user cache directory** (`$VL_CACHE_DIR`, then
  `$XDG_CACHE_HOME/vl`, then `~/.cache/vl`), next to the `.cwasm` caches, with `--no-cache` on
  every command and a `vl cache clean`.
- **(B) Opt-in** by flag, or by an environment variable that agents and sunpa set.
- **(C) On by default, project-local** (`.vl/cache/`, git-ignored on first write).

**Recommendation: A, after S1's gates have run in verify mode across agents for a week.**
- The Cranelift cache already set this precedent (on by default, user directory, an envelope
  per entry), and users have not been asked to manage it.
- Project-local (C) duplicates entries across worktrees, which is this repo's own worst case.

**Q3. What is the watch surface?**

```sh
vl test --watch src/        # (A) a flag on each command
vl watch test src/          # (B) a wrapper command
```

- **(A) `--watch` on `test`, `build`, `run` and `check`.**
- **(B) A `vl watch <command> …` wrapper.**
- **(C) Neither**: leave watching to external tools (`watchexec -- vl test src/`) and rely on
  S1 for the speed.

**Recommendation: A** (cargo-watch is B, `tsc --watch`/`vitest`/`zig build --watch` are A).
- It reads naturally.
- The watch loop needs each command's own action list, which only the command knows.
- C is a fine interim: with S1, an external watcher already gets the whole S3 win except warm
  instances. S3 can therefore wait for a consumer to ask.

**Q4. Should an exported function's signature be frozen at the module boundary?**

```vl
export function twice(x) { x * 2 }            // today: a generic; its body is its interface
export function twice(x: i32): i32 { x * 2 }  // a frozen interface
```

- **(A) No rule.** S5's interface hash includes the bodies of exported generics and of
  exported functions whose return is inferred. A body edit to such a function re-checks its
  importers. This is GHC's unfoldings and C++'s templates.
- **(B) A lint hint** suggesting annotations on exported signatures, off by default, for
  projects that want the cutoff.
- **(C) Require annotations on exports**, as TS's `isolatedDeclarations` and Go do.

**Recommendation: A.**
- B is available later, and C would reverse VL's inference-first design for a speed-up that S5
  has not yet shown it needs.
- The `redundant type annotation` hint already exempts exported signatures (D3597), so a
  project that annotates exports is not nagged.

### Not questions (decided by existing rulings)

- **One module per `vl test` run (B):** refused (2026-10-06). `C-test-shared-compile` is
  closed in ROADMAP with this doc.
- **Linked units keep the conservative layout:** `--stable-layout` (layout ruling, 2026-10-05).
  S6 stays inside one module and does not need it.
