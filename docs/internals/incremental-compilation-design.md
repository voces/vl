# Incremental and cached compilation (lane IC)

Status: **S1 built OPT-IN (lane CA, 2026-10-07)** — `VL_COMPILE_CACHE=1`, for `vl build` and
each pooled `vl test` file; see §5's S1 row and "S1 as built" below it. Written 2026-10-06 for
the owner's direction of that day:

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
2. So the first stage is the coarsest sound one: cache a compile's **output keyed on the whole
   transcript of what the host sent the compiler instance**, plus the seed, host, binaryen and
   environment (ccache "direct mode", Go's action ID). It needs no compiler change, and it is
   what `C-test-cache` asks for.
3. It saves the compiles whose graph did not change. It does nothing for the compile whose
   graph did, and on sunpa that is the expensive one. For that case, profile-and-cut work beats
   caching. sunpa's graph costs about 10 times the compiler's own per-line fuel.
4. Finer reuse is per function or instance inside the one-module emit. It has two
   prerequisites: importer-independent phase outputs and symbolic indices in the emitter. The
   owner has to rule on one known exception to importer independence (Q1).

## 1. The problem, measured

### sunpa

Measured 2026-10-06, 14:24–14:25, on sunpa commit **`27e3417`**, pinned with
`git archive HEAD src` into a scratch directory so that sunpa's own merges during the run could
not move it. The host was the shared master host (`vl 0.1.0`, commit `082c36f12`) on a 24-core
box at load 10–22. Each figure is a single run, so treat wall times as ±20%. Fuel is a count,
so load cannot move it.

| what (sunpa `27e3417`) | figure |
| --- | --- |
| `src/game.vl`'s import graph | 54 `.vl` modules, 34,978 lines, plus `std:array`, `std:buffer`, `std:math` and `std:str`; `game.vl` itself is 4,316 lines |
| `vl check game.vl` | 4.22 s wall, 4.05 s user CPU, 303 MB peak |
| `vl build game.vl` (no `-O`) | 25.0 s wall, 23.0 s user CPU, 2.44 GB peak, 1,765,678 bytes out |
| the same, `VL_FUEL=1` | 83.7 G guest fuel, 2.40 GB guest allocation |
| `vl build -O3`, `VL_PROFILE=1` | 32.3 s wall: `compile.call` 21.7 s, host `-O` steps 0.49 s, `opt.rung` (wasm-opt) 9.83 s, `stage_program` 0.10 s, `load_compiler` 7 ms |

An earlier pass, 14:07–14:11 on the live checkout, read 27.8 s for a plain build, 82.1 G fuel
and 42.9 s for `-O3`. sunpa merged `6890dcb` at 14:09:46, inside that window, so those rows
straddle two commits and are superseded by the table above.

Two readings follow from the table:

- **The front end is the minority.** `vl check` runs parse, the full checker (including the
  literal-binding fixpoint) and the lint, which `build` never runs. It takes 4.2 s of a build's
  25.0 s. So monomorphization and emit are at least ~80% of a plain build.
- **binaryen is about 30% of an `-O3` build.** Host start-up and staging are noise.

#3394's commit message measured `game.vl` at **46.3 G** fuel and "~9 s" warm on an earlier sunpa
tree. sunpa merged a large branch at 12:49 that day, after #3394 measured, so the two numbers
describe different programs. Nobody has measured both compilers on one sunpa commit.

**`vl test`.** From ROADMAP `C-test-cache` and #3393, measured 2026-10-06 on a sunpa commit
those sources do not record (so this row is not comparable with the table above): sunpa's `vl
test src/` (3
files, 36 tests) takes 25.7 s, of which `rules.test.vl`'s compile is 24.5 s and the tests
themselves ~40 ms. #3393's pool (vl-test-design.md §"The compile pool") brought it down from
33.4 s by compiling the three files at once. The two small files compile in 0.2–0.4 s beside
the large one, so the run is bounded by one compile of `game.vl`'s graph.

### The self-compile

The L2 tripwire's baseline is **54.35 G** fuel for the candidate compiling `compiler/entry.vl`
(`scripts/self-compile-baseline.json`, commit `93b93319e`). `compiler/*.vl` is 35 modules,
238,578 lines on 2026-10-06.

Compare that with sunpa's 83.7 G over 34,978 lines (`27e3417`):

| graph | fuel per 1,000 lines |
| --- | --- |
| the compiler | ≈ 0.23 G |
| sunpa (`27e3417`) | ≈ 2.4 G |

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
mode: let the compiler report what it read, and key on that — the host's transcript of every
message into the compiler instance
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
   - `export function pick(x) { x }` called as `pick(3)` emits 2 functions: one `pick`
     instance and the start function.
   - Adding `pick("s")` emits 9: a second `pick` instance, plus six string-runtime helpers
     (`__str_hash__`, `__str_eq__`, `__str_concat__` and three UTF-8 helpers), read by
     name off a `--names` build.
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
- a host-side transcript of every message into the compiler instance;
- symbolic indices in the emitter;
- every cache in §4.

**Needs a ruling:**
- **record adoption across a module boundary (Q1)**;
- whether exported signatures must be annotated to give modules a frozen interface (Q4). The
  recommendation is no;
- the user-visible surfaces: cache default and location (Q2), and a watch command (Q3).

## 4. The design: one mechanism, three modes

### 4.1 The mechanism: an action, its transcript, and its key

An **action** is one invocation of the compiler that produces a result:

- compile entry E to unoptimized wasm, or a test module;
- check E and produce its diagnostics;
- run the host's `-O` chain on given bytes.

Its result is a pure function of its inputs, **provided the inputs are complete**. Every
miscompile in the §2 survey is an input that was left out. So the key is built from what the
action actually RECEIVED, recorded as it ran, not from a declared list.

**The key is the whole host-to-guest transcript, not a list of inputs.**

The guest is deterministic and has no channel to the world except the host. So everything that
can make two runs of one action differ arrives as a message the host sends into the instance.
The host can record those messages exactly, at one layer: the wrapper through which it calls the
compiler instance's exports. The recorded **transcript** is, in order:

- **Every staging call**, with its arguments. Today that is:
  - `stage_vl_root_and_cwd` (the VL root and the working directory, `main.rs:2812`);
  - `checkEntryPathPush`/`Commit`;
  - `cliArgReset`/`Push`/`Commit` (argv, including the host's synthetic `--color=` argument);
  - `setEmitNames`, `setEmitSrcMap`, `setMemoryPages`, `setImportMemory`, `setSharedMemory`,
    `setHeapWindow`, `setLowMemoryUnused`, `setRepShadow` and `setOneShot`;
  - `modReset`, `modCommit`, `srcReset` and the source pushes.
- **Every reply to a command.**
  - `CMD_READ_FILE` and `read_std_module`: the path the guest asked for, the resolved path, and
    the SHA-256 of the bytes served, or **absent**. A probe that found nothing is an input,
    because a file appearing later at that path changes resolution.
  - `CMD_LIST_DIR`: the listing, as committed.
  - `CMD_WRITE_FILE`: never keyed: an action that writes is never stored (below).
  - `CMD_VALIDATE`: the verdict.
  - Any later command.
- **Nothing the host only reads back.** Calls such as `cliCmdDataAt`, `cliExitCode` and the
  module readback carry host-chosen offsets, and their results are outputs.

**Why the transcript is enough.**
- The guest's next request is a function of every message it has received so far.
- So if every host-to-guest message of a new run equals the recorded one, step by step, then
  every guest request equals the recorded one too, and so does the output. The argument is
  induction over the transcript.
- This is ccache's direct mode, with the advantage that the compiler cannot read around the
  log: it has no other door.

**The lookup replays the transcript against the world, without a guest.**
1. The host computes the staging calls exactly as it would make them. Staging must be factored
   so that "compute" is separate from "call"; that is part of S1.
2. It re-derives each recorded reply from the current filesystem: re-read and re-hash, re-list,
   re-probe an absent path. A `(mtime, size)` match may skip re-hashing an unchanged file. The
   content hash is the authority; the stat is only a shortcut.
3. If every message matches, the result is served. **No compiler instance is created.**
4. A mismatch at any step is a miss.

**What is keyed beside the transcript.**

| input | how it is keyed | why |
| --- | --- | --- |
| the compiler | SHA-256 of the RESOLVED seed's bytes, whichever rung supplied it: `--compiler`, `$VL_COMPILER_WASM`, `./build/vl-compiler.wasm`, `<tree>/build/vl-compiler.wasm`, or the embedded seed (a hash baked at build time, beside `$VL_SEED_KEY`) | cli-design.md §"Where a `vl` binary finds std and its seed"; `seed_content_key` (`main.rs:1696`) is FNV, fine for a sidecar name but not a cache key |
| the host | an embedded build id baked by `build.rs`: `VL_BUILD_COMMIT` (already baked) plus a hash of the host sources, `build.rs`, `Cargo.toml`, `Cargo.lock` and the active `CARGO_FEATURE_*` set, so a dirty local build differs. `build.rs` must print `rerun-if-changed` for `src`, `build.rs`, `Cargo.toml` and `Cargo.lock` on EVERY path: today it prints one only on the `embed-seed` path, and once any is printed cargo stops re-running the script on other edits, so the release build would keep a stale id. (Hashing `include_bytes!` of the sources, which rustc tracks, is the alternative.) | the `-O` steps, staging and validation are host code. Not a SHA-256 of the 24 MB executable on every run. |
| binaryen | every `BINARYEN_*` variable, and the resolved `wasm-opt`: its path, its `--version` and a hash of the binary, or **absent** when none was found (the build then differs: `binaryen_missing_note`) | `binaryen_tool` (`main.rs:5431`) takes `$VL_WASM_OPT` or whatever is on `PATH` |
| colour | the resolved `color_ok()` decision (tty, `NO_COLOR`, `TERM`, `--color`) | on the pump paths it is already in the transcript as the synthetic `--color=` argument. On a path where the host renders diagnostics itself, the host keys its decision explicitly. Storing uncoloured text and styling it at replay is not an option, because the guest does the styling. |
| `-o`, under `--source-map` only | the output path as given and resolved | the `.map` and its `sourceMappingURL` section name it |
| environment | see the three classes below | — |

**Environment variables fall into three classes.** Anything not named is keyed.

- **Bypass: no lookup and no store.**
  - The variables: `VL_FUEL`, `VL_PROFILE*`, `VL_GC_STATS`, `VL_TEST_TRACE`,
    `VL_COMPILE_GC_TRACE`, `VL_FAULT_INJECT` (it breaks the compile on purpose), and every
    `*_DUMP` and `*_EXPLAIN` variable (`VL_INLINE_EXPLAIN`, …).
  - They exist to observe a compile. A hit would silently skip the thing being measured, and a
    store would key a result on an observation.
- **Inert: invisible to every output.**
  - The variables: `VL_CACHE_DIR`, `VL_CACHE_MAX_MB`, `VL_COMPILE_CACHE_MAX_MB`,
    `VL_COMPILE_CACHE_TRACE` and `VL_NO_CACHE`.
  - The last one controls only the separate Cranelift module cache.
- **Keyed: every other `VL_*` variable and every `BINARYEN_*` variable,** for example
  `VL_STD`, `VL_COMPILER_WASM`, `VL_SEED_STACK` and `VL_OPT_NO_FLAT`. Some are also
  captured through the transcript or the resolved seed hash. Keying them twice costs only
  misses.
- The default is over-keying: a missing input is a lie, an extra one only a miss.

**Names.** `VL_NO_CACHE`, `VL_CACHE_TRACE` and `VL_CACHE_MAX_MB` already belong to the
Cranelift module cache (cli-design.md §"The user-module cache (host)"), so the compile cache
takes its own:

| variable | meaning |
| --- | --- |
| `VL_NO_COMPILE_CACHE=1` | no lookup and no store |
| `VL_COMPILE_CACHE_TRACE=1` | one stderr line per lookup |
| `VL_COMPILE_CACHE_MAX_MB` | the prune target |
| `VL_COMPILE_CACHE_VERIFY` | see §4.2 |

`VL_CACHE_DIR` is shared, because both caches live under one root.

**Two-level lookup** (Go's action ID; ccache's manifest):

- **manifest key** = `H(action kind, seed hash, host build id, binaryen id when -O, keyed
  environment, colour decision, -o under --source-map)`.
  - It names a small manifest file: the most recent few transcripts recorded under that key.
- **result key** = `H(manifest key, the transcript, with file contents replaced by their
  hashes)`.
  - It names the stored result.

**What a result holds, and what is re-run after a hit.**
- A result holds:
  - the guest's emitted bytes, or the `-O` chain's output for A2 (§4.6);
  - the exact stdout and stderr text, already coloured as the transcript decided, with the
    `wrote …` line excluded;
  - the exit status.
- After a hit, the host re-runs its **cheap, output-only steps** on the served bytes:
  - writing the module to `-o`;
  - the `--source-map` map and URL step;
  - `--wat`, which is never cached. `wasm-dis` re-runs on the final bytes, so its identity
    needs no key.
- Results that are never stored:
  - a compiler trap (exit 70);
  - any action that read stdin;
  - `-e`;
  - any action whose transcript contains `CMD_WRITE_FILE` (`vl check --fix` writes partway and
    re-reads what it wrote; `fmt -w` likewise if it ever becomes an action): replay must never
    stand in for a write;
  - every run under a bypass variable.

  Each of these is a defect to surface every time, an input the transcript does not see, or a
  measurement.

**Which `vl test` compiles are actions.**
- An action is a compile in a FRESH instance: a pooled worker in compile-one mode, or a `vl
  build`/`run`/`check` one-shot.
- A `--jobs 1` (or single-file) `vl test` compiles every file in one shared instance, so its
  transcript is the whole run, not one file's. In S1 that path stores and looks up nothing.
  Making it per-file means a fresh instance per file, which is a scheduling change, not a cache
  change.

### 4.2 Correctness: how a cached result is shown equal to a fresh compile

The claim is "a hit is byte-identical to a cold compile of the same inputs". Four gates hold it.
Each says what it compares.

1. **`VL_COMPILE_CACHE_VERIFY`.**
   - When on, a hit also runs the action cold and compares the two byte for byte: bytes,
     printed text and exit status.
   - A mismatch is never served. It exits with **a code of its own** (proposed: 71, added to
     cli-design.md's exit-code table when built), not 70. A mismatch is a cache defect, not a
     compiler crash, and the two must be separable in a report. The message names both keys,
     the first differing offset, and the first transcript step whose replay disagreed, if any.
   - **The schedule (chosen here):**
     - For Q2's trial week, agents and the CI cache job verify EVERY hit
       (`VL_COMPILE_CACHE_VERIFY=1`).
     - After that week they verify a deterministic 1 in 20 (`VL_COMPILE_CACHE_VERIFY=sample:20`),
       selected by `H(result key, UTC day)`, not by the key alone: a key-only selector verifies
       the same 5% of entries forever and never the other 95%. The trace logs the selector so a
       sampled mismatch reproduces.
     - Users verify nothing.
   - So the agent win quoted in §5 is ~95% of the hit savings after the trial week, and zero
     during it.
2. **A cold-versus-hit test** (`tests/vl_compile_cache_test.ts`, new).
   - Population: a fixed, named sample of `tests/cases` modules that import (so the fetch loop
     runs), plus `tests/fixtures/vl-test-*`.
   - Each is built three times in a fresh cache directory: cold, populating, hit. All three
     must `cmp`-equal.
   - The population and its count are printed. This is a check over N named programs, not a
     claim about all programs.
3. **A mutation matrix**, in the same test. Each input is changed one at a time, and the next
   lookup must MISS:
   - **Sources:** the entry; a dependency; a new file at a recorded-absent probe path; a file
     added to a listed directory (`CMD_LIST_DIR`, through `vl test` discovery).
   - **Locations:** the working directory, with relative entry paths; the entry's spelling
     (`game.vl` against `./game.vl`); the std and dev-tree location (`$VL_STD`, and a binary
     copied beside another dev tree).
   - **The seed:** one row per seed rung (`--compiler`, `$VL_COMPILER_WASM`,
     `./build/vl-compiler.wasm`, `<tree>/build/vl-compiler.wasm`, embedded).
   - **Flags and output:** one flag of each class; `-o` under `--source-map`; the colour
     decision (`--color=always` against `never`, and `NO_COLOR`).
   - **Environment and tools:** one keyed `VL_*` variable; one `BINARYEN_*` variable;
     `wasm-opt` swapped (a wrapper script on `PATH`) and removed (absent); the host build id
     (a test-only salt), and a host source edited and rebuilt with `--features embed-seed`,
     which must change the id.
   - **Controls:**
     - A run changing only an inert variable must HIT. Without it, a matrix that always misses
       would pass.
     - A run under each bypass variable must neither hit nor store (`VL_COMPILE_CACHE_TRACE`
       reads `off`).
4. **The compiler gates run with the compile cache off.**
   - `gate.sh` and CI's compiler gates set `VL_NO_COMPILE_CACHE=1`. Otherwise a cache defect
     could hide a compiler regression, and a compiler regression could be served from a cache.
     Only the cache's own test and the verify-mode agents exercise it.
   - The **Cranelift module cache is unchanged in the gates**: on, as it is today.
     - Its key is the SHA-256 of the exact wasm bytes plus the engine tag.
     - Every entry is an envelope checked before `Module::deserialize`.
     - So it cannot serve a module for bytes the compiler did not just produce.
     - The `VL_NO_CACHE` it answers to keeps its meaning.

**The guard against a new, unrecorded input.**
- The transcript is complete only while every host-to-guest channel goes through the recording
  wrapper.
- The cache test therefore enumerates every guest export the host calls and every `CMD_*` code
  the guest can return. It fails on any that its table does not classify as one of: staging
  (keyed), command reply (keyed), or readback (output). This is the shape of
  `ladder-budget.py`'s failure on an unclassified kind.
- A new `set*` flag, a new command, or a new staging call cannot join the host without someone
  deciding whether it is an input.

**The precondition is determinism.** A compile must be a pure function of its transcript. The
evidence today is indirect:
- the fixpoint;
- the "byte-identical" claims of every perf PR;
- the memo census.

Two cheap, direct checks belong in gate 2. Both inputs are KEYED regardless; the checks say
whether that keying costs hits for nothing:
- the same build from two working directories that differ only in name;
- the same `-O3` build under `BINARYEN_CORES=1` and the default.

### 4.3 Memory and disk bounds

- **On disk.**
  - Results live beside the existing `modules/` cache: `<cache dir>/compiles/`, same root,
    same 0700 ownership rule, same temp-file and rename writes.
  - They are pruned by the same least-recently-used policy under their own soft budget,
    `VL_COMPILE_CACHE_MAX_MB`, default 512.
  - For scale: sunpa's unoptimized module is 1.77 MB (`27e3417`) and its manifest a few KB, so
    the default
    holds a few hundred builds of that size.
- **In memory (the watch mode).**
  - The last result per action and its transcript; for sunpa, a few MB.
  - At most one warm compiler instance per pool worker.
  - Workers are released after an idle period, because each is budgeted at 1 GiB
    (`TEST_COMPILE_BUDGET`).
- **Nothing GC-heap-shaped is shared across instances.** A wasmtime GC heap belongs to its
  store, so there is no unsound "share the checked `game.vl` between workers" to be tempted by.
  That is the isolation ruling enforced by the runtime.

### 4.4 Concurrency with the #3393 pool

- **Lookups first.** The host resolves every queued file's lookup before it sizes the pool.
  Only misses take a worker, so a run where one file changed starts one instance, not three.
- **One transcript per worker.** Each pooled worker is a fresh instance that services its own
  commands, so its transcript is per file already. The serial `--jobs 1` path is not an action
  in S1 (§4.1), because its one instance carries state from file to file.
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
| A2 | unoptimized bytes (with `vl-src` already stripped unless `--source-map`) + optimizing flags + host build id + binaryen id (every `BINARYEN_*` variable; `wasm-opt` path, version and hash, or absent) + `-o` when `--source-map` is set | → final bytes |

- A2's key carries no compiler identity: the bytes are the input. So A2 hits across compiler
  changes that do not move the emitted code, the same insight `incremental-build-design.md`
  recorded for binaryen.js.
- It also hits across source edits that change no emitted byte once `vl-src` is stripped, such
  as a comment or formatting edit that moves no line. Which edits qualify is measured by S2's
  savings gate, not assumed.
- On sunpa (`27e3417`) that is the 10.3 s of host steps and `wasm-opt` in a 32.3 s `-O3` build.
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
- (b) **Dedupe within a run.** Two queued actions with one manifest key and one transcript
  compile once. This is rare for `vl test` (entries differ) and common for `vl check --batch`
  and gate harnesses.
- (c) **A shared cache directory across processes**, which is what concurrent agents need.

What mode 1 **cannot** do under the ruling is compile `game.vl` once and hand it to three
test files. That would take either B (refused) or separate compilation (plumb's track). The
per-file CPU and memory of the files that DO need compiling stays what the pool made it.

### 4.9 Mode 2: watching, and small deltas

A resident host process (`--watch`, Q3) runs the same actions and keeps:
- each action's transcript and last result in memory;
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
- the instance start, 7 ms of `load_compiler`;
- staging, 0.10 s;
- re-lexing unchanged modules (a slice of the 4.2 s front end).

All of that is against a 25.0 s compile (sunpa `27e3417`). "Optimizing speed for small deltas"
therefore has two
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
| **S1** | The whole-action file cache (§4.1–4.4, 4.7): host transcript, two-level key, results with replayed text, `VL_COMPILE_CACHE_VERIFY`, `VL_NO_COMPILE_CACHE`, `VL_COMPILE_CACHE_TRACE`, pruning; for `test`, `build`, `run`, `check` | 4–6 | an unchanged `vl test src/` goes from 25.7 s to under ~1 s (estimate); editing a small test file costs that file's compile; agents re-gating an unchanged tree skip repeated compiles: none during the trial week, when every hit is verified, and 19 in 20 after it | gates 1–4 of §4.2 | `VL_COMPILE_CACHE_TRACE` hit and miss counts on sunpa's edit loop, and on one agent day's harness compiles |
| **S2** | The `-O` chain cache (A2 in §4.6) | 1 | up to 10.3 s of sunpa's 32.3 s `-O3` (`27e3417`) when the emitted bytes did not move | the same verify mode; the mutation matrix gains "one emitted byte" and "one `-O` flag" | the hit rate over a week of sunpa's `-O3` builds |
| **S3** | `--watch` for `test`, `build`, `run` and `check` (§4.9), resident, polling, pool-backed | 3–5 | no per-action speed beyond S1; the loop becomes automatic, and unchanged files cost nothing | a watch session's report must equal a cold run's after each edit in a scripted edit sequence | wall time from save to report for the beast-edit case |
| **S4** | Keep cutting compile cost on sunpa's shape (`C-compile-hotspots` and its successors) | ongoing | the only stage that speeds the compile whose input changed; headroom suggested by the 10× per-line gap | byte-identical output, which every perf PR already shows | fuel on a committed sunpa-shaped generator, beside `plumb-shape-cost.py` |
| **S5** | An importer-independent checker per module: stable module ids, a per-module or relocatable arena, Q1 ruled, an **interface hash** (exported signatures, exported generic bodies, exported types' shapes) computed from checker output | 10–15, after Q1 | the LSP re-checks only the edited module and those whose imports' interface hash moved; `vl check` of a one-module edit goes from 4.2 s toward the edited module's share | a differential test: every module of a named population checked alone and inside N different importer graphs gives identical per-module results (types, diagnostics, pins) — the measurement §3.2 could only sample with probes | LSP latency on sunpa and on `compiler/entry.vl` |
| **S6** | Per-function and per-instance emit reuse: the emitter writes bodies against symbolic indices (function, type, global, string, union tag) and a late pass assigns and patches them, inside the one module; cache each body keyed on its typed body and the interface hashes of what it references | months; high risk | the edited graph's compile scales with what changed: most of a 25.0 s build when one function body changes (estimate, pending S0) | cold-versus-incremental byte identity over the whole corpus and the self-compile, run continuously; the memo census's in-place-fill lesson says this is where staleness would hide | S0's split, before and after |
| — | separate compilation and linking (plumb) | separate track | — | — | — |

**S1 as built (lane CA, opt-in).** `scripts/vl-host/src/compile_cache.rs`;
`tests/vl_compile_cache_test.ts` holds gates 2 and 3 and the unclassified-channel guard.
- Active only under `VL_COMPILE_CACHE=1`; `VL_NO_COMPILE_CACHE`, `VL_COMPILE_CACHE_TRACE`,
  `VL_COMPILE_CACHE_MAX_MB` and `VL_COMPILE_CACHE_VERIFY=1` (exit 71 on a mismatch) as above.
  Entries live in `<cache dir>/compile/` (`<manifest key>.m`, `<result key>.r`), not
  `compiles/`. The host build id is `build.rs`'s `$VL_HOST_BUILD_ID`.
- Actions: `vl build`, and each pooled `vl test` file. Not yet `vl run` or `vl check`.
- Only the guest's emitted bytes are stored, and only for a compile that succeeded and whose
  module the engine validates. A failed compile is recomputed every time, so no printed text
  is replayed; that is the conservative half of "the exact stdout and stderr text".
- Staged values go into the manifest key rather than being replayed: the entry path, the name
  sections and link options as STAGED (never a filtered argv; flags are scanned anywhere, so
  the token after `-o` can be one), `-o` under `--source-map`, the resolved colour, the VL
  root, the cwd, the entry's bytes, and the `wasm-opt` path and binary hash under `-O`. The
  transcript is the module reads.
- The seed's hash is of the bytes that compile: the file is read once per process
  (`seed_bytes`), so a seed swapped on disk mid-run cannot store one seed's output under the
  other's key.
- Conservative choices beyond the doc: `VL_REP_SHADOW` is a bypass variable; a `vl build`
  whose host reads the compiler instance after the compile (the `heapWindowRead` checks under
  `--low-memory-unused` or `--import-memory` without a heap window) bypasses; `wasm-opt`
  is keyed by path and file hash, without a `--version` spawn.
- Left for default-on: `vl run`/`vl check` actions; replayed text for failed compiles; the
  verify-sample schedule (`sample:20`); gate 4 (`VL_NO_COMPILE_CACHE=1` in `gate.sh` and CI);
  the matrix rows for each seed rung, `$VL_STD`, `BINARYEN_*`, a swapped `wasm-opt` and the
  host id; lookups before the pool is sized (§4.4); the trial week.

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
  - Mitigations:
    - the key is the whole host-to-guest transcript, recorded at the one wrapper the host calls
      the instance through;
    - over-keying of the environment by default;
    - verify mode, full during the trial week and sampled after it;
    - the mutation matrix with its controls.
  - Residual exposure: a future host-to-guest channel added without joining the transcript.
    §4.2's guard fails on any guest export the host calls, and any `CMD_*` code, that its
    table does not classify. It is the shape of `ladder-budget.py`'s failure on a new kind.
  - Remaining hole: an input the host reads and acts on WITHOUT telling the guest. The host's
    own `-O` steps are the example, which is why the host build id is keyed.
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

Today, as probed in §3.2, adoption under D3339's ruling (A) reaches across the import:

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
  its own module's uses. D3339's ruling (A), 2026-09-30 ("the binding adopts the record fully,
  and every read sees it"), keeps holding inside the module and stops at its edge. An importer's
  delivery to a wider record is an ordinary delivery:
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
vl test src/             # (A) cached by default; VL_NO_COMPILE_CACHE=1 or --no-cache opts out
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
