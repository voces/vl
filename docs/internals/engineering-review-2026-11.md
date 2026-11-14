# VL engineering review, 2026-11-14

An outside read of the whole project at master `498e6419`: compiler, host, std, tooling, tests and
process. Seven reviewers each read one area (frontend; checker; emitter, mono and rep; optimizer and
performance; driver, CLI and host; language and std; tooling, tests and process). Their findings were
merged here, and the headline claims were re-run on a native `vl` built from this commit with the
`seed-latest` seed (5,260,584 bytes).

Each claim is marked **[ran]** (observed on that binary), **[read]** (read in the source at a cited
path) or **[inferred]**. Nothing was changed in the tree and no gate was run. Counts are regex counts
over `compiler/*.vl` unless a file is named.

---

## 1. Verdict

VL works. A zero-annotation program with records, closures, maps, generic helpers, mutual recursion
and JSON compiles and runs; field access is a direct `struct.get`; generics monomorphize; startup is
about 5 ms **[ran]**. The verification culture (kill matrix, ratchets driven to zero, fixpoint gate,
never-baselineable fuzz classes) is better than most production compilers have.

The cost of getting there is the finding. The compiler is 402k lines, with 4,673 module-level
mutable `let`s, 679 `emitFail` call sites, and a defect inventory that took about 5,000 rows in 75
days at a rate that is not falling. That volume is not a quality-control problem. It follows from
four design choices, and process cannot pay any of them off:

1. **There is no intermediate representation.** The surface AST is parsed lossy, mutated in place by
   30-odd passes, cloned by mono, and lowered straight to bytes. Every lowering site re-derives where
   a coercion, a temporary or a cast goes. The `-O` passes then re-decode the bytes to rediscover
   types the compiler just threw away.
2. **An un-annotated function is a template with no interface.** It is checked per call site, like a
   C++ template. That decides the diagnostics, the compile-time curve, the LSP latency and the
   impossibility of separate compilation.
3. **Phases communicate through global tables, not values.** No phase has a product another phase
   receives. Speculation is undone by bitmask rollback over 23 table families. Nothing is re-entrant.
4. **The representation vocabulary is enumerated, not composed.** `"f64list"`, `"nulf64list"`,
   `"nulu8list"` and 29 more string tags stand where `List(Nullable(F64))` should be, so every
   consumer is a ladder and every missing cell is a refusal.

The project's own target architecture (one producer per fact; the emitter only translates;
`repOf(ty)`) is correct and its Status table shows real deletions. It stops one step short on each
side: it has no explicit IR, and it keeps the gradual first pass in the checker.

### Scorecard against the stated goal

| Goal | Grade | Why |
|---|---|---|
| Inference-first | Partly met | Common programs need no annotations. Inference has no principal types, is order-dependent, and fails on ordinary shapes (§3.1). The compiler itself is almost fully annotated: 17 functions have an un-annotated parameter. |
| Structural | Partly met | Records and unions are structural. Width subtyping works only when the narrow type's fields are an alphabetical prefix of the wide one's (§3.2). Structural-only sums collide. |
| Type-safe | Mostly met | No `any`, null-safe, no lossy implicit numerics. Soundness for mutable covariance rests on a ~6k-line write-effect analysis; the nightly fuzzer still finds unsound output at about 1 per 200 fresh programs (`fuzz-nightly.yml`). |
| High-performance | Met for scalar and call-heavy code; not for strings, arrays or hashed collections | §3.3. No optimization runs by default; `-O` needs an external `wasm-opt` and is not reliably faster. |
| Tooling | Broad, not yet scalable | One compiler serves CLI, LSP and playground. The LSP re-runs the batch pipeline per keystroke with no cancellation; `vl check` on the compiler took 18 s here **[ran]**. |

---

## 2. What is good and should be kept

- **The import-free seed driven by a command pump.** One wasm artifact serves wasmtime, Deno, the
  browser and the LSP, and makes transcript caching sound by construction.
- **`assignable` / `assignableGo`** (`check_relate_core.vl:4037`): a pure, coinductive relation whose
  structural tail is an exhaustive `_`-less `match`. The best code in the checker.
- **`rtGo`** (`emit_rep.vl:4671`): the rep tree as a memoized, exhaustive match over `Ty`.
- **The instruction builders** (`emit_bytes.vl`, 139 `fb*` over named `OP_*`): about 4,600 builder
  calls against 43 raw byte pushes in `wasmEmit.vl`.
