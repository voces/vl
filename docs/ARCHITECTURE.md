# VL compiler architecture

This document says how the VL compiler is built: its phases, the data each phase owns, the
contracts between them, and the invariants every change must keep. It is **normative**. When the
code and this document disagree, one of them is a defect: either the code violates a contract
(and the place is listed under [Known deviations](#7-known-deviations)), or the contract is wrong
and this document changes in the same PR as the code.

It does not say what VL programs mean. That belongs to a language specification (see
[§8](#8-relation-to-a-language-specification)). Detail lives in `docs/internals/`, linked from
each section. Rationale for non-obvious choices lives in `DECISIONS.md`; the forward plan in
`ROADMAP.md`; the working rules in `CLAUDE.md`.

## 1. Purpose and the goal

VL compiles a statically typed language to WebAssembly with the GC proposal (WasmGC). The
compiler is itself written in VL and compiled by its previous build (the **seed**,
`build/vl-compiler.wasm`). The native host (`scripts/vl-host`, Rust, the `vl` binary) loads the
seed, gives it files, and runs the module it produces. Emitted modules also run in two
JavaScript hosts, the Deno test host (`tests/support/runWasm.ts`) and the browser playground
(`playground/src/runtime.ts`); those two share one import table, `compiler/vlHostImports.ts`
([§2.5](#25-optimisation-and-the-hosts)).

The standing goal has two clauses, and every architectural decision below is in service of them:

1. **Soundness.** If `vl check` accepts a program, it builds and runs correctly. Check-clean
   invalid wasm, a wrong value, or a trap the program did not ask for is a clause-1 violation.
2. **No capability refusals.** The compiler rejects only what the language design forbids. "Not
   yet supported by codegen" is never a valid answer. Every refusal raised after `vl check`
   returned 0 is a clause-2 violation by construction: either the program is legal and should
   build, or it is illegal and the checker owed the diagnosis.

Clause 2 keeps clause 1 honest: without it, any check-clean miscompile could be "fixed" by a new
refusal. Progress is counted in programs that **run**, by the instruments named in `CLAUDE.md`
("The goal is `runs`"), not in refusals added.

## 2. The pipeline

```
source ─► lexer ─► parser ─► node arena ─► checker ─────────────────► emitter ─────────► module bytes ─► host
          tokens   AST                     (solve loops, canon)       (pass table:            (-O: binaryen
                                           types, diagnostics         46 ordered rows,         + host passes)
                                                                      mono among them;
                                                                      then sections)
```

The driver (`compiler/driver.vl`) sequences the phases. `compileSrc` and `checkSrc` are its two
entry points; both reset the module state, initialise the checker, load and parse (one module or a
module graph), and check. `compileSrc` then emits. Return codes: 0 success, 1 lex or parse
error, 2 type error, 3 emit refusal. `compiler/entry.vl` is the seed's export surface: it
re-exports the host ABI from the driver, checker queries, emitter section control, lint and CLI
modules.

### 2.1 Lexer

`compiler/lexer.vl`, `tokenize(source): LexResult`.

- **In:** source text. **Out:** a token array and lexical diagnostics. The lexer returns its own
  `Tok` record (`lexer.vl`: `kind`, `text`, `start`, `line`, `col`); `ast.vl` declares a second
  `Tok` with a sixth field, a known duplicate ([§7](#7-known-deviations)).
- **Contract:** every character of the source is covered by a token or trivia; `Tok.start` is an
  offset into the source and `line`/`col` its position, and every later diagnostic span is
  built from them.
- **Must not:** decide anything about meaning. Keywords are lexed whether or not a production
  uses them.

### 2.2 Parser and the node arena

`compiler/parser.vl`, `parseProgram()`; node types in `compiler/ast.vl`.

- **In:** tokens. **Out:** nodes appended to the shared **node arena** `P.nodes` (the `Parser`
  record `P`, `ast.vl`), and parse diagnostics. A node is an element of the `Node` union and is
  identified by its **index** in the arena. Children are referenced by index.
- **Contract:** a node index is stable for the life of the compilation. Every later phase that
  attaches a fact to a node does so in a **parallel column** indexed by node index (for example
  `nodeTyIx`, the checker's type for each node), never by mutating a shared field that another
  phase also reads. A rewrite that replaces a node does it **in place** (`P.nodes[i] = {…}`) so
  every column keyed by `i` stays valid; a rewrite that adds nodes appends them.
- **Must not:** resolve names or types.

**Modules.** A program with imports is compiled as one unit: `modCompile` parses every module into
the same arena, mangles top-level names per module, and merges their statements into one
synthesised program that the checker sees whole. Linking is by mangled name; there is no separate
link step. Import cycles are errors. `std:` imports resolve as in [§4.6](#46-std-resolution).
Detail: `docs/internals/modules-design.md`, `docs/internals/parser-notes.md`.

### 2.3 Checker

`compiler/typecheck.vl` (with `check_state.vl`, `check_query.vl`, `check_pins.vl`,
`check_unconsumed.vl`, `check_places.vl`, `check_match_hoist.vl`, `check_width.vl`, `check_definite.vl`, `check_suggest.vl`, `check_narrow_ends.vl`, `check_capture_loss.vl`, `check_capture_walks.vl`, `check_write_scan.vl`, `check_intrinsics.vl`, `check_record_writes.vl`, `check_types.vl`, `const_exact.vl`, `tyname.vl`), `checkProgram(root)`.

- **In:** the arena. **Out:** a type for every expression node (in the type arena, [§3.2](#32-the-type-arena)),
  symbol tables, constraint tables, and all type diagnostics. It may also **write annotations back
  into the AST** when a whole-program solve decides a type the source left open.
- **Contract:** the checker is the only phase that decides whether a program is legal. When it
  returns with no errors, every program it accepted is one the design permits, and every fact the
  emitter needs about a node's type is available from the checker's tables.

`checkProgram` is a **whole-program solve loop**, not a single walk:

1. one full checking pass (`checkProgramPass`: AST normalisations, `checkNode(root)`, the
   post-walk checks, and canon, [§3.3](#33-canon-spellings-and-interned-ids));
2. solvers that read what the pass observed and decide types the source left open — literal
   binding inference (`lbi*`), record adoption (`recAd*`), un-annotated exported parameters
   (`exp*`) — and write their answers back as annotations;
3. a re-check (`checkProgramAgain`: restore spellings, re-initialise, pass again) while any solver
   changed something, bounded by a fixed pass budget;
4. the reports each solver owes, emitted once at the end.

The driver can run the checker once more after the main check: `jwSecondPass` generates source
for deep `is` walkers, splices it into the arena, and re-checks.

**Quiet probes.** Some decisions are made by checking a subtree speculatively and discarding what
the attempt recorded (argument fit, un-annotated parameter solving, the mono re-check). A probe
**must** restore every append-only table it may have written; see [§4.3](#43-checkpoint-and-rollback).

- **Must not:** emit code; depend on what the emitter will be able to lower. A program that is
  legal by the design is accepted even if no lowering exists yet — that missing lowering is then an
  emitter defect, visible, rather than a refusal disguised as a type error.

Detail: `docs/internals/check-reject-audit-2026-09.md`, `docs/internals/open-rulings.md`
(rulings the checker implements), `docs/internals/memo-generation-census-2026-09.md`.

### 2.4 Emitter

`compiler/emit_*.vl` and `compiler/wasmEmit.vl`. The entry is `emitProgram(root)` in
`compiler/emit_sections.vl`.

- **In:** the checked arena and the checker's tables. **Out:** wasm module bytes, or `-1` with a
  recorded emit failure.
- **Contract:** the emitter **lowers** what the checker decided. It reads a node's type from the
  checker; it chooses a **representation** (rep, [§3.4](#34-reps-and-rep-classifiers)) from that
  type; it emits instructions.
- **Must not:**
  - **decide legality.** A refusal that names a rule about the user's program belongs in the
    checker. The emitter may refuse only as an internal-invariant floor ("this cannot happen for a
    checked program"), and a floor a check-clean program reaches is a compiler bug.
  - **re-derive a type the checker decided.** It must not reconstruct a node's type from a
    rendered spelling, from a name, or by re-running inference. Where the checker's answer is
    not available in the needed form, the fix is to bank it in the checker, not to re-derive it.

`emitProgram` (`emit_sections.vl`) is the emitter's driver. It runs a **declared pass table**,
then `emitModule`:

1. **The pass table** is a dependency-ordered list of 46 rows, each `"<pass> > <prerequisite>…"`.
   The loop in `emitProgram` reads each row (`passRowName`), refuses to run one whose
   prerequisites have not all run (`passNeedsMet`, an `emitFail` naming the reordered pass),
   dispatches it by name (`runEmitPass`), and bumps `emitPassGen` (`memoPassAdvance`, `memo.vl`) so a cross-pass memo cannot
   outlive the row that filled it. The order is **not** grouped by kind. Rewrites
   (`loopValueRewrite`, `dispatchRewrite`, `captureBoxRewrite`, the `synth*` annotation passes)
   interleave with the collect passes (`collectU`, `collectS`, `collectA`, `collectFns`,
   `buildFnMap`, `computeRetInference`), because each edge says which pass's output another
   reads. `monomorphize` is one row in the middle. Rows suffixed `#2` (`collectA#2`,
   `buildFnMap#2`, `computeVoidFns#2`, `capNarrowBuild#2`, `computeRetInference#2`) re-run a
   collect pass after mono, over the annotations mono minted. The comment above the table states
   the edge shapes: a pass that mutates the arena runs before every pass that scans it, and a
   pass that needs the final arena runs after all of them. The one legality row is
   `checkFnParams` (`checkParams`); the `checkTopLevel` row is a no-op kept for its ordering
   edge ([§7](#7-known-deviations)).
2. **Queries are not passes.** `emit_classify.vl`, `emit_rep.vl` and `emit_query.vl` hold the
   functions that passes and lowering call to ask a node's rep or a shape's registry row. No
   table row runs them; they memoise against `emitPassGen` and their own generation keys.
3. **`emitModule`** writes the sections in wasm order: type (`emitTypeSection`), import,
   function, table, memory, global, export, start, element, data count, code, data, and the
   name section (`emitNameSection`, only when names are requested). The code payload (one body
   per function, built through the function builder in `emit_base.vl`/`emit_bytes.vl`) is built
   before the global and element sections are framed, because lowering a body is what adds
   globals and marks the functions whose address is taken (`frameGlobalSection`). The driver
   appends the `vl-src` custom section (`emitSrcSection`, `driver.vl`), which maps code offsets
   to source lines for trap frames.

Expression and statement lowering is `wasmEmit.vl`. Module-level emitter state is in
`emit_state.vl`.

Detail: `docs/internals/emit-sections-notes.md`, `docs/internals/emitter-module-state.md`,
`docs/internals/rep-descriptor-campaign.md`. `docs/internals/codegen-architecture.md` is
**historical**: a pre-landing design for the function builder that still places `emitProgram`
in `wasmEmit.vl`. Read it for the builder's rationale, not as a map of the current emitter.

### 2.5 Optimisation and the hosts

Three hosts run emitted modules:

| host | where | imports it provides | `-O` |
| --- | --- | --- | --- |
| native | `scripts/vl-host/src/main.rs` (Rust, wasmtime) | print, `extern`, files, process, args and environment, errno | yes |
| Deno test host | `tests/support/runWasm.ts` | `vlHostImports` | no |
| playground | `playground/src/runtime.ts` | `vlHostImports` | no |

**The import ABI.** An emitted module imports only what it uses. The shared part, in
`compiler/vlHostImports.ts`, is the seven `__print_*__` sinks and `extern.nowMillis`. The native
host defines the rest per module, from the module's own import list and with the module's own
signatures (`register_fs_imports`, `register_extern_imports`), so a drift between emitter and
host fails at instantiation and names the import. **Errno** is per instance: an fs handler sets
a positive WASI errno on failure (`wasi_errno`) and `__fs_errno__` reads it (`std:fs`). The
seed's own ABI is checked when the host loads it (`check_seed_abi`, against the checker's
`speaksAbi`), so a seed and a host that disagree refuse rather than miscompile.

**The compile cache** (`scripts/vl-host/src/compile_cache.rs`, opt-in with
`VL_COMPILE_CACHE=1`) stores the bytes a compile emitted, keyed on what the host knows before
the guest runs (seed, host build, environment, arguments, entry file) plus a transcript of every
module the guest asked for and the hash of each reply. A lookup replays the transcript against
the filesystem instead of running the guest. A failed compile stores nothing, and a verify mode
recompiles and exits 71 on a mismatch. Separately, the host caches the seed's compiled machine
code beside it (`seed_cache_path`). Detail: `docs/internals/incremental-compilation-design.md`.

The native host:

- **In:** the module bytes. **Out:** a validated, optionally optimised module, run under the host
  ABI.
- **Contract:** without `-O`, the host runs exactly what the compiler emitted. With `-O`, it runs
  binaryen's `wasm-opt` and its own passes (inlining, multi-value, flattening); each `-O` pass
  preserves the module's observable behaviour and is graded on that.
- **Must not:** parse or type VL. A host pass is a wasm-to-wasm transform. It must not depend on
  VL source facts that are not in the module; if it needs one, the emitter writes it into a named
  custom section.

The two JavaScript hosts cannot run `-O`, so an `-O` build runs only natively
([§7](#7-known-deviations)).

Detail: `docs/internals/opt-profile-design.md`, `docs/internals/binaryen-transition.md`,
`docs/internals/native-modules-design.md`.

## 3. Core data structures

### 3.1 The node arena and its columns

`P.nodes` (`ast.vl`) is the arena; a node is its index. Facts about nodes live in parallel arrays
indexed by node index, owned by the phase that produces the fact. A column is read through a
bounded accessor that returns a declared sentinel for an index past its length; the sentinel is
part of the accessor's contract ([§4.5](#45-sentinels)).

### 3.2 The type arena

`T.tys` (the `Checker` record `T`, `check_types.vl`) holds every type the checker builds, as
elements of the `Ty` union: primitive, error, object, function, union, nullable, array, map,
type variable, literal, negation. A type is identified by its index. The arena is **not
hash-consed**: two indices can hold structurally equal types, and type equality is a function,
not an index comparison. The emitter's interner is separate, in `emit_rep.vl`
([§3.3](#33-canon-spellings-and-interned-ids)). Each node's type is `nodeTyIx[node]`.

### 3.3 Canon spellings and interned ids

Two distinct mechanisms carry "the same type" across the phases, and they must not be confused:

- **Canon** (in the checker, end of each pass) rewrites every type annotation and union variant
  name in the arena into the emitter's spelling, and banks the originals so a re-check can restore
  them. It also records which annotation nodes it rewrote and the arena type each spelling stands
  for. Canon is a spelling rewrite, not an interner.
- **Interned ids** (in the emitter): `emit_rep.vl` hash-conses types in its `hc*` table
  (`hcIntern`, reset by `hcReset`), which gives `repCanonId` its ids; it interns rep trees in
  `rtIntern`, keyed by `rtInternKeyOf`; and the collect pass interns record shapes. An interned id is the emitter's structural identity
  for a type.

`tyToEmitName` renders an arena type in the emitter's spelling. Rendering is for **output**:
names in the module, diagnostics, and keys that must be printable. It is not a way to ask a
question about a type ([§4.1](#41-one-producer-per-fact)).

### 3.4 Reps and rep classifiers

A **rep** is how a value of a type is laid out in wasm: an `i32`, an `f64`, a struct reference, a
boxed union with a tag, a nullable reference, a niche-encoded nullable variant, a list with a
given element layout, a closure. `VKind` (`emit_state.vl`) is the closed set of rep kinds. A
**rep classifier** answers "what is this node's or this type's rep".

Contract: a value's rep is a function of its **checked type** (per instance, after
monomorphization) and of nothing else. Two positions that deliver the same type agree on its rep.
A box's tag numbering is positional in the union's member sequence, so a member set is never
deduplicated or reordered once registered.

Detail: `docs/internals/rep-descriptor-campaign.md`, `docs/internals/litunion-compact-rep-design.md`,
`docs/internals/unboxed-union-rep-design.md`, `docs/internals/per-rep-ladder-audit.md`.

### 3.5 Monomorphization instances

Generic functions are compiled by **per-call-site monomorphization**: each distinct instantiation
of a generic function becomes its own wasm function. The first instance takes the generic
function's slot; later ones are appended under a suffixed name. An instance is identified by its
**instance key**, the binding of the function's type parameters.

Contract: an instance's binding is the binding the checker resolved at the call; the instance's
node types are the generic body's types under that binding.

Detail: `docs/internals/monomorphization-design.md`.

## 4. Invariants

### 4.1 One producer per fact

Every fact about a program — a node's type, a call's type-argument binding, a value's rep, a
shape's registry row — has **one producer**, and every consumer reads that producer. A second
producer is a fact computed twice by two methods; it is correct only while both agree, and
nothing checks that they do. Where a consumer needs the fact in another form (an id instead of a
spelling, a per-instance answer instead of a generic one), the producer banks that form; the
consumer does not derive it.

Rendering a type and parsing the string back is a second producer by construction: the parser
was written for annotation spellings and answers for the spelling, not for the type.

### 4.2 A refusal is decided once, at the phase that owns its rule

- **Design rules** (what programs mean) are refused by the checker, with a diagnostic that names
  the rule.
- The emitter refuses only as an **invariant floor**. Its message reads as an internal error, so
  a user who reaches it knows it is a compiler bug.
- A refusal's wording describes the rule, not the code path that fired. Before narrowing a
  refusal, run the plainest program its sentence forbids, for each thing it names.

Making a check-clean miscompile loud is hygiene; it does not satisfy clause 2 unless the
refusal is one the design owes. Detail: `docs/internals/check-reject-audit-2026-09.md`,
`docs/internals/emit-refusal-reachability-2026-09.md`, `docs/internals/emit-refusal-wording-2026-09.md`.

### 4.3 Checkpoint and rollback

A speculative check (a quiet probe) records a mark of every append-only table before it starts and
truncates every table back to that mark when it discards the attempt. A table added to the
checker is added to the mark. A probe that deliberately keeps something it recorded reads it
before rolling back; it never relies on a table being left out of the rollback.

### 4.4 `emitFail` does not halt

`emitFail` / `emitFailAt` (`emit_bytes.vl`) record the first failure message, reset the current
output buffer, and return `-1`. **Emission continues.** Consequently:

- every reader of a table that a failed step would have filled bound-checks its index;
- `emitProgram` returns failure if any failure was recorded, regardless of what was emitted
  afterwards;
- a probe written on `emitFail` says nothing about a program that compiles; validate it against a
  program that already fails.

### 4.5 Sentinels

A function that can answer "no answer" returns a declared sentinel (`-1`, `""`, a literal-union
member) that **cannot be a real answer**, and documents it. A table read whose index may be a
sentinel tests it first, or goes through a reader whose miss cannot be a real row. A sentinel
carried through another function is still a sentinel. A ladder over a closed kind set covers every
kind or ends in a named default (an `emitFail`, a sentence, or a delegation); a bare fall-through
value, or a `match`'s `_` arm, is not a default. Detail: `docs/internals/sentinel-index-lint.md`,
`docs/internals/kind-ladder-lint.md`.

### 4.6 std resolution

`std:` modules are resolved by the host, in order: `$VL_STD`; on a development build, the nearest
ancestor of the **executable** that holds `compiler/entry.vl` and `std/`; otherwise the copy
embedded in the binary (`std_source`). A distribution
build never reads a development tree. The test runners (Deno) resolve `std:` relative to the
checkout, independently of the host. Consequence: a native probe run from an agent worktree reads
the main checkout's `std/` unless `VL_STD` points at the worktree.

**Embedded std.** `deno task gen-std` (`scripts/gen-std.ts`) walks `std/` once and writes the
checked-in copies: `scripts/vl-host/src/std_embedded.rs` (the binary's), `std/embedded.ts` (the
LSP's and the playground's), and `compiler/std_receivers.vl` (std's receiver-style exports,
which the checker's missing-import hint names without loading the module).
`tests/std_embedded_test.ts` fails when any of them is stale, so an edit to `std/` is not done
until it is regenerated.

The seed resolves by a similar ladder (`resolve_compiler_with_origin`): `--compiler`,
`$VL_COMPILER_WASM`, then, on a development build only, **two** rungs, `build/vl-compiler.wasm`
in the working directory (`SeedOrigin::Cwd`) and then the one in the executable's tree
(`SeedOrigin::DevTree`), and last the embedded seed. So on a development build the seed's first
tree rung reads the **working directory**, while std's reads the executable's ancestors. See
[Known deviations](#7-known-deviations).

std itself is version-locked to the compiler and is reviewed as API surface:
`docs/internals/std-design.md`, `docs/internals/std-api-review.md`.

### 4.7 State is reset per compilation

Every module-scope variable in the compiler is either reset at the start of a compilation or is a
memo whose key includes what it depends on. A memo keyed on table lengths is blind to an in-place
fill; key it on a generation counter. A compilation must produce the same bytes whether it runs
alone or after another compilation in the same instance (the LSP, `vl test`).

## 5. Bootstrap and the seed

The compiler is the VL program rooted at `compiler/entry.vl`. `build/vl-compiler.wasm` is that
program compiled by the previous seed.

- **Refresh.** `scripts/refresh-compiler.sh` compiles `compiler/` with the current seed, runs a
  sanity program with the result, and replaces the seed atomically only if it passes. After any
  edit to `compiler/*.vl`, refresh before testing; a stale seed tests the previous compiler.
- **Fixpoint.** `refresh-compiler.sh --prove-fixpoint` compiles the compiler with itself until two
  successive builds are byte-identical. A change to code generation must reach the fixpoint; a
  change that does not converge is a defect in the change.
- **Byte identity as proof.** A refactor or comment-only change produces a byte-identical seed.
  That is the proof that it changed no behaviour; one differing byte means it did.
- **Seed size.** The seed's byte size is gated against a committed baseline
  (`scripts/seed-size.vl --check`; red above +3%). Growth is recorded in the PR that causes it,
  read from the fixpoint build.
- **Cost.** The self-compile's guest fuel is gated (`scripts/self-compile-time.sh`). A cost
  regression appears one bootstrap step late: the candidate builds fast with the old seed and
  slowly when it compiles itself.
- **No host imports.** The seed must load with no host imports beyond its ABI. Code in
  `compiler/` therefore cannot use string interpolation (it desugars to a `std:` call); the lint
  rule `compiler-no-interpolation` refuses it.
- **An instrumented compiler poisons the seed.** A probe compiled into the emitter is carried into
  every later build by refresh. Recover by restoring a pristine seed, not by reverting the source.

Detail: `docs/internals/genesis-design.md`, `docs/internals/selfhost-g2-spec.md`,
`docs/internals/profiling-the-compiler.md`.

## 6. Tools and who owns which logic

The compiler is the only implementation of the language. Every tool runs the **seed** for any
question about VL source — lexing, parsing, checking, formatting, linting, symbols — and owns only
its transport. A tool that re-implements a compiler fact (a lexer, a module resolver, a
diagnostic table) is a mirror, and a mirror needs a test that compares it against the seed or it
will drift.

| tool | where | owns | delegates to the seed |
| --- | --- | --- | --- |
| CLI | `compiler/cli.vl`, `compiler/cli_util.vl`, host `main.rs` | argument parsing, file discovery, exit codes, output format | everything about VL source |
| host | `scripts/vl-host/src` | file and process ABI, std and seed resolution, compile cache, running modules, `-O` | compiling |
| LSP | `lsp/src` (`server.ts`, `wasmChecker*.ts`, `vlRoot.ts`) | the protocol, editor state, finding the VL checkout | diagnostics, symbols, inlay hints, formatting, via `wasmChecker` |
| playground | `playground/` | the browser UI | the same `wasmChecker` features |
| formatter | `compiler/format.vl` (`vl fmt`) | layout | — (it is the seed) |
| lint | `compiler/lint.vl` (`vl lint`) | language and repo rules | — (it is the seed) |
| test runner | `compiler/cli.vl` (`vl test`), host `main.rs` | executing test modules across a pool | discovery, compiling, planning, reporting |
| ratchets | `compiler/cli_budget.vl` (`vl check --budget`) | a per-file count that may only fall, with `--why` | the findings, when the rule exists in `lint.vl` |
| TS mirrors | `compiler/moduleGate.ts`, `compiler/vlSrcSection.ts` | the module-arming predicate; the `vl-src` section reader | nothing; each is a mirror |
| TS vocabulary | `compiler/coreTypes.ts`, `compiler/diagnostics.ts`, `compiler/vlHostImports.ts` | shared types for the editor layer; the JS hosts' import table | nothing; leaves with no compiler logic |

Rules:

- **Share, do not mirror.** A feature both the LSP and the playground offer is implemented once
  over `wasmChecker`. A repo lint rule is written once, in VL; its ratchet reads `vl lint --json`.
- **Exit codes are one named table** shared by the CLI and the host. 0 is success and 70
  (`EX_SOFTWARE`) is an internal compiler trap or an invalid emitted module, so a user can tell a
  compiler bug from an error in their program.
- **The host does not know VL.** Its `-O` passes are wasm transforms ([§2.5](#25-optimisation-and-the-hosts)).
- **Mirrors are tested against their original.** `compiler/moduleGate.ts` answers "does this
  source need the module fetch loop" for the TS hosts; the same predicate is written in
  `cli_util.vl` (`cliNeedsModules`) and in the native host, and
  `tests/module_gate_agreement_test.ts` requires the copies to agree. `compiler/vlSrcSection.ts`
  reads the `vl-src` section for the JS hosts, and the native host reads it in `main.rs`.

**The LSP.** `lsp/src/server.ts` speaks the protocol and owns editor state; every question about
source goes to a seed instance through `wasmChecker.ts` (`wasmCheckerNode.ts` loads it in Node,
`playground/src/wasmCheckerBrowser.ts` in the browser). Symbols and references come from the
compiler's own tables: `compiler/symbols.vl` (the identifier intern table) and
`compiler/srcmap.vl` (which file a token came from). `lsp/src/vlRoot.ts` decides whether an open
file belongs to the VL checkout (`vlRootFor`, `lintPathFor`) by walking up from the document's
own path, never from the workspace folder. The std the editor sees is `std/embedded.ts`
([§4.6](#46-std-resolution)).

**`vl test`.** The runner's logic is in `compiler/cli.vl`; the host only executes. The CLI
discovers `*.test.vl` files (`cliEndsTestVl`), compiles each with `compileSrc` (in a pool of
fresh compiler instances when there are several), and hands the bytes to the host through the
CLI command queue (`CMD_TEST_STASH`, `CMD_TEST_COLLECT`, `CMD_TEST_RUN`). The host instantiates
each module, which runs its registrations, reads the registry back through the module's `vlt*`
exports (`collect_test_file`), and runs the selected tests one instance per file
(`run_test_file`). A file that does not compile is a failing entry with its real diagnostics,
and the run continues. Detail: `docs/internals/vl-test-design.md` (what shipped),
`docs/internals/test-runner-design.md` (the charter).

**Lint path scoping.** Some lint rules apply only to this repository's own `compiler/` or
`std/` (`compiler-no-interpolation`, `std-comment-audience`). `lint.vl` matches them on a bare
path prefix (`scaIsCompiler`, `scaIsStd`), set per run by `lintSetPath` and consumed once at the
top of `lint()`. The caller makes the path checkout-relative against the checkout it actually
resolves, or passes `""` to decline every scoped rule: the CLI relativizes against the tree
`std:` resolves from (`lintScopeKeyOf`, `vlRootPush`/`vlRootCommit` in `driver.vl`), and the LSP
uses `lintPathFor`. An unrelated project's own `src/compiler/` is never in scope.

**Gates.** `scripts/gate.sh` is the merge gate. It refreshes the seed, fans every gate out in
parallel, and prints a per-gate table of wall time, CPU time and exit code. The rows are the
Deno suites, the native and seed-backed suites (`ci-native`, including the editor suites whose
list it reads from `ci.yml`), the native fixpoint, `lint-self.sh`, the distilled corpus
(`scripts/silent-sweep/distilled/regress.vl`, which blocks only on a `runs → not-runs` cell),
the filed-witness check, the seed-size and fuel ratchets, and the per-file lint ratchets. A tool
change is graded by the gate rows that cover it, not by a hand run, and a gate is read by its
exit code or its summary line. `CLAUDE.md` ("Gates") says what each row is for and its time
budget.

Detail: `docs/internals/cli-design.md`, `docs/internals/test-runner-design.md`,
`docs/internals/syntax-tree-api-design.md`, `docs/internals/format-notes.md`,
`docs/internals/comment-style.md`.

## 7. Known deviations

Each line is a place the tree does not meet a contract above, measured on 2026-10-11 at
`5d4cd14dc`. The item it links to has the numbers, the proposed fix and its first PR. Remove a
line in the PR that closes it. The order in which they are closed is
[`internals/architecture-refactor-plan.md`](internals/architecture-refactor-plan.md).

| contract | deviation | item |
| --- | --- | --- |
| §3.5, §4.1 | The checker computes each generic call's binding and discards it; the emitter rebuilds it (`monoArgTyName`, `bindGenWalk` re-runs), and an instance node's checker type is the generic's. The monomorphizer's write index is keyed by the written declaration, not by name, and the let slot answers alias chains and writtenness by declaration; some name lists remain. A written `let` holding function values is lowered at the join of the pins its value flows to, read from the function-value flow table rather than from the order its deliveries are met, and a list element or record field holding one unwritten generic is instanced per call. | [L1](internals/code-quality-2026-10.md#L1) |
| §2.4, §3.4, §4.1 | The emitter answers type questions by rendering (`tyToEmitName`, 106 calls in `scripts/render-parse-budget-baseline.json`) and re-parsing the spelling; rep classifiers read two producers for one answer (arena with name, spelling, table or frame). | [L2](internals/code-quality-2026-10.md#L2) |
| §2.4, §4.2 | The emitter decides legality: 140 of 676 `emitFail` sites are legality-worded by a hand classification at `5d4cd14dc`; the `checkFnParams` pass-table row (`checkParams`) refuses parameter types at emit; a value-`if` arm that yields no value is check-clean and refused at emit (D4071); an excess field into a record with a literal-typed field is check-clean invalid wasm (D4070). The `checkTopLevel` row has been a no-op since D1080 and is not a deviation. | [L3](internals/code-quality-2026-10.md#L3) |
| §2.1 | The lexer and `ast.vl` each declare a `Tok` record. | [S-c](internals/code-quality-2026-10.md#small-items) |
| §3.1, §4.5 | Table reads whose index may be a sentinel and is not tested: **312** `sentinel-index-unguarded` findings stand in `scripts/sentinel-budget-baseline.json` (baseline commit `16fd60a24`), a ratchet that may only fall. A finding is not a bug; a seeded sample graded most UNDECIDED. | `docs/internals/sentinel-index-lint.md` |
| §4.5 | Ladders over a closed kind set with a bare default: **363** `kind-ladder-incomplete` and **8** `kind-ladder-split` findings stand in `scripts/ladder-budget-baseline.json` (baseline commit `16fd60a24`). | `docs/internals/kind-ladder-lint.md` |
| §4.7 | Module-scope emitter state that no reset clears: `scripts/emitter-state-audit.vl` counts **225** never-cleared of 1,165 mutables, a ratchet that may only fall (`--check`, `scripts/emitter-state-baseline.json`, baseline commit `8cb49ac84`). | [L7](internals/code-quality-2026-10.md#L7) |
| §4.3 | The seven quiet probes share one `checkRollback` and each site names its own family set; the census finds only `cstrProbeBefore`'s constraint rows left, which it keeps by design (D3062). Keyed maps beside the tables (`tpIfJoinAt`, `tpIfOkAt`, `dJoinRelayed`) are not rolled back. | [L4](internals/code-quality-2026-10.md#L4) |
| §2.3 | The solve-and-re-check phases run through one driver with a budget per phase (`compiler/check_pins.vl`), and un-annotated export parameters are inferred from what `solveUnannotParams` observed; the driver still re-checks again for generated walkers. | [L5](internals/code-quality-2026-10.md#L5) |
| §3.3, §4.1 | Emitter registries are keyed by spelling; type equality has eight notions. The union-key licence is gated by `tests/vl_union_key_licence_test.ts`, and the `name-only` rule is classified (2,248 to 1,800), and the site switch is under way (12 sites answer from the key). | [L6](internals/code-quality-2026-10.md#L6) |
| §4.7 | Expected types reach the expression emitter through ambient module state; the return, `let`, assignment, direct-call and struct-field boundaries (`emitReturnValue`, `emitLetDeclStmt`, `emitAssign`, `emitDirectCall`, `emitStructFieldValue`) no longer write it, each building an `ExpCtx` and restoring the caller's on every exit, while `emitVariantFieldValue`, `emitArr`, `emitCallRef`, `emitUnionCoerce` and `emitStartFnCode` follow the same pattern (the list literal's per-arm element seeds no longer leak to the caller or skip their restore on a failure path), as do `emitConstCellInit` and `emitLowMemAccessorCall`. Every expected-type seed in the emitter is now delivered through `ExpCtx`: the `pending*` globals are written only by `expCtxApply`. Memos carry their own generation keys. | [L7](internals/code-quality-2026-10.md#L7) |
| §2.3, §2.4 | Structural type steps were written separately in the checker and the emitter. Both phases now import the arena type-shape queries from one module, `compiler/tyquery.vl`, and the exact twins found so far have one copy each there. The emitter still asks many queries through a rendered type spelling; those are L2's. | [L8](internals/code-quality-2026-10.md#L8) |
| §2.5, §6 | The `-O` optimizer is moving from the host into the compiler: the run-once scan, the `wasm-opt` argv and `vl-src` strip, and the escape step's choice and renames run in the compiler and their Rust is deleted; the inline, multi-value and flat steps remain Rust until their rungs land, and the Deno and playground hosts cannot run `-O`. | [L10](internals/code-quality-2026-10.md#L10) |
| §6 | Repo lint rules are written in both `lint.vl` and Python; the interp, sentinel, comment, arena-scan, ladder, export and render-parse ratchets are held and written by `vl check --budget`, and `ratchet.py` is deleted. | [L11](internals/code-quality-2026-10.md#L11) |
| §6 | `lsp/src/features.ts` holds every LSP feature (folding, navigation, hover, inlay hints, semantic tokens, completion, formatting, code actions, code lens, rename) as plain functions. `server.ts` is transport only (T5), and the playground adapter now calls them too; only code lens is server-only, because it needs the workspace use-map. | [L12](internals/code-quality-2026-10.md#L12) |
| §6 | Errno numbers are stated in three places with no agreement check. | [L13](internals/code-quality-2026-10.md#L13) |
| §6 | Exit codes are bare literals. The LSP's lexer and module resolver are held to the seed by agreement tests. | [S-i, S-j](internals/code-quality-2026-10.md#small-items) |
| §4.6 | On a development build the seed resolves from the working directory and std from the executable's tree. | owner ruling pending (September row 19, [status](internals/code-quality-2026-10.md#september-status)) |
| §2.4 | The emitter dispatches its pass table by string name through an if-ladder. The emitter's phase is one `EmitPhase` literal union advanced only by `emitProgram`, and `emitTypeSection` walks the allocation order `mAllocType` records. | [S-h](internals/code-quality-2026-10.md#small-items), [L14](internals/code-quality-2026-10.md#L14) |

Two placements in §2 differ from how the phases are often described, and are the contract, not
deviations: monomorphization is a pass inside the emitter's pass table, not a phase between the
checker and the emitter; and `emitProgram` lives in `emit_sections.vl`, not `wasmEmit.vl`.

## 8. Relation to a language specification

A specification of VL — what a program means, which programs are legal, what each construct
evaluates to — belongs in `docs/spec/`, which does not exist yet. The two documents divide the
work this way:

- The **specification** defines the language. Clause 2 is read against it: a refusal is valid
  only if the specification forbids the program. Until it exists, the design is stated by the
  owner's rulings (`docs/internals/open-rulings.md`, `DECISIONS.md`).
- **This document** defines how the compiler implements the specification: which phase decides
  each kind of fact, and which phase may refuse. It never states a language rule; where it needs
  one, it cites the ruling.

A language change therefore edits the specification (or records a ruling) and the checker. It
edits this document only if it moves a responsibility between phases.