- **Generated code where it works**: direct field access, callback specialization down to
  `return_call`, 4× loop unrolling, in-place string append **[ran, disassembled]**.
- **Small functions.** Median 12 lines, p99 132, none over 458. The size problem is coupling, not
  function length.
- **The kill matrix and the deletion rule for gate checks**, the generic `--budget` ratchet, the
  self-checking ROADMAP, the fuel-based cost gates, and the cache-envelope checks on user modules.
- **Language choices**: null safety, the `as` / `as?` / `as!` trio, results for absence and traps for
  bugs, typed equality, no exceptions.

---

## 3. Findings re-run for this review

### 3.1 Inference stops on ordinary programs **[ran]**

```
function sum(xs) { let t = 0  for x in xs { t = t + x }  t }
print(sum([1, 2, 3]))
// 3:12: for-in expects an array, a map or a string, got _
```

The `while i < xs.length` spelling of the same function runs. The for-in ladder
(`check_statements.vl:1665`) has no arm for a hole. This is the general shape of the checker's
defects: a hole is a dynamic type inside the body, each operation on it needs its own deferred
constraint table (there are ten), and an operation with no table is a gap.

```
function compose(f, g) { (x) => f(g(x)) }
// 1:27: cannot infer a type for parameter `x`
```

```
function sum(xs) { let t = 0  ...  t = t + xs[i] ... }
print(sum([1.5, 2.5]))
// cannot assign f64 to i32 (the body of `sum` at the call's argument types)
```

`let t = 0` pins `i32`, so a generic numeric sum cannot be written without an annotation, and the
caller of a library function gets an error about the library's body.

**Semantic action at a distance.** With

```
// lib.vl
export let origin = { x: 1, y: 2 }
export function half() { origin.x / 2 }
```

`half()` prints `0` in a program that only imports `half`, and `0.5` in a program that also passes
`origin` to a `{ x: f64, y: f64 }` parameter. This is ruled behaviour, not a bug. It means a module
has no meaning on its own, which rules out separate compilation and stable library APIs.

### 3.2 Width subtyping depends on field-name spelling **[ran]**

```
type Cat = { name: string, age: i32 }
function name(a: { name: string }): string { a.name }
print(name(c))        // refused: "type-valid ... but not yet supported by codegen"
```

Rename `age` to `zz` and it prints `tom`. Fields are laid out name-sorted and a wider row is a wasm
subtype only of its prefix, so `{age, name}` is not a subtype of `{name}` while `{name, zz}` is. This
is the most common structural-typing program there is, and it contradicts the status note under spec
T4.6. A WasmGC struct has one supertype chain, so this needs a design decision, not a fix (§5, L3).

### 3.3 Performance against Rust and Node **[ran]**

Single runs, twice each, on a shared 4-core box, `vl build` with no `-O` (no `wasm-opt` here), Rust
`-O -C target-cpu=native`, Node 22. Treat as ±20%. The committed sweep (`bench/results/summary.md`)
is from 2026-08-03 and predates UTF-8 strings.

| Benchmark | VL ms | Rust ms | Node ms | VL / Rust | VL / Node |
|---|--:|--:|--:|--:|--:|
| recursion/fib | 1215 | 780 | 2166 | 1.6 | 0.56 |
| collections/map-string | 2380 | 1048 | 1980 | 2.3 | 1.2 |
| collections/word-freq | 918 | 283 | 760 | 3.2 | 1.2 |
| arrays/fill-sum | 1228 | 234 | 1110 | 5.2 | 1.1 |
| arrays/matmul | 2007 | 274 | 804 | 7.3 | 2.5 |
| strings/substr-search | 670 | 53 | 209 | 12.6 | 3.2 |
| strings/str-eq | 1150 | 52 | 647 | 22 | 1.8 |
| strings/concat-build | 205 | 6.5 | 93 | 31 | 2.2 |

So the string losses survived the UTF-8 change. VL beats V8 on calls, is level with it on maps and
simple array loops, and is 2–3× behind it on strings and nested array indexing.

Why, from the code and the perf docs **[read]**:

- **No optimization by default.** `vl build` and `vl run` do no inlining, CSE or LICM. `-O` runs
  three struct-layout rewrites written in VL and then binaryen; without `wasm-opt` on `PATH` it
  prints a note, exits 0 and writes the unoptimized module.
- **The engine.** Cranelift does not inline and keeps reference locals in stack slots. The project's
  own decoder study found the same bytes 2–7× faster on V8; "the engine, not the code, is the
  first-order term" (`perf-decoder-gap-2026-09.md`).
- **Representation costs in the emitted code** **[ran, disassembled]**: an `i32` put into
  `i32 | string` is two allocations (a value box inside a `{tag, anyref}` box) and reading it is a
  tag load, a load, a `ref.cast` and a load; `xs[i]` is two loads, an explicit bounds check and an
  `array.get` the engine bounds-checks again; a closure is two allocations and a `call_indirect`;
  every struct field is declared mutable.
- **std strings** decode to an `i32[]` of code points and re-encode for `join`, `replaceAll` and
  `repeat`; there is no byte builder.
- **Nothing gates generated-code speed.** The CI cost gates measure the compiler's fuel, which is
  blind to the quality of the code it emits.

The idiomatic spelling is also the slow one: `docs/guide/costs.md` tells users to prefer `i32[]` with
`-1` over `(i32 | null)[]`, and the compiler follows that advice about 7,000 times. The sentinel lint
then polices what the representation incentivises.

---

## 4. Findings by area

### 4.1 Frontend

- Tokens are a literal union and nodes are a real union of records. This is not integer-tag C.
- **The AST is neither a syntax tree nor a semantic tree.** The parser desugars templates to `+`
  chains, `a op= b` to `a = a op b`, and drops `export`, then adds "surface markers" (`binCompound`,
  `binTpl`, `isNeg`, `parOpt`, `omDot`) so the formatter can undo it. Desugars share children, so the
  arena is a DAG that passes mutate in place (`ast.vl:2090`, `:548`).
- **Types are strings in the tree** (`TypeRef.tyName`, `AsExpr.asTy`), with a second integer-tagged
  type-spelling arena bolted on beside them (`ast.vl:692`). Operators are strings: 388
  `binOp == "…"` compares.
- **The parser does semantic work.** Block-scoped types are implemented by name mangling;
  `asTargetTakesTypeArgs` (`parser.vl:2311`) scans the whole token stream for a declaration to decide
  how `<` parses, so one expression parses differently for a local and an imported type.
- **Variants must use distinct field-name prefixes** so that structural discrimination works, and
  `BreakStmt` / `ContinueStmt` carry dummy fields to stay distinguishable (`ast.vl:6`, `:120`). A
  language limitation shaping the compiler's core data type.
- Every child reference is a bare `i32`; node, token, type and symbol indices are indistinguishable.
  The language has newtypes and the compiler does not use them here.
- Diagnostics come in three unrelated shapes (lexer, parser, checker); about 23 sites carry a code
  against about 513 free-string `tErr(` sites. A user-facing type error is followed by a Rust stack
  backtrace on a development build **[ran]**.
- The formatter is a recursive string printer with no document IR; it falls back to verbatim source
  slices where the tree lost the syntax.
- The kind-ladder lint forces `match` arms that enumerate 70–90 token kinds on one 200-character
  line (`parser.vl:556`) where a default is the right answer.

### 4.2 Checker

- Not one inference algorithm: a gradual, template-style walk, re-run in about nine modes under
  global flags (`inferQuiet`, `paramSolveProbe`, `cstrProbe`, `tyEqSoft`, …), with soundness restored
  afterwards by constraint replay and whole-program write analysis.
- **Types are not hash-consed.** The arena is append-only and mutated in place; four notions of
  equality coexist, one depth-capped at 24 and answering `false` on exhaustion (`check_types.vl:3972`).
  381 `depth` parameters carry magic caps that change answers.
- **Type variables are identified by name** (`"?" + fnName + "." + i`). `callFtyPinCstrs` (357 lines,
  11 parameters) spends its first hundred lines working out which declaration owns a constraint.
- **Rollback is by bitmask sum**: `RB_RETURNS = 2799615` (`check_rollback.vl:164`). A new table left
  out of a mask is a silent stale-state bug.
- **The delivery seam mixes judgment, elaboration and capability.** `assignableExprIn` runs about 40
  order-sensitive hooks around the pure predicate, and the checker issues "not yet supported by
  codegen" refusals. The checker is therefore also the emitter's capability oracle.
- **Mutable containers are covariant**, made sound by effect analysis. A parameter's acceptance then
  depends on the callee's body: adding a `push` to a function breaks distant callers.
- The checker's output is its global tables: non-checker files import 1,115 distinct checker symbols.
- Decomposition follows defect history. About 110 `hole*` functions in `check_relate_core.vl` are
  per-position judges.

### 4.3 Emitter, mono and rep

- 186k lines; `wasmEmit.vl` is 43k lines with five section banners and 102 imports.
- Large functions are split into `X` / `XGo` / `XCore` / `XTail` chains (80 such names) that share
  state through globals, which hides size without reducing coupling.
- **Hidden arguments.** `monoMakeInstanceGo` opens by reading and clearing five globals its caller
  set (`emit_mono.vl:9703`). `emitCoerced` re-enters `emitExpr` on the same node and prevents
  recursion with five "seat" globals (`wasmEmit.vl:31160`).
- **No temporaries.** Union `==` re-reads both operands per arm and refuses when an operand cannot be
  re-read. That is a missing let-binding.
- `emitFail` records and continues, so about 1,500 lines of `wasmEmit.vl` thread `-1` upward.
- 554 functions in `wasmEmit.vl` declare a `body: u8[]` parameter that six of them use.
- Mono clones the AST and still carries pins as strings: 601 `: string` annotations in `emit_mono.vl`.
- The section writer has 262 `wU8(<decimal>)` sites with the opcode in a comment
  (`emit_sections.vl:8900`).
- The compiler has no wasm validator; invalid modules are found by the engine.

### 4.4 Optimizer

- `opt_*.vl` (10k lines) re-decodes emitted bytes. Each of the two large passes carries its own
  emulation of the validator's operand stack (`opt_inline_scan.vl:1471`, `opt_multivalue.vl:1077`),
  over raw hex opcodes, and bails on anything it cannot read. Dataflow is adjacency matching on the
  op stream.
- The passes do something binaryen cannot (closed-world layout changes), at the wrong level.
- On committed readings `-O` is 2.2× slower than no optimization on one benchmark and `-O3` ties
  no optimization on another (`perf-landscape.md`, `p9-inlining-notes.md`).
- The shipped seed is itself unoptimized.

### 4.5 Driver, CLI, host, bootstrap

- `driver.vl` has 243 top-level `let`s. Modules are merged into one program by renaming top-level
  names with a `$m<id>` suffix; dozens of repair tables follow from that.
- Incrementality is two heuristic banks guarded by 20 mask bits and 14 decline codes, about 5k lines
  with `iface_hash.vl`. That is invalidation recovered by experiment, the highest-risk code in the
  area: a missed guard is a stale diagnostic.
- **The "thin host" is 11,779 lines in one file** (`main.rs`) with five tests, 56 `VL_*` variables,
  25 `process::exit` calls and global statics in place of a context.
- The seed exports about 470 names bound by hand in both Rust and TypeScript. The import-detection
  predicate exists four times in three languages (`moduleGate.ts:10` says so).
- **Security.** The seed's `.cwasm` sidecar is loaded with `unsafe Module::deserialize_file` whenever
  the file exists, with no digest or ownership check (`main.rs:2577`). A development build takes
  `./build/vl-compiler.wasm` from the current directory, so a hostile checkout gets native code
  execution. The user-module cache already has the correct envelope.
- **Bootstrap trust.** The seed is fetched from a mutable rolling release whose checksum lives beside
  it; a missing checksum only warns. No seed hash is pinned in git. There is no second
  implementation. The fixpoint proves self-consistency, and `publish-seed.yml` records a
  self-consistent miscompiling seed that passed it.
- Repo-only lint rules (about 15 of 37, including ~30 hand-copied tables of the compiler's own
  enums) ship in every user's compiler.
- No package model: only `./`, `../` and `std:` resolve.
- Hygiene: a tracked 0-byte `a.out`; `reference/ts-interpreter` imports a directory that does not
  exist; `Formula/vl.rb` and the release publish step are placeholders; six `.ts` host-glue files
  live in `compiler/`.

### 4.6 Language and std

- **No nominal sum type.** Sums are unions of records told apart by shape. A user value
  `{code: 1, msg: "mine"}` satisfies `is IoError` **[ran, by the language reviewer]**; `JsonError`
  gained a field to stop colliding with `Base64Error`.
- **No ad hoc polymorphism.** `print`, `==`, hashing and ordering are compiler magic; `print` takes
  only scalars (`print([1,2])` is an error); `std:math` ships `sinF64` / `sinF32` twins; `sort` has
  no default ordering; map keys are `string`, `i32` or `i64` only.
- An inferred record literal widens its discriminant (`{kind: "circle"}` is `{kind: string}`), and
  `match s.kind` does not narrow `s` while `if s.kind ==` does.
- Missing for real programs: tuples and destructuring, namespace imports, iterators, a string
  builder, stderr, time, random, a path module, streaming fs, inferred `never`.
- std conventions are mostly consistent; `IoResult = IoError | null` inverts the "null is absence"
  reading used everywhere else.
- The spec is well formed (numbered rules, status markers) but specifies inference only by example,
  has no grammar, and is tied to no test. `DECISIONS.md` is 11,905 lines under a header asking for
  2–4 line entries.

### 4.7 Tests, tooling and process

- 8,006 golden fixtures and 275 harnesses, almost all end-to-end. No pass has a unit test, because
  passes share global arenas.
- **No independent oracle.** Expectations are written against the compiler's own output; the
  distilled corpus grades outcome class, not values.
- 188 test files skip when the seed is absent, a silent pass on a fresh clone. Tests run `--no-check`.
- **Inventory**: 4,961 rows in about 75 days (1,172 in September, 1,859 in October, 854 in the first
  half of November). 23% were found while closing another row. The most-cited files are
  `emit_mono.vl`, `wasmEmit.vl` and `emit_classify.vl`. The defects are the product of type
  constructor × representation × delivery position × annotated-or-not, closed one cell at a time.
  The capability-matrix rule is the manual form of what an exhaustive (IR op × rep) lowering gives
  by construction.
- **Docs are an append-only agent memory**: 481k lines, 1,033 refactor notes (1,026 from November),
  30 MB of 76 MB tracked. There is no onboarding path past `ARCHITECTURE.md`. `AGENTS.md` cites a
  `tests/run.ts` that does not exist; `lsp/README.md` describes a TypeScript checker that is gone.
- Much of `CLAUDE.md` is scar tissue that a technical fix would retire: the kind-ladder and sentinel
  sections (sum types and option types), `VL_STD` and shared-cargo (hermetic `--std`, per-tree
  targets), seed poisoning (a tracing flag), the capability matrix (the IR).
- `scripts/` is 13,769 files, of which about 13,500 are corpus data. Roughly a dozen one-off probes,
  shadows and `.patch` files have no caller. Deletion discipline exists for gate checks only.

---

## 5. Comment quality

Sampled about 110 comment blocks across all areas; counts are over `compiler/*.vl`.

- **Local quality is good.** 14.9% of lines are comments. Blocks state a contract or a reason, are
  short, and are mostly accurate. The ratchet is at zero and it shows.
- **Global readability is poor.** The comments assume a private vocabulary that is defined nowhere:
  pin, seat, twin, row, slot, hole, floor, rung, bank, adopt, delivery, niche, atom, cascade, `sk`,
  `wi`, "S5". A newcomer cannot read `callFtyPinCstrs` or `emitCoerced` from their comments. A
  30-term glossary and a one-page pass map for each of the checker and the emitter would do more
  than any further trimming.
- **Defect ids stand in for invariants.** 4,822 comment lines cite a `D<id>` (1,824 blocks in the
  checker, 666 in `wasmEmit.vl`). Many lead with the id as the subject, which rule 4 of
  `comment-style.md` forbids, and explain a rule by its incident.
- **The 4-line cap is met by lengthening lines**: 52 comment lines over 140 characters in
  `wasmEmit.vl` (longest 297), 67 in `emit_sections.vl`. The lint counts lines, not content, and the
  cap squeezes rationale into dense prose.
- **"Load-bearing order" comments mark missing structure** (`assignableExprIn`, `assignableGo`,
  `kindTag`). Each is a dependency the code should express.
- **Staleness is not gated.** Examples: the `emit_rep.vl` header still says coverage is "deliberately
  partial" after step 7 closed; `tsStruct` describes an `(array i32)` string rep twenty lines above
  the UTF-8 one; `TyVar` is called "opaque" where it is gradual; several comments describe backtick
  templates the lexer rejects; `btTrimTo` works around a `.pop()` gap its neighbours no longer have.
- **Outside `compiler/*.vl` the policy does not apply and it shows.** `main.rs` is 22% comments with
  dates, PR numbers and capitalised emphasis; `publish-seed.yml` holds an incident diary; `lsp/src`
  carries stale measurements.
- **std comments** meet their rule and state edge cases well. They would gain from one runnable
  example line per export, with reference docs generated from it.

---

## 6. Recommendations

Ordered by leverage within each size. "Large" means weeks to a quarter, "medium" days to weeks,
"small" hours to a day.

### Large

**L1. A typed mid-level IR between elaboration and bytes.** Monomorphic, explicitly typed, ANF-style
or structured-CFG. Coercions, casts, box and unbox, closure construction, bounds checks and
temporaries are nodes; every node carries a closed rep. Mono becomes "instantiate into IR" (no AST
cloning, no string pins); the rewrite passes become IR-to-IR; unrolling, callback specialization,
escape analysis, LICM and bounds-check elimination move onto it and run by default; the emitter
becomes a total function from (IR op × rep) to instructions, exhaustive by `match`. This is the one
change that removes the capability-refusal class and bends the defect curve, and it retires most of
`opt_*.vl`. Migrate one function at a time behind the fixpoint gate. Add an IR verifier and, in debug
mode, a typed operand stack in the `fb*` layer so an invalid module fails at the emitting function.

**L2. Give un-annotated functions an inferred interface.** Infer a bounded or row-polymorphic
signature once per function, with today's deferred demands as real types; check calls against it and
report at the call site. Monomorphization stays as a backend strategy. Then make elaboration the only
body judgment and retire the ten constraint tables and the per-position `hole*` judges (the checker
reviewer estimates 15–25k lines). With it, **freeze exports at the module boundary**: an export's
types and layouts are inferred from its own module alone, which reverses the ruling behind the
`half()` result in §3.1. No annotation is required of the user; `vl` can print the inferred
signature. This is the precondition for separate compilation, a query-based LSP and a specifiable
inference algorithm. It is an owner ruling.

**L3. Decide the representation of width subtyping.** Recommended: treat a record-typed parameter as
row-polymorphic and monomorphize per concrete row (the "wider rows" machinery exists and keeps direct
`struct.get`); for storage positions add a slow path (a per-shape field map or accessor view) with
prefix subtyping as the fast path. Until then, stop refusing by alphabet silently: state the rule in
the spec.

**L4. Nominal variants with payloads.** `type Shape = Circle{r: f64} | Square{side: f64}`, with
inferred constructors and `match` narrowing on the discriminant. This fixes error-type collisions,
removes the field-prefix convention from `ast.vl`, maps onto WasmGC subtypes and `br_on_cast`, and
gives the compiler the type it needs to drop integer kinds.

**L5. Phase products and a session value.** `Parsed`, `Resolved`, `Checked`, `Elaborated` owned by a
`Session`, replacing reset-in-lockstep globals. Then replace the `sk` / `wi` banks with
dependency-tracked memoization and one invalidation rule, and replace rename-and-merge with
per-module scopes and symbol ids. Start with an explicit `EmitCtx` / `FnCtx` in mono, where the
hidden-argument convention is worst.

**L6. An independent oracle and a trust anchor.** A small definitional interpreter over the checked
tree or the IR, wired into the fuzzer for value-level differential checking. Record every published
seed hash in git and document a replayable chain from `seed-v0`.

### Medium

1. **Hash-cons the type arena** and give type variables binder identity. Equality becomes `==`,
   `assignable` gets a persistent memo, the depth caps and `tyMutEpoch` go, instance keys become id
   vectors.
2. **Make `Rep` an algebraic type** (`Scalar | Ref | List(Rep) | Nullable(Rep) | Union | Closure |
   Map`) and derive `VKind`, `FC_*` and `TSK_*` from it. The per-element-type function families
   collapse and "nested arrays are not supported" becomes unrepresentable.
3. **Split `assignableExpr`** into a pure `relate(src, dst) → Coercion | Mismatch` and one recorder.
4. **Cheapen the representations**, measuring each: `i31ref` for small union members and one flat box
   per scalar width; unboxed nullable scalars so `i32 | null` costs what `-1` does; `call_ref` or
   single-allocation closures; immutable fields where never written; one bounds check per index.
5. **Default-path optimization in the emitter** until L1 lands: inline small leaf functions and
   lambda arguments, hoist list headers, eliminate bounds checks from induction ranges, fuse string
   building. Add a byte builder to std and make `join` / `replaceAll` byte copies.
6. **A faithful syntax tree with a lowering pass**, `TypeExpr` nodes as the only type syntax, and a
   document-IR formatter. Newtype the indices (`NodeId`, `TokId`, `TyId`).
7. **One `Diag` record** for lexer, parser and checker (`code`, `severity`, `span`, `notes`, `fix`),
   with a code table.
8. **A halting emit failure** to remove the `-1` threading.
9. **Split `main.rs`** into modules with a `Ctx` struct, return exit codes to `main`, and add unit
   tests. Generate the seed ABI (Rust, TS, `entry.vl`) from one manifest.
10. **Move repo-only lint rules out of the shipped compiler** into a project rule pack; keep
    `--budget` generic.
11. **Minimal ad hoc polymorphism**: compiler-derived `show`, `hash` and `compare` for data types, so
    `print(anything)`, record map keys and `xs.sort()` work.
12. **Spec conformance**: tag fixtures with spec rule ids, fail on an untested normative rule, re-run
    spec examples in CI; add a grammar and an inference chapter.
13. **Make the LSP cancellable**: latest-wins queue, a diagnostics debounce, and a latency test over
    the compiler graph.
14. **Archive the docs**: fold refactor notes monthly, move closed inventory rows out of the working
    tree, split `DECISIONS.md` into language rulings and implementation notes, and write a short
    human `CONTRIBUTING.md` with a glossary.

### Small

1. Give the seed `.cwasm` sidecar the same envelope and ownership check as the user-module cache.
2. Make `fetch-seed.sh` fail closed on a missing checksum; commit the `seed-v0` hash.
3. Make a missing `wasm-opt` under `-O` an error.
4. Re-run the full benchmark sweep on a quiet box and commit it; add a fuel-per-benchmark ratchet for
   generated code.
5. Add the hole arm to for-in, and a position-matrix template for "hole receiver × operation".
6. Stop `__W0` and `_` leaking into diagnostics; stop printing a host backtrace after a type error.
7. Replace the `RB_*` numeric sums with named `|` compositions.
8. Delete the `body: u8[]` parameter from 554 signatures; name the 262 section bytes.
9. Allow a named default arm in place of the 80-kind enumerations; collapse `binPrec` to grouped arms.
10. Fix the stale comments listed in §5; make the comment lint count characters; extend the
    no-history rule to `.rs`, `.yml` and `.sh`.
11. Delete `a.out`, `reference/`, the shadow and probe debris; fix `lsp/README.md`, `AGENTS.md` and
    the T4.6 and `soundness.md` status text; finish or remove `Formula/`.
12. Make a missing seed fail a test, not skip it; drop `--no-check` in one CI job; rotate a few fresh
    fuzz seeds per PR.

### Order

Decide L2's export ruling and L3 first, since both change what the IR must carry. Then medium 1–3
(they are prerequisites of L1 and L2 and each pays for itself), then L1 and L5 together, then L2 and
L4. Do the small security and trust items now. Consider pausing new defect lanes for any family that
maps to a known IR or interface gap, and spending that capacity on L1 and L2.

### Do not add

Exceptions, async, macros, classes or inheritance, operator overloading beyond derived equality and
ordering, more `as` forms, or further per-position inference rulings before L2.

---

## 7. Method and limits

- The checkout is a shallow clone of 50 commits, so history claims come from the inventory and docs,
  not `git log`.
- The seed used for probes is `seed-latest`, not a seed built from this commit's source.
- Benchmarks are single runs on a shared box without `wasm-opt`; `-O` was not measured here.
- The reviewers sampled; no area was read in full. Line counts for what a recommendation retires are
  estimates.
- Not checked: whether the for-in, `compose` and width-subtyping repros in §3 are already filed in
  the inventory.
