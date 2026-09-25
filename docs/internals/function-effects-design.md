# Function effects: what a function may do, and who is told

> Status: design. The owner's rulings of 2026-09-22/23 are recorded in §I, each marked
> **RULED** with its date; the questions still open are marked **OPEN**. Where a ruling and the
> body text disagree, the ruling holds and the body has been brought in line.
>
> Evidence: No compiler or std source is touched by the change that
> carries this doc. Every "today" claim is a program run with `dist/vl` at master `9341d7e1c`
> (2026-09-22), or a line of the tree cited by path. The tier percentages in §C5 come from a
> syntactic estimator (a Python script, not the compiler) and are labelled as estimates. Where
> a claim is judgement rather than measurement, the text says so. §B2 (compiler-internal
> effect systems) is written from knowledge of those compilers' documentation and source,
> except where it says a binaryen fact was read from the pinned package. Revised later on
> 2026-09-22 for the owner's rulings: a numeric bound replaces the loop and recursion bits,
> reads are split by location, and getter-eligible is separated from `pure` (§C1).

**The question (owner, 2026-09-22).** The getter design on PR #3019
(`property-access-design.md` §D3a) says a getter is "zero-argument, pure by convention", and
that nothing enforces it. The owner's test for a getter is: *would we ever feel bad about
invoking `v.x` in a loop, and be surprised that it is slow?* To enforce that, the compiler needs
to know what a function body does. That knowledge has other consumers too: evaluation order
(D1510), hoisting, compile-time evaluation and the concurrency model's eligibility rule. This
doc designs the knowledge, how users see it, the one written marker, and what function
*values* do.

**Settled by the owner in the 2026-09-22 discussion (this doc develops these points and does
not re-argue them):**

1. **Cost tiers.** (1) a load; (2) straight-line bounded work: a fixed number of loads, ALU ops
   and compares, **branches allowed**, costed by the longest path; (3) O(1) but allocating,
   which fails the loop test because of GC pressure; (4) unbounded (loops or recursion). The
   getter target is tiers 1–2: no back-edges, no recursion, no allocation, no effects.
   *(Amended by the owner later on 2026-09-22: constant-bounded loops are tier 2, within a
   budget of 16 abstract steps. "No back-edges" became "a cost computable at compile time". See
   §C1a.)*
2. **Inferred per-function summaries**, computed bottom-up over the call graph with SCCs for
   recursion and **per instance**. Unknown callees are pessimistic.
3. **Not in function types by default.** A summary belongs to a declaration. Users see it
   through diagnostics and hover.
4. **A manual marker is only a checked promise.** It is pointless inside a module and valuable
   at the std boundary. There is no unchecked override on a VL function; externs are the one
   place a trusted marker might fit, and that is deferred.
5. **Function values**: (A) pessimistic, (B) whole-program flow, (C) an effect qualifier in
   function types. Principle: *inference that decides ACCEPTANCE must be local and stable;
   inference that only makes code FASTER may be global.*
6. **Not a trap door.** Starting pessimistic only relaxes later. There are two one-way
   decisions: an unannotated function type means "unknown effects" permanently, and the
   marker's word must be the word a future type qualifier would use.

**The short answer, argued below:**

- Build **one** analysis: the per-instance summary. `concurrency-design.md` §4 already rules
  the same shape (a bottom-up fixpoint, never in a type) for its own purposes. The getter
  contract, D1510's reorder gate, the concurrency lint and the optimizer all read this one
  analysis. Two analyses would disagree.
- A summary is **a set of bits plus one number**, not one bit (§C1). "Effect-free" and
  "cheap" are independent axes. `popcnt` is pure and loops. A counter bump is O(1) and writes.
  The consumers split along the same line (§G), so the vocabulary has to split too. Reads are
  split by location (`let` binding, GC heap by root, linear memory), and cost is a **bound in
  abstract steps**: `Bounded(n)` or `Unbounded`, transitive through calls, never
  data-dependent (§C1a).
- **Getter-eligible is not `pure`.** A getter may read its receiver's mutable fields and
  linear memory. It may not write, call the host, call something unknown, allocate, read a
  module `let`, or exceed a budget of 16 steps (§C1b). `pure` is about effects and reads; a getter is
  about effects, allocation and cost.
- **The marker's word is `pure`, and it means effects only**: no writes to state the call did
  not create, no host calls, no unknown calls, no reads of module `let`s, linear memory or a
  module `const`'s heap (reads through a parameter are allowed). It promises
  nothing about cost. That is Fortran's `PURE` and D's weak `pure`, which also admit reads
  through arguments, and "pure" meaning loop-free would be a new meaning no reader expects
  (§E2).
- **Cost gets no keyword in v1.** A getter's body is checked by inference. std's cost promise
  is a **checked baseline file**, the same ratchet shape as `seed-size-baseline.json`. VL has
  exactly one module boundary that outlives a build (std, version-locked), and a baseline
  covers it without any new syntax (§E4).
- **Function values: (A) now.** Reserve `pure` in type position so that (C) stays possible.
  Use (B) only as optimizer input. `-O3` already does (B) at the wasm level: GUFA devirtualised
  and inlined a closure in §A5's probe.
- **Allocation is judged on the SOURCE**, not on the emitted representation. A generic can box
  at one pin and not at another (§A6), and an acceptance rule that turns on the emitter's
  representation choices would be neither local nor stable (§C3).

---

## A. What VL has today, measured

### A1. Three separate syntactic "no effect" predicates, and no call graph

The tree answers "can evaluating this be observed?" in three places, with three different
rules. None of them looks through a call.

| predicate | where | what it admits | used for |
| --- | --- | --- | --- |
| `exprEffectFree` | `compiler/emit_base.vl:745` | literals, identifiers, `Paren`/`Unary`/`BinExpr` (not `=`), `Member`, `OptMember`, `Index`, `is`, `as`, array and object literals of such. **Every other kind, `Call` and lambda included, answers false** (`exprEffectFreeUnclassified`, fail-closed) | D1510's struct-literal order stash |
| `unionEqOperandOk` | `compiler/emit_base.vl:873` | identifiers, numeric and string literals, member, optional-member and index chains over those | whether a multi-compare union lowering may re-read its operand |
| `upeIsPure` | `compiler/lint.vl:698` | literals, an identifier, array and struct literals of pure parts, **operators only over literal leaves** ("VL has operator overloading, and dispatch needs an object-typed left operand") | the `unused-pure-expression` lint |

The disagreement between rows 1 and 3 is deliberate and correct. The lint runs on the source,
where `a + b` may dispatch to a user `"+"`. The emitter runs after the pre-emit rewrite has
turned an overloaded operator into a `Call`. Measured: an out-of-order literal
`{ b: two + one, a: one + two }` whose `"+"` appends to a log prints `21`, which is source
order. But it is three rules for one question, and each rule stops at a call.

**There is no call graph in the checker.** `unconditional-recursion` (`compiler/lint.vl:1060`)
analyses direct self-recursion over one body only, and says why: "mutual recursion needs a
whole-module call graph". `concurrency-design.md` §4 noted on 2026-08-22 that "VL has no purity
or effect analysis today". That is still true.

### A2. What stopping at a call costs today, in D1510's stash

```vl
function sq(x: i32): i32 { return x * x }
const s = { b: sq(3), a: 1 }
```

The literal is out of layout order (fields are laid out by name, D622), and `sq(3)` is a
`Call`, so `objLitNeedsOrderStash` fires. At `-O0` the module has 2 `local.set`s and is 216
bytes. Written in layout order (`{ a: 1, b: sq(3) }`) it has 0 and is 202 bytes. `sq` has no
effect, so the stash buys nothing. `DECISIONS.md` §"Evaluation order is SOURCE order" prices
the whole stash at 14 of 82 out-of-order literals and 272 seed bytes, so **D1510 is not the
reason to build this**. It is the consumer that shows the summary's semantics must be exact
(§G1).

### A3. Operators hide loops and allocations

```vl
function isBob(n: Named): boolean { return n.name == "bob" }
function label(n: Named): string { return n.name + "!" }
function sameTags(a: Named, b: Named): boolean { return a.tags == b.tags }
```

`--names` plus `wasm-dis`: `isBob` calls `$__str_eq__`, whose body has two `loop`s. `label`
calls `$__str_concat__`, which runs `array.new_default` and `struct.new`. `sameTags` inlines a
`loop` over the elements. **None of the three contains a call or a loop in its source.** A
summary computed from call and loop syntax alone would put all three in tier 2. None of them is:
two loop over their operands and one allocates (and copies its operands' bytes). So the summary
needs a cost table for **operators by operand type**, and that means it must run where types
are known (§C3).

### A4. The getter's own lowering is a call

§D3a of the property-access design rewrites a getter read `v.x` into a `Call` before emit, "so
the emitter's 'a member read is a load' assumption stays true". The consequence is that every
out-of-order literal that reads a getter goes onto D1510's stash path (A2), and every union
compare over a getter read is refused as an operand that cannot be re-read (`unionEqOperandOk`
has no `Call` arm). A getter that is proven effect-free and terminating could be admitted by
both predicates, but only if they can ask a summary.

### A5. `-O3` does whole-program flow for function values, and does not hoist pure calls

```vl
function popcnt(x: i32): i32 { let n = 0; let v = x; while v != 0 { n = n + (v & 1); v = v >>> 1 }; return n }
function apply(f: (i32) => i32, x: i32): i32 { return f(x) }
// k is loop-invariant and comes from a Buf, so nothing constant-folds
while i < 1000 { s = s + popcnt(k); s = s + apply((x) => x * 2, i); i = i + 1 }
```

It prints `1005000`. At `-O3` (`--closed-world -O3 --gufa -O3`, `scripts/vl-host/src/main.rs:4091`)
the module has **zero `call_indirect`s**. The lambda passed through `apply`'s function-typed
parameter was devirtualised and inlined to `(i32.shl i 1)`. That is option (B) of §F, done by
binaryen on the wasm. `popcnt` was inlined too, but **its loop stays inside the outer loop and
runs 1,000 times** although `k` never changes. Binaryen's `--licm` and
`--generate-global-effects` exist in the pinned binaryen 130, and VL's release profile runs
neither. Hoisting the call needs two facts: that it is effect-free, and that it terminates
(§G2). Knowing only the first is not enough.

### A6. Allocation is a property of the instance, not the declaration

```vl
function keepIf<T>(v: T, keep: boolean): T | null { if keep { return v }; return null }
keepIf(p, true)    // p: { x: f64, y: f64 }
keepIf(2.5, true)  // f64
```

Both print correctly. The `P` instance returns `(ref null $0)` and contains **no allocation**.
The `f64` instance returns `(ref $1)` and contains **two `struct.new`s** (the nullable-scalar
box). The source of both is the same. So "does `keepIf` allocate?" has no answer, while "does
`keepIf<f64>` allocate?" does, and the answer comes from a **representation** rule that the
language does not specify and that has changed many times (the `nulvariant` niche and the
litunion compact rep are two of those changes). §C3 turns on this.

### A7. What already exists that the summary would replace or feed

- `concurrency-design.md` §4 rules an inferred effect analysis with three jobs (the
  serialization lint, mechanism selection, and eliding the machinery). None of it is built.
- `DECISIONS.md` B6: "property syntax (no parens) is reserved for O(1) members". Today only the
  compiler declares such members (`length`), and nothing checks the rule.
- `std-api-review.md` §2 is critical of "a name that promises more than it delivers". A getter
  that loops is that criticism applied to a member.

---

## B. Survey

§B1 surveys what languages let a user write. §B2 surveys what optimizing compilers track
internally, where nobody writes anything.

### B1. Language markers

The columns that decide VL's answer: **is it checked**, **is it in function types**, and
**how does a higher-order function get the property from its argument**.

| system | what is tracked | checked? | in function types? | higher-order story | inference |
| --- | --- | --- | --- | --- | --- |
| **Koka** | effect rows: `total`, `div` (may diverge), `exn`, `st<h>`, `console`, `io`… **`pure` is an alias for `<div, exn>`**. `total` is the empty row | yes | yes, always | row polymorphism: `map : (list<a>, (a) -> e b) -> e list<b>` | full, including `div` for recursion it cannot show terminates |
| **D** | `pure` (weak: may write through mutable arguments; strong: immutable arguments), `@nogc`, `nothrow`, `@safe` | yes | yes (attributes on function-pointer and delegate types) | attributes are **inferred for templates, lambdas and `auto` functions**, which gives per-instantiation purity | only where the body is guaranteed visible; ordinary functions must be annotated because of `.di` separate compilation. Known in the community as "attribute soup". **`pure` allows GC allocation**; that is `@nogc`'s job |
| **Rust** | `const fn`: callable at compile time | yes | no (a `const` bound on traits is the unstable keyword-generics / effects work) | not solved on stable | none: `const` is written, and removing it from a public fn is a breaking change. Loops became legal in `const fn` in 1.46, and heap allocation still is not |
| **C++** | `constexpr` (C++11: one `return`; C++14: loops; C++20: transient allocation), `consteval` (must be evaluated at compile time), `noexcept` | `constexpr` was "ill-formed, no diagnostic required" if no constant path existed, until C++23 relaxed it. `noexcept` is enforced at runtime by `terminate` | `noexcept` has been part of the type since C++17 | `noexcept(noexcept(f(x)))` written by hand | none |
| **Swift** | `throws`, `async`; `rethrows` = "throws only if a closure argument throws"; `@inlinable` (the body is part of the module's ABI); underscored `@_effects(readonly/readnone)` | `throws`/`rethrows` yes; `@_effects` **no** (compiler-internal, and misuse miscompiles) | `throws`/`async` yes | **`rethrows`**: effect polymorphism for exactly one effect and one pattern, with no type variables | none for effects |
| **Nim** | `{.noSideEffect.}` (and `func` = `proc {.noSideEffect.}`), `raises`, `tags`, `gcsafe` | yes | yes (pragmas on proc types) | **a call through a proc-typed *parameter* is not charged to the callee. Instead, each call site charges the effects of the proc value it passes.** This is "`map` is pure iff its callback is", computed per call with no signature change | yes: effects are inferred for procs and checked against any declared ones |
| **Haskell** | purity by default; effects live in `IO`/monads | yes | yes (the monad) | `mapM` vs `map`: the textbook case of colouring | full type inference. `unsafePerformIO` is the unchecked escape. Termination is not tracked (`head []`) |
| **Zig** | `comptime`: any function whose body is comptime-capable can run at compile time | at the use site | no | n/a | **no annotation**: the error appears where comptime evaluation is forced. Cost is bounded by `@setEvalBranchQuota` (1,000 backward branches by default) |
| **OCaml 5** | effect handlers | **no**: effects are untyped by design, and an unhandled effect is a runtime exception | no | n/a | Flambda keeps its own internal effect/coeffect classification of primitives, for the **optimizer only** |
| **GCC / C23** | `__attribute__((pure))` (may read global memory), `((const))` (may not). C23 adds `[[reproducible]]` ≈ pure and `[[unsequenced]]` ≈ const, **as attributes on function types** | **no**: a wrong attribute is a miscompile | C23: yes | n/a | the optimizer infers the same facts for visible bodies anyway (`-Wsuggest-attribute=pure`) |
| **Fortran 95+** | `PURE`, `ELEMENTAL` (implies pure) | yes: the compiler enforces no global writes, no `INTENT(IN)` writes, no external I/O | interface blocks carry it | a `PURE` procedure may only call `PURE` procedures, including dummy procedures | none |
| **Solidity** | state mutability: `pure` (no state reads or writes), `view` (reads only), default | yes | **yes: function types carry it, and `pure → view → default` convert implicitly** | via the function type | none |
| **WGSL / GLSL** | recursion is **forbidden** (the call graph must be acyclic) | yes | n/a | n/a | n/a |
| **Idris / Lean** | `total` / `partial` (termination) | yes | Idris: per declaration | n/a | a termination checker |

Findings, stated as findings:

1. **"Pure" means effect-free and says nothing about cost, in every system that uses the
   word.** Koka's `pure` explicitly permits divergence. D's permits allocation. Fortran's
   permits loops. GCC's, C23's and Solidity's are about memory access only. The cost axis gets
   its own word wherever it exists: `total` (Koka, Idris), `@nogc` (D), `consteval`'s evaluation
   limits (C++), `@setEvalBranchQuota` (Zig). **No surveyed language uses one word for "no
   effects and no loops".**
2. **Unchecked purity is a miscompile generator.** GCC, C23 and Swift's `@_effects` all say
   that a wrong claim is undefined behaviour. This confirms the owner's point 4: no unchecked
   marker on a body the compiler can see.
3. **Inference for bodies the compiler can see, annotation at a boundary it cannot see.** D
   infers for templates because their bodies are always visible, and demands annotation
   elsewhere because of `.di` files. Rust's `const fn` is written because crates are the unit
   of compatibility. VL is whole-program, so almost every body is visible. std is the one
   boundary where a *future* body matters.
4. **The higher-order problem has three known shapes.** Koka uses full effect
   polymorphism, and option (C) of §F would need some of it. Swift's `rethrows` handles one effect and one pattern. Nim charges the effect
   of a callback to the call site that passes it. Nim's rule is the only one that needs **no
   signature syntax**, and it is local: it reads the callee's body plus the argument at this
   call.
5. **The optimizer-only analysis is universal and uncontroversial.** GCC infers `pure`/`const`,
   Flambda classifies effects, binaryen has `--generate-global-effects`, and GUFA
   devirtualised §A5's closure. Nobody objects to global inference that only makes code
   faster. This is the owner's principle in point 5.
6. **Colouring shows up when the property is in the type AND a callee cannot be generic over
   it** (Haskell's `mapM`/`map`, Rust's async/sync split, Nystrom's "What Color is Your
   Function?"). Solidity has the property in the type and no colouring complaint, because its
   conversion goes one way (`pure → default`) and a callback parameter just takes the weakest
   type. That is option (C)'s subtyping.

### B2. Compiler-internal effect systems

§B1 is about markers a user writes. This section is about what optimizing compilers **infer
and keep for themselves**. No user writes these facts, and a wrong one is a compiler bug, not
a user error. They are the best available evidence for which facts are worth tracking, because
each exists only because some pass needed it.

**Sources, stated honestly.** One row is partly measured: binaryen 130 is pinned in
`package.json`, and `node_modules/binaryen/index.d.ts` (the C API binding) lists its
`SideEffects` bitmask. The binaryen C++ `EffectAnalyzer` (`src/ir/effects.h`) is **not**
available locally, so its fields below come from knowledge of the source, not from reading
the pinned version. Every other row is from knowledge of the documentation and source, with
no local measurement. Where I am unsure of a name or a version, the row says so.

| system | where | what it tracks | how it is inferred | consumers |
| --- | --- | --- | --- | --- |
| **LLVM** | function and parameter attributes | **`memory(...)`** (LLVM 16+) gives an access kind (`none`/`read`/`write`/`readwrite`) **per location**: `argmem` (memory reached through pointer arguments), `inaccessiblemem` (memory the module cannot name, such as allocator state), and `other`. Later releases add more locations (an errno location, I believe; not verified). It replaced the older attributes, which survive as spellings: `readnone` = `memory(none)`, `readonly` = `memory(read)`, `writeonly` = `memory(write)`, `argmemonly` = `memory(argmem: readwrite)`. Separate attributes: **`willreturn`** (returns or unwinds, never diverges), **`mustprogress`** (C++ forward progress: a loop without side effects may be assumed to terminate), **`nounwind`** (no exception leaves), **`norecurse`**, **`nofree`** (frees no memory, so a dereferenceable pointer stays dereferenceable), **`nosync`** (no synchronisation with other threads), `speculatable` (no UB and no effects, so it can be executed where it was not before), `noreturn`. Per parameter: `readonly`/`writeonly`/`readnone`, and `nocapture` (spelled `captures(none)` in recent releases, I believe) | `FunctionAttrs` walks SCCs of the call graph bottom-up; `norecurse` is derived in a second top-down walk; the Attributor is a heavier fixpoint framework for the same facts | alias analysis, LICM, DCE of unused calls, GVN/CSE across calls, speculation |
| **GCC** | IPA passes | **`ipa-pure-const`** discovers `const` (reads no memory except constants) and `pure` (may read global memory), each with a separate **`looping`** flag: a *looping* pure function may not terminate, so a call whose result is unused cannot be deleted. It also discovers `nothrow`, `noreturn` and `malloc`. **`ipa-modref`** (GCC 11+) records per-function **load and store summaries** as trees keyed by base (a parameter index or global memory), then alias set, then offset and size ranges; plus per-parameter escape flags (the `EAF_*` family). To my knowledge GCC 12 added `side_effects` and `nondeterministic` flags to modref summaries | reduced postorder over the call graph with SCCs; modref propagates summaries through calls, including through a parameter passed on to a callee | DSE and alias queries across calls; `-Wsuggest-attribute=pure/const/noreturn` |
| **binaryen** (VL's own optimizer) | `EffectAnalyzer` per expression; `--generate-global-effects` per function | **Measured (C API, `index.d.ts`):** `Branches`, `Calls`, `ReadsLocal`/`WritesLocal`, `ReadsGlobal`/`WritesGlobal`, `ReadsMemory`/`WritesMemory`, `ReadsTable`/`WritesTable`, `ImplicitTrap`, `IsAtomic`, `Throws`, `DanglingPop`, `TrapsNeverHappen`. **From knowledge of the C++ class** (not the pinned source): the local and global reads and writes are **sets of names**, and only *mutable* globals count as read; GC reads are split into **`readsMutableStruct`** (an immutable field read is no effect) and `readsArray`, and writes into `writesStruct` and `writesArray`; **`trap`** (an explicit or certain trap, such as `unreachable`) is separate from **`implicitTrap`** (a load, a division or a cast that *may* trap); **`mayNotReturn`** marks a loop or a call that may not come back; `branchesOut` and the try and catch depth track control. The C API bitmask exposes no struct, array or `mayNotReturn` entry, so those fields are the least certain claims in this table | a local walk per expression; `--generate-global-effects` computes each function's effects over the call graph and lets later passes use them at call sites instead of assuming the worst. `--ignore-implicit-traps` and `--traps-never-happen` let a pass drop the trap facts | LICM, code folding, simplify-locals (moving a `local.set`'s value), vacuum (dead code), GUFA. §A5: VL's release profile runs neither `--licm` nor `--generate-global-effects` |
| **V8 TurboFan** | `Operator::Properties` on each IR operator | `kNoRead`, `kNoWrite`, `kNoThrow`, `kNoDeopt`, `kIdempotent`, `kCommutative`, `kAssociative`. **`kPure` = `kNoRead` + `kNoWrite` + `kNoThrow` + `kNoDeopt` + `kIdempotent`**. Deoptimization (bailing out to the interpreter) is its own axis, because the speculative JIT can leave the optimized code at any check. Turboshaft (the newer backend) replaced this with `OpEffects`, which separates loads and stores of **heap** memory from **off-heap** memory, control flow, allocation and "required when unused". I am confident of the TurboFan flags and less sure of Turboshaft's exact names | per operator, fixed by the operator's definition; calls take the callee's known properties or the worst | effect-chain scheduling, load elimination, dead-node removal |
| **HotSpot C2** | the memory graph | memory state is **sliced by alias class**: each field and each array element type has its own memory slice, and a node reads and writes only its slice, so a store to `A.f` does not order against a load of `B.g`. Calls kill every slice unless the call is a known leaf. From knowledge, lower confidence than the rows above | type-based alias classes; escape analysis for allocations | GVN, load elimination, scalar replacement |
| **Cranelift** | instruction definitions and `MemFlags` | each opcode is defined with flags such as `can_load`, `can_store`, `can_trap` and `other_side_effects`. Memory operations carry `MemFlags`: `notrap`, `aligned`, `readonly`, an **alias region** (`heap`, `table` or `vmctx`), and `can_move` (the load may be hoisted). The e-graph optimizer lets **pure** instructions float and keeps side-effecting ones in a fixed "skeleton" order. From knowledge | per instruction; the frontend (Wasmtime) sets the flags it can prove | e-graph rewriting, alias analysis by region, load hoisting |
| **MLIR** | `MemoryEffectOpInterface` | effects are `Allocate`, `Free`, `Read` and `Write`, each on a named **resource**. The `Pure` trait is **no memory effects plus `AlwaysSpeculatable`**, so it combines effects with "may be executed speculatively". `RecursiveMemoryEffects` derives an op's effects from its nested regions | per op, and recursively for ops with regions | CSE, LICM, dead-op removal |

Findings, stated as findings:

1. **Every optimizing IR splits reads and writes by location.** LLVM has `argmem` against
   `inaccessiblemem` against `other`. GCC's modref keys by parameter index. binaryen separates
   locals, globals by name, linear memory, tables, struct fields and arrays. TurboFan's
   successor splits heap from off-heap, and C2 and Cranelift split by alias class or region.
   None of them has one "reads" bit. **VL should split `R` by location** (§C1). It also should
   note what binaryen, LLVM and GCC agree on: a read of *immutable* state is no effect at all.
2. **Termination is its own fact everywhere, never part of "pure".** LLVM has
   `willreturn`/`mustprogress`, GCC has the `looping` flag on `pure` and `const`, binaryen has
   `mayNotReturn`, and MLIR folds speculatability into its `Pure` trait explicitly rather than
   implying it. GCC's `looping pure` is the compiler-internal twin of §B1's finding 1: a
   function can be effect-free and still diverge, and a pass that deletes or moves the call
   has to know. **VL adopts this as a bound (§C1), and goes one step further than any of them:
   the bound is a number, not a bit**, because the getter test is about cost, and a yes/no
   "terminates" says nothing about how long.
3. **Unwinding is its own fact.** LLVM `nounwind`, GCC `nothrow`, binaryen `Throws` and
   TurboFan `kNoThrow` all separate "may leave by an exception" from "may trap" and from "has
   effects". VL has no exceptions today, so **`U` is reserved** (§C1).
4. **Explicit and implicit traps are different facts for an optimizer.** binaryen separates
   `trap` from `implicitTrap`, Cranelift has `can_trap` and a `notrap` flag, and LLVM's
   `speculatable` exists because a trap that *may* happen blocks speculation. A certain trap
   (`__trap__`, a failed `as!`) ends a path. A possible trap (an index, a division) only
   stops code from moving above its guard. **VL's optimizer-only `T` could split the same way
   when an optimizer consumer needs it** (§I16). It stays invisible to users either way.
5. **Parameter-scoped facts are the common case.** LLVM's per-parameter `readonly`, GCC's
   modref bases and escape flags, and `argmem` all say "this function touches only what its
   arguments reach". VL's `R.heap` with its root class (§C1) is the smallest version of that.
   A per-parameter split is a later refinement, and only an optimizer would need it.
6. **Not worth adopting: `nofree` and `nosync`.** `nofree` protects a pointer from being
   invalidated by a deallocation, and nothing in VL's GC heap can be freed by user code. The
   one manual deallocation, `bufferRelease` of linear memory, is already a write (`W`).
   `nosync` describes synchronisation with other threads through shared memory, and VL has no
   shared-memory threads (`concurrency-design.md` §6 rules them out for now). Both are moot
   under VL's memory model, not merely deferred. `speculatable` is also not a source-level
   concept; an optimizer can derive it from the bits VL already has (effect-free, bounded, no
   `T`).
7. **Every one of these is an optimizer fact, and none of them decides acceptance.** That is
   the owner's point 5 again. VL is unusual in using the same summary for an acceptance rule
   (the getter check), which is why the acceptance half must be local and stable, and the
   optimizer half may use global flow.

---

## C. The summary

### C1. What a summary records

Each fact is a monotone "may" fact about **one instance** (a declaration plus its pin key,
§C4), closed over its callees. Lower is better, and the analysis may only over-approximate.
Every fact is a bit except `B`, which is a number.

| fact | the instance may… | own-body sources |
| --- | --- | --- |
| `W` | write state it did not create during this call | assignment to a module `let`; a field, element or map write whose root is not fresh (§C2); `push`/`pop`/`set`/`sort`…; linear-memory `store*`, `memory.fill/copy`; `bufferRelease` |
| `R.let` | read a module `let` **binding** | a read of a module `let`. A read of a module `const` binding is **not** a read: the binding cannot change |
| `R.heap` | read mutable GC-heap state that this call did not create. It carries a **root class**: `param` (reached from a parameter, `self` included) or `const` (reached from a module `const`, such as a lookup table) | a field, element or map read whose root is not fresh (§C2). A read of a field the language makes immutable would not count, as binaryen and LLVM already treat it (§B2 finding 1) |
| `R.mem` | read linear memory | a `__load_*` intrinsic, and the std functions built on them (`std:buffer`, `std:bytes`) |
| `H` | call the host | an `extern function`, `print`, `std:fs`/`std:process`/`std:args` intrinsics. **Sub-bit `S`: may suspend** (concurrency-design §4's question) |
| `X` | call something unknown | `call_indirect` whose target set is not resolved (§F); an extern with no trusted marker |
| `A` | allocate on the GC heap | an object or array literal; a lambda literal (a `{env, id}` struct, `emit_state.vl:158`); string `+` and template interpolation; spread; `slice`/`map`/`filter`/`concat`; `Map()`; constructors |
| `B` | cost at most this many abstract steps: **`Bounded(n)`**, or **`Unbounded`** | §C1a. `Unbounded` comes from a `while`, a `for`-in over data, a range whose ends are not constant, recursion (a cyclic SCC or a self-edge), an unresolved indirect call, or **an operator whose lowering loops over its operands** (string and list `==` other than a compare against a string literal, which §C1a charges by the literal's length; f64 `%`; string hashing, a map probe, `utf8` coding: §A3) |
| `T` | trap | index, division, `as!`, `__trap__`, overflowing casts. **Optimizer-only; never user-visible** (D1510 ruled that a trap is not an effect). A split into explicit and implicit traps is §I16 |
| `U` | unwind (leave by an exception) | **reserved, always 0 today.** VL has no exceptions. Wasm exception handling is the future source, and plumb reserves a status result "for exception unwinding" in its cross-unit calls (`~/plumb/docs/vl-issues.md`, PL-013). Every surveyed optimizer keeps this fact apart from traps and effects (§B2 finding 3), so it gets its slot now |

`B` replaces the earlier `L` (any back-edge) and `C` (recursion) bits. The diagnostic chain
(§D) still records *why* a function is `Unbounded`, loop or recursion or operator, so nothing a
message needs is lost.

#### C1a. The bound (RULED, owner, 2026-09-22; metric and budget per §I11)

**Invariant: an instance's worst-case cost is computable at compile time from the source plus
the bounds of its callees, and never depends on data.** Every rule below follows
from it, and only the budget's number may change.

- **Allowed:** a numeric range `for i in <a> (to | until) <b> [step <s>]` where `a` and `b` are
  integer literals or a `const` initialised by an integer literal or by another such `const`
  (§I13), `s` is an integer literal, and the loop variable is never assigned in the body. `break` and `continue`
  are allowed; the bound assumes the loop runs to its end. The trip count is the number of
  values the range visits (`to` is inclusive, `until` half-open), so `for i in 0 to 3` is 4
  and `for i in 10 to 0 step -2` is 6 (both run with `dist/vl`). `step 0` is already refused by
  the checker ("a range with `step 0` never advances").
- **Never:** a `for`-in over data, a range with a data-dependent end, `while`, and recursion.
  They are `Unbounded`, with no escape.
- **Composition, in abstract steps.** A call costs 1 plus its callee's cost, a loop multiplies
  its body's cost by its trip count, and a branch (`if`, `match`) takes the max over its arms.
  The cost is **transitive through calls**, so a loop-free chain of getters that fans out is
  charged for every call it makes. `Unbounded` absorbs everything. A compiler-lowered operation
  is charged its real worst case: a compare against a string literal (`==`, `!=`, `is "a" |
  "b"`, `startsWith` / `endsWith` with a literal) costs the literal's length, provided its
  lowering pre-checks lengths and never loops past the shorter operand; a compare of two
  run-time strings, and f64 `%` (whose `__f64_rem__` loops by the operands' exponent gap), are
  `Unbounded` (§I15).
- **The budget.** A getter's total must be at most **one named budget, 16 steps**, tuned by
  usage. That number is the only part of this rule that may change, and changing it takes a
  `DECISIONS.md` entry and a std review, because std exports' eligibility depends on it. The
  summary carries the exact number (saturating, so a pathological product cannot overflow) and
  applies no budget of its own. Each consumer applies its own threshold: getters take `≤ 16`,
  and D1510 and hoisting take any `Bounded(n)`. An over-budget error names the call path.
- **The loop variable.** A constant-range loop variable gets an internal interval type
  `[lo, hi)`, with no user syntax. It is assignable wherever every value in it fits (a lane
  index, for instance), without expanding to a literal union. A user-spellable range type is a
  separate future decision.

#### C1b. The derived predicates

These are what people and passes actually ask:

| name | definition | reads it admits | who asks |
| --- | --- | --- | --- |
| **effect-free** | ¬W ∧ ¬H ∧ ¬X (∧ ¬U once `U` exists) | all | D1510 reorder (with terminating), concurrency §5 "pure CPU" |
| **terminating** | `B` = `Bounded(n)`, any `n` | all | D1510 reorder, hoisting. Sufficient, not necessary: a `while` that always stops is still `Unbounded` |
| **`pure`** (the marker, §E) | effect-free ∧ ¬`R.let` ∧ ¬`R.mem` ∧ ¬`R.heap[const]` | `R.heap[param]` only | the checked marker; parallelism; compile-time evaluation |
| **getter-eligible** | effect-free ∧ ¬A ∧ ¬`R.let` ∧ `B` = `Bounded(n ≤ 16)` | `R.heap` (both roots) and `R.mem` | the getter body check |
| **hoistable** (optimizer only) | effect-free ∧ terminating ∧ no `T`, or a trip-count guard ∧ nothing it reads is written in the loop | per §G2 | LICM, CSE |

**An "overload-eligible" predicate is floated, not decided** (owner, 2026-09-25, on D2390): a
declared operator might be restricted to no effects, or to writing only its left/right operands,
the way a getter is restricted to describing its receiver. It would be a sixth row here, and its
consumer is §G6.

**Getter-eligible is NOT `pure`, and neither implies the other.** A getter reads its receiver's
mutable fields by design, and the approved getter contract (property-access §D3a-contract)
deliberately allows `__load_*` linear-memory reads, because the flat-row getter is exactly a
load at a derived address. So a getter admits `R.heap` and `R.mem`, which `pure` does not. In
the other direction, a `pure` function may loop without bound and may allocate, which a getter
may not.

**Why a getter excludes `R.let` (the rationale is description, not purity).** A getter
*describes its receiver*: it reads what is reachable from `self`, plus constants. A module
`let` is neither. It is state the receiver does not own, and a getter that reads it gives two
different answers for the same receiver. Linear memory is admitted pragmatically: a `Buf`
receiver's bytes are reachable from `self` in intent, but proving that a load's address is
derived from `self` needs address analysis VL does not have. So the rule admits every
linear-memory read rather than refusing the flat-row getter.

**Why `pure` excludes `R.let`, `R.mem` and `R.heap[const]`, and admits `R.heap[param]`
(judgement, backed by one measurement).** The two consumers that need `pure` to exclude reads
are compile-time evaluation and parallel workers.

- Compile-time evaluation cannot read a `let` whose value is decided at run time, or linear
  memory that is filled at run time. It evaluates a call only when the arguments are
  compile-time values, so the heap reached through a *parameter* is compile-time data too.
  A module `const`'s heap is not: a `const` binding's list can be mutated at run time.
- A parallel worker is a separate instance, and it gets **fresh** module globals and a fresh
  linear memory (`concurrency-design.md` §6: "a silent wrong answer"). A `let` read, a memory
  read, and a read of a `const`'s mutated heap would all see the worker's fresh copy. A read
  through a parameter sees what the caller passed, which is the one thing a worker message
  carries.

This makes `pure` about as strong as D's weak `pure` for reads (§B1), which may read through
its arguments, and weaker than GCC's `const`, which reads nothing but constants. Unlike D's
weak `pure`, VL's `pure` still forbids writes through arguments (`W`).

Measured by the estimator (§C5), before this split: of the 87 std functions it grades tier ≤ 2,
**3 read a module `let`**. In the compiler the figure is **601 of 939**, because the compiler
keeps its arenas in module globals. Excluding `R.let` costs std almost nothing, and the
compiler is not getter code. The estimator does not split heap reads by root, so it gives no
count for `R.heap[const]`.

**Hoisting needs the read facts too (§G2).** A call can move out of a loop only if nothing the
call reads is written inside the loop. For `R.let` and `R.mem` that is a cheap check against
the loop's own `W` sources. For `R.heap[param]` it needs either alias analysis or the coarse
rule "the loop writes no heap at all". Without the parameter-heap fact, hoisting `norm(p)` out
of a loop that assigns `p.x` would be unsound. This is why `R.heap` is recorded even though
getters admit it.

**Tiers fall out of `A` and `B`, independent of reads.** Tier 1–2 is ¬A ∧ `Bounded(n ≤ 16)`:
constant-bounded loops within the budget are tier 2 now, not tier 4. Tier 3 is A ∧
`Bounded`, and tier 4 is `Unbounded` or over budget. Tier 1 versus tier 2 is not a fact. Once
inlined they are the same wasm (property-access §A2), and nothing needs to tell them apart.

**The std baseline records the bound as a number** (§E4). CI flags any export whose bound
**increases**, including `Bounded(n)` → `Unbounded`, as well as any export that loses a
predicate.

### C2. Freshness: writing to what you just allocated is not an effect

`function mk(): P { const r: P = { x: 0.0, y: 0.0 }; r.x = 1.0; return r }` writes a field,
and nobody can observe the write. **A write whose place is rooted at a `const` local bound
directly to an allocation in this body does not set `W`.** This is sound without alias
analysis. The object can only become visible to anyone else before the write through a write
(already `W`) or a call that stores it (the callee then has `W`). Returning it afterwards is
not observation *during* the call. Any root the rule cannot prove fresh, including a `let`
(which could be rebound) and a parameter, is pessimistic. Getters never reach this rule,
because a getter may not allocate. It matters for `pure` builders and for std.

### C3. Where the summary is computed, and why allocation is judged on the source

Two constraints decide the placement:

- **An acceptance rule must fire in the checker.** CLAUDE.md: "every `loud emit reject` is a
  clause-2 violation by construction, since `check` returned 0 to reach the emitter". The
  getter check and the `pure` check are acceptance rules, so they are checker diagnostics.
- **§A3's operators need types.** The typed AST has them. The checker knows `n.name` is a
  `string`, so `==` on it makes the bound `Unbounded`.

So the summary is computed **in the checker, over the typed AST, per pinned instance**. It
consults an **operator cost table** keyed by operator and operand type (§I6).

**Allocation is judged on the source (recommended).** `A` is set by constructs that allocate in
*any* conforming lowering: literals, closures, string building, list growth and copy. It is
**not** set by a representation box such as `keepIf<f64>`'s (§A6). The alternative is to read
`A` off the emitter's `struct.new`s. That would be exact about GC pressure, but it breaks the
owner's principle twice. It is **not local**: whether `T | null` boxes at `f64` is a
representation rule nobody wrote in the program. And it is **not stable**: a representation
change in the compiler would flip acceptance of user code in either direction. The cost is
honest and small. A getter can still box through a union representation, so the emitter
reports that as a **hint** on the getter ("`keepIf<f64>` boxes its result here"). It is not an
error, and hover shows it (§D).

### C4. Per instance, bottom-up, once

- **Key.** A summary is keyed by `(declaration, pin key)`, the same identity the emitter's
  instance table uses (`monomorphization-design.md`). A non-generic function has one key. A
  generic's `a == b` over `T` is ALU at `i32` and a loop at `string`, so its bound differs
  per key. That is the reason for point 2 ("computed PER INSTANCE").
- **Order.** Tarjan's SCCs over the instance call graph, visited callees first. Each SCC's
  summary is the OR of its members' own-body bits and its external callees' summaries. A
  cyclic SCC is `Unbounded`. An acyclic instance's bound is the §C1a sum, over callees whose
  bounds are already final. That is one pass, linear in instances plus call edges, with no
  iteration to a fixpoint: every bit is a monotone OR, and the bound of an acyclic node is
  computed once from finished callees.
- **The cost trap.** CLAUDE.md's D1090 section shows a per-binding whole-arena scan making the
  L2 self-compile non-terminating. The summary must be **one pass that is memoised per key**,
  never a query that re-walks callees on demand. It needs a `tests/vl_scaling_shape_test.ts`
  pair ("deep call chain" vs "wide call fan") in the PR that lands it.
- **Unknown is pessimistic.** An unresolved `call_indirect` sets `X`, and an extern sets `H`
  and `X` (§E5).

### C5. How much code qualifies (an estimate, not a measurement of the compiler)

A syntactic estimator (a Python script over the source, not part of this change) finds function
bodies by brace matching and classifies own-body constructs by regular expression. It builds a
**name-keyed** call graph, merging same-named functions, which is pessimistic. It uses Tarjan's
SCCs and propagates the bits above. It **cannot see operand types**, so §A3's string `==` is
missed, which over-counts tier ≤ 2. A hand check of 12 randomly sampled tier ≤ 2 compiler
functions found all 12 correct, but that is a small sample.

| population | tier ≤ 2 | tier 3 | tier 4, effect-free | effectful (`W`/`H`/`X`) | total |
| --- | --- | --- | --- | --- | --- |
| `compiler/*.vl` | 939 (16.5%) | 78 (1.4%) | 1,039 (18.2%) | 3,643 (63.9%) | 5,699 |
| `std/*.vl`, all | 88 (35.3%) | 8 (3.2%) | 33 (13.3%) | 120 (48.2%) | 249 |
| `std/*.vl`, exported | 66 (42%) | 4 | 16 | 70 | 156 |

The compiler's largest SCC has **318** functions (the next two have 206 and 182). There are 74
cyclic SCCs and 222 self-recursive functions, so recursion is common and the SCC machinery is
not optional. **std's tier ≤ 2 exports are exactly what a getter would call**: all of
`std:simd`'s lane arithmetic, `dot`, `cross`, `normalize`, both `hypot`s and both `atan2`s,
`std:bytes`' decoders, and `std:buffer`'s `load*`/`get*`. Those read linear memory, so they
carry `R.mem`: getters may call them, and `pure` functions may not (§C1b). The estimator treats
every loop as unbounded, so after the §C1a ruling its tier ≤ 2 counts are a lower bound: a
function whose only loops are constant ranges within the budget now lands in tier 2.

---

## D. How users see it

The summary is **never written by the user and never part of a type** (points 3 and 6(i)). It
surfaces in three places.

1. **Diagnostics that name the chain.** A getter or `pure` violation names the property, the
   path, and the line that set the bit:

   ```
   getter `len` has no compile-time bound: it calls `norm` (vec.vl:12), whose `while` is at vec.vl:14
   getter `sum` costs 84 steps, over the budget of 16: 4 × (1 + 20) through `row` (vec.vl:21)
   getter `label` must not allocate: string `+` at shape.vl:9 builds a new string
   `pure function scale` reads module state: `gScale` (a `let`) at cfg.vl:3
   ```

   The chain is the **shortest** path to the first offending line, found by walking back the
   SCC order. (Judgement: a message that names only the getter sends the reader on a hunt.)
2. **LSP hover** on a function name or a call shows one line: `no writes · no allocation · no
   I/O · 3 steps` or `writes: gCount (line 8) · unbounded (while, line 9)`. For a generic it shows the summary at *this*
   call's instance. This is the "visibility comes from tooling" answer that
   `concurrency-design.md` §5 already chose.
3. **Hints, never errors, for facts that do not decide acceptance.** Examples are the §C3
   representation-box hint, and the serialization lint from concurrency §4.

**What users do NOT see:** the `T` bit, the `S` sub-bit outside concurrency diagnostics, and
anything the optimizer derives with global flow (§F-B).

---

## E. The marker

### E1. What it is

`pure function f(...)` (and `export pure function`) is a **checked promise**. The checker
computes `f`'s summary as usual, and if it is not `pure` (§C1), that is an error at `f`, with
the chain. The marker changes nothing about code generation, and removing it changes nothing
either. It is not an assumption the compiler trusts; it is a test the compiler runs on every
build.

The owner's point 4 holds: inside a module the marker adds nothing, because inference already
knows. **Its value is that a future edit of the body cannot silently drop the property**, which
matters only when someone else depends on it. In VL today that someone is the user of std.

### E2. Choosing the word

Point 6(ii): the word must also work as the future type qualifier. Candidates:

| word | as a declaration | as a type qualifier | meaning elsewhere | verdict |
| --- | --- | --- | --- | --- |
| **`pure`** | `pure function f` | `pure (i32) => i32` | Fortran `PURE`, D's weak `pure`, GCC, Solidity, Haskell culture: **effect-free, cost unspecified** | **recommended**, as effects only |
| `const` | `const function f` | `const (i32) => i32` | Rust and C++: *compile-time evaluable*, which permits loops; VL: an immutable binding | reject. It collides with VL's binding keyword, and the borrowed meaning is a different property (it needs ¬`R.let` and permits unbounded loops) |
| `@pure` | `@pure function f` | `@pure (i32) => i32` reads badly | D-style attributes | reject. It opens an attribute syntax class that invites D's "attribute soup", and it composes worse in type position |
| `func` | Nim: `func` = no side effects | — | — | reject. `func` versus `function` is a one-letter semantic difference |
| `view` | Solidity: reads allowed, no writes | — | — | reject. It names the permissive half, and nobody outside Solidity knows it |
| `total` | Koka, Idris: terminates | `total (i32) => i32` | termination | reject **for this axis**. VL already uses "totality" for return-path exhaustiveness (`design-review-2026-09/functional-type-theory.md` §1) |
| `bounded` / `cheap` | a cost promise | — | none standard | a candidate for the **cost** axis if it ever gets a word (§E4), never for effects |

**Should one word promise both effects and cost?** No. The reasons, in order of weight:

1. **The type qualifier's consumers do not want cost.** The only reason `pure` would ever be in
   a function type is higher-order code: `map`'s purity, and concurrency eligibility for a
   callback. Neither cares whether the callback loops. If `pure (T) => U` meant loop-free, a
   `map` over a callback with a loop would be impure, which is false and useless.
2. **The axes are independent (§C1)**, and every surveyed language keeps them apart (§B,
   finding 1). Using "pure" to mean loop-free would redefine a word with forty years of meaning.
3. **Cost never needs to be in a type.** A getter that calls through a function-valued field is
   the only type-level cost question, and (A) already answers it with "not eligible". So the
   cost axis has no one-way decision to protect. It can get a word later, or never.

`pure` is a **contextual** keyword: it is special only directly before `function`, `extern`
(§E5), or, later, a parenthesised function type. It is not used as an identifier anywhere in
`compiler/`, `std/` or `tests/cases/` today (grep: only in comments and the lint name
`unused-pure-expression`). `readonly` (`parser.vl:822`) and `flat` (`parser.vl:3520`) are the
precedent for contextual keywords.

### E3. The std contract

A `pure` std export is permanent under `std-api-review.md`'s rules, because std has no
deprecation story. Removing `pure` breaks every user who relies on it (a `pure` caller, and
later a `pure (…) =>` argument position), so the reviewer checks it as a **permanent
contract**. That needs one new row in the rubric (§2): *"`pure` on an export is a permanent
promise. Add it only when the function's specification, not only today's body, is
effect-free."* The header rule for a std comment (1–4 lines per export) is unchanged. `pure`
is in the signature, so the comment does not repeat it.

### E4. The cost half at the std boundary: a checked baseline, not a keyword

A user getter that calls `normalize` is accepted because the checker sees `normalize`'s body
and grades it getter-eligible. If a later std version adds an unbounded loop, or raises the
bound so that the user's getter's total passes 16 steps, the user's getter fails
**loudly**, on upgrade. So nothing is unsound. What is missing is that **std's own CI would
not notice** that it withdrew a property users depend on.

**Recommended: `scripts/std-effects-baseline.json`**, one line per std export, recording its
derived predicates (`pure`, `terminating`, `getter-eligible`) and its **bound as a number**
(`Bounded(n)` or `Unbounded`, §C1a). `--check` in `gate.sh` fails when any export **loses** a
predicate or its **bound increases**. The bound has to be a number, not only the
getter-eligible bit: a user getter's total is the sum over what it calls, so a std export
going from 8 to 40 can push a user getter over the budget while the export itself stays
eligible. `--write-baseline` goes in the same PR as the loss or the increase, and
that PR must go through `std-api-reviewer`. This is the `seed-size` and `comment-budget` shape
the repo already runs. It is checked, it needs no syntax, and it covers the only boundary VL
has. A new predicate appearing or a bound falling (a body getting cheaper) prints and passes.

**When a keyword becomes necessary:** when a second boundary exists whose bodies the compiler
cannot see. Separately compiled units (`incremental-build-design.md`, and plumb's
separate-compilation axis) are that boundary. A getter in one unit that calls an `extern` from
another unit has no body to grade, and it needs a declared cost promise. The cost word is
chosen then, with a real consumer (§I4).

### E5. Externs

An `extern function` has no body, so its summary is `H ∧ X`, and no getter or `pure` function
may call one. A trusted `pure extern function hostSin(x: f64): f64` is the one place an
unchecked promise could make sense. The compiler cannot check it, and a wrong one is a
miscompile only if the optimizer acts on it. **Deferred (point 4).** Reserving `pure` as the
word before `extern` costs nothing now. No consumer asks for it yet: sunsuz's math asks were
met in VL (`std:math`, #3007) rather than by host imports.

---

## F. Function values

### F-A. Pessimistic at indirect calls (recommended for v1)

A `call_indirect` that is not resolved sets `X`. "Resolved" means the callee expression is a
direct reference to a named function or a lambda literal *at the same call*: `(x => x * 2)(3)`,
or a `const f = named` binding the checker can see through. Anything else is unknown.

- **Cost:** a getter cannot call through a function-valued field. A `pure` function cannot take
  a callback and call it. **Judgement:** neither is a getter's job. The estimator finds 6 std
  functions with an indirect call anywhere in their call tree: `reduce`, `mapIndexed`, `sort`,
  `sorted`, and two in `std:test`.
- **Forecloses:** nothing. Every later option only relaxes it.

### F-A+. Nim's rule: charge a parameter's calls to the call site

Within `map(xs, f)`, a call through the **parameter** `f` is not charged to `map`'s summary.
`map`'s summary records "effects via parameter 2". Each **call** of `map` then charges the
summary of the argument it passes. That is known when the argument is a lambda literal or a
named function, and otherwise it is `X`.

- **Local and stable?** Yes, by the owner's test. Acceptance of `map(xs, g)` reads `map`'s own
  body and the argument written at this call. Nothing flows from a third file. It is the
  closure of point 2's per-instance inference over one more key component, and it is Swift's
  `rethrows` inferred rather than written.
- **What it buys:** concurrency §5's mechanism selection (`map(f, 8)`: is `f` pure CPU?) and a
  `pure` function that uses std's higher-order helpers with pure lambdas.
- **Recommendation:** build it **when concurrency step 6 lands**, which is its first consumer.
  It needs no syntax, so it can arrive at any time.

### F-B. Whole-program flow inference of callee sets

This means computing, for every function-typed value, the set of lambdas and functions that can
reach it, and summarising an indirect call as the union of that set.

- **As a CHECKING rule: reject.** It is imprecise at merges: one impure lambda stored anywhere
  in a field of the same type contaminates every read of it. It also gives **non-local errors**:
  adding `onClick = () => log(…)` in `ui.vl` breaks a getter in `vec.vl` that never mentions
  `ui`. This is exactly the case point 5's principle excludes.
- **As an OPTIMIZER input: yes, and it already happens.** §A5: GUFA devirtualised and inlined a
  closure through a function-typed parameter at `-O3`. The summary may also consume VL-side flow
  facts for elision and hoisting, provided no diagnostic depends on them.

### F-C. An effect qualifier in function types: `pure (i32) => i32`

- **What.** A function type may carry `pure`. A lambda literal's type infers `pure` when its
  body qualifies. `pure (A) => B` is a subtype of `(A) => B`, with the conversion one way only,
  as in Solidity. Calling a `pure`-typed value is effect-free, which is a **local** fact read
  off the value's declared type.
- **Cost.** Every higher-order signature that wants to pass purity through needs either effect
  polymorphism (Koka) or `rethrows`-style syntax. F-A+ covers most of that without syntax. What
  it cannot cover is a *stored* callback: a struct field `cb: pure (i32) => i32`, where the
  purity has to be declared because no call site is in view.
- **Concurrency's ruling.** `concurrency-design.md` §7 rejects a typed effect system "…worth
  revisiting if `T | E` forces a combinator split in practice". F-C would be that revisit. It
  would be scoped to one qualifier, opt-in, with no effect variables, but it is still a revisit,
  and this doc does not recommend it now.
- **Recommendation: reserve, do not build.** Rule now that `pure` is the word in type position
  (§E2), and that an **unqualified function type means unknown effects, permanently** (point
  6(i)). Build F-C when a stored pure callback has a named consumer. A parallel `map` over a
  struct of callbacks, or a getter over a strategy field, would each be one.

### F-D. Recommendation

(A) in v1. (A+) with concurrency step 6. (B) as optimizer input only, and binaryen already
does it. (C) reserved as syntax, not built.

---

## G. Consumers beyond getters

### G1. Evaluation order (D1510)

Today `exprEffectFree` fails closed on every `Call`, which costs A2's stash. With summaries, a
`Call` is admitted when its instance is **effect-free ∧ terminating**. Terminating is required,
and effect-free alone is not enough. The ruling that "a trap is not an effect" rests on "two
effect-free operands that both trap die at one of the two either way". That stops being true
when one operand is effect-free but **diverges**. `{ b: spin(), a: xs[99] }` hangs in source
order and traps in layout order, and the difference is observable. This is the sharpest
argument in the doc that effect and cost are both needed and are different. The same
admission lets `unionEqOperandOk` re-read a getter-eligible call, and the three predicates of
§A1 can become one query with three thresholds (DRY, and it removes a place for them to drift).

### G2. Hoisting and CSE

§A5's `popcnt(k)` runs 1,000 times at `-O3`. Hoisting a call out of a loop needs effect-free
(nothing observes the move), terminating (a loop that runs zero times must not start to hang),
and either no `T` or a guard on the trip count. It also needs **nothing the call reads to be
written inside the loop**, and that is where the location split of §C1 pays. An `R.let` read
conflicts only with the loop's writes to that `let`, and an `R.mem` read only with its memory
stores: both are cheap checks. An `R.heap[param]` read conflicts with any heap write in the loop
that might reach the same object, so without the parameter-heap fact the hoist is unsound
(`norm(p)` moved out of a loop that assigns `p.x`), and with it the hoist needs alias analysis
or the coarse rule "the loop writes no heap". Hoisting is an optimizer consumer, so global flow
facts are allowed here.
One option is to emit binaryen's `--generate-global-effects` plus `--licm` in the release
profile, which needs a measurement first. The other is a VL-side hoist. Neither changes
acceptance.

### G3. Compile-time evaluation

A `const` initialiser, a future const parameter (property-access D4, and the lane immediate in
D1980), or a table built at compile time can be evaluated by the compiler when the callee is
`pure` (the read exclusions of §C1b are essential). Termination is **not** required if the evaluator has a fuel quota
(Zig's `@setEvalBranchQuota`), which is why `pure` must not imply cost. Otherwise every
compile-time-evaluable function would also have to be loop-free.

### G4. Parallelism and concurrency

`concurrency-design.md` §4's three jobs read `H`/`S` (suspends) and `W` plus the reads
(ambient state). §5's eligibility table is this summary's predicates under other names: I/O =
`S`, "pure CPU" = `pure`, "touches ambient mutable state" = `W ∨ R.let ∨ R.mem ∨
R.heap[const]`. **One analysis serves both docs.** It is also why §C1 splits the reads: a
worker gets fresh globals, a fresh memory and freshly initialised `const`s, but it reads
through a parameter exactly what the message carried.

### G5. Diagnostics that come free

- `unused-pure-expression` can extend to a discarded call whose instance is effect-free: "the
  result of `norm(v)` is discarded, and `norm` has no effect". Today `upeIsPure` stops at
  literal leaves.
- B6's O(1) rule becomes checkable for compiler-owned members too. `length` is trivially
  eligible. A future `count` on a sparse collection is not, and the check would say so.

### G6. Narrowing invalidation and stored witnesses (D2390, ROADMAP A6b/A6c)

A narrowing holds until something may write the narrowed place, and a call is the write the
checker cannot see syntactically. Every narrowing-drop site already asks one query,
`callMayWrite(call, key)` (`typecheck.vl`), with `key` a bare name or a path such as `o.v` or
`xs[0]`; today it is answered by two syntactic rules (DECISIONS.md, "A call that may reassign a
narrowed binding ends the narrowing"). The summary replaces those answers without touching a
caller, and to do so it needs more than §C1's `W` bit:

- **`W` per PATH.** Which places the instance may write: a captured binding (a closure's own
  free variables), and parameter-rooted paths — `p0.value`, `p0.a.b`, `p0[*]` for any element
  of a list or map parameter. The bit says "writes something"; narrowing needs "writes this".
  Composed through callees exactly as the fact is (§C4), with `*` for a path it cannot bound.
- **A result⇒argument fact.** "Returns non-null iff argument 0 is i32", or "the returned tag is
  `"i32"` iff argument 0 is i32". It is what A6b Stage A reads at `if bar(x) is null`, and what
  Stage B stores: `const f = bar(x); if f is null` narrows `x`, held until `callMayWrite` says a
  call may write `x` or `f`.
- **A guarded write**, the owner's flow ideal: `k` writes `v` a boolean only when `v` is already
  a boolean, so a narrowing to `f64` survives `k()`. A per-path `W` with the guard's condition
  attached; the least of the three, and the one D2390 deliberately does not attempt.

A declared operator is a call here too (D2400). If operators become restricted to modifying
their own operands (§C1b, the "overload-eligible" question), an operator site's answer is its
operands' paths alone.

---

## H. What each choice forecloses

| decision | forecloses | reversible? |
| --- | --- | --- |
| Summaries are inferred and never written (points 2–3) | nothing: a written form can be added later | yes |
| Getter body must be getter-eligible (point 1, §C1b) | getters that allocate, recurse, loop over data, exceed a budget of 16 steps, or read a `let` | **relaxing is easy** (raise the budget, admit `R.let`). Tightening later would break getters. Reads of the receiver's heap and of linear memory are already admitted |
| The bound's invariant: computable at compile time, never data-dependent (§C1a) | a getter that loops over a receiver's list, however short in practice | **ruled as permanent** (owner, 2026-09-22). Only the budget number may change, through `DECISIONS.md` and a std review |
| `pure` = effects only (§E2) | using `pure` to mean cost; a cost promise via `pure` | **one-way**: the word's meaning is permanent once std exports carry it |
| `pure` excludes `R.let`, `R.mem`, `R.heap[const]` (§C1b) | `pure` functions that read `let` globals, linear memory, or a `const` table's heap | relaxing (admitting a read class) is safe; tightening later is breaking |
| `U` reserved (§C1) | nothing today | free: it is 0 until VL has exceptions |
| Allocation judged on the source (§C3) | an error for representation boxes (a hint only) | yes: an error could be added later, but that would make acceptance representation-dependent |
| Cost promise via the baseline (§E4) | a user-visible cost promise in source | yes: a keyword can be added when a second boundary appears |
| (A) for function values | getters and `pure` functions that call callbacks | yes: (A+) and (C) both only relax |
| Unannotated function type = unknown effects, **permanently** (point 6(i)) | ever defaulting `(A) => B` to pure | **one-way**, deliberately: a default of pure would silently strengthen every existing signature |
| Reserve `pure` in type position (F-C) | using `pure` as a type name before a function type (`pure (`) | cheap: `pure` is not used as an identifier today |
| (B) as a checking rule | — (rejected) | — |

---

## I. Questions for the owner

Ruled: I11, I12 (restaged), I13, I14, I15 (superseded), I16 (deferred), I5 in part, and I2
and I10 for getters.
Settled by what is built: I9. Open: I1, I2 (for `pure`), I3, I4, I6, I7, I8, I10 (for
`pure`). The rulings come from the owner's 2026-09-22/23 decisions on the persona review
(`design-review-getters-effects-2026-09.md` §5, D-Q1 to D-Q7).

**I1. One analysis for getters and concurrency? OPEN.**
(a) The summary of §C is concurrency §4's effect analysis, built once, and both docs cite it;
(b) two analyses.
*Recommend (a).* §G4: concurrency §5's eligibility table is the same predicates under other
names. Two analyses would disagree about what "pure CPU" means.

**I2. Which reads do the getter contract and `pure` exclude?**
**RULED for getters (owner, 2026-09-22):** a getter reads its receiver's mutable fields and
linear memory by design, and excludes module `let` reads because a getter describes its
receiver (§C1b). Getter-eligible is not `pure`.
**OPEN for `pure`:** (a) exclude `R.let`, `R.mem` and `R.heap[const]`, admit
`R.heap[param]` (§C1b); (b) exclude every read, as GCC's `const` does; (c) exclude only
`R.let`.
*Recommend (a).* Its exclusions are exactly what compile-time evaluation and parallel workers
cannot tolerate, and a read through a parameter is safe for both. (b) would refuse
`pure function len(v: Vec): f64`, which reads its argument's fields. (c) lets a worker read a
fresh linear memory and give a silent wrong answer. Strict is the direction that relaxes later
(§H).

**I3. The word. OPEN.** (Ruled alongside it, D-Q5: getter and `pure` stay separate, and no
getter text uses the word.)
(a) `pure`, effects only; (b) `pure` meaning effects and cost; (c) another word from §E2.
*Recommend (a).* Every surveyed use of "pure" is effects only (§B, finding 1). The type
qualifier's consumers do not want cost (§E2). Cost has no one-way decision to protect.

**I4. std's cost promise. OPEN**, deferred by D-Q6 to its own ruling.
(a) A checked baseline, `scripts/std-effects-baseline.json`, and a rubric row (§E4); (b) a
second keyword now (`bounded`, `cheap`); (c) none: inference only, so a std regression breaks
users loudly on upgrade.
*Recommend (a).* It is checked, has no syntax, and covers VL's one boundary. Choose (b)'s word
when separate compilation creates a boundary with no visible bodies.

**I5. What "allocates" means. RULED in part (owner, 2026-09-23, D-Q6): (a), source-visible
allocation** is the fact S1 computes. Why: acceptance must not turn on representation choices.
Whether representation boxes also get a hint stays OPEN.
(a) Source-visible allocation, with a hint for representation boxes (§C3); (b) emitted
allocation, as an error.
*Recommend (a).* (b) makes acceptance depend on representation rules that the program does not
state and the compiler keeps changing (§A6).

**I6. The operator cost table. OPEN**, except two entries ruled with I11: a compare against a
string literal costs the literal's length, and f64 `%` is `Unbounded` for getters (I15).
Which compiler-lowered operations count as loops? The proposal: string and list `==`/`!=`,
string hashing, map `[]` (a probe loop), `utf8` coding, `slice`/`concat`/spread make the bound
`Unbounded` (and set `A` where they build). `.length` does not. A helper whose loop is bounded by
a format constant is §I15.
(a) Conservative: any lowering whose loop depends on its operands is `Unbounded`; (b) treat map `[]` with a scalar key as
bounded (expected O(1)).
*Recommend (a).* The loop test is "would we feel bad", and a string key's hash is O(length). A
relaxation can be ruled per operation later. That direction is safe.

**I7. Function values. OPEN**, deferred by D-Q6 to its first consumer.
*Recommend F-D:* (A) now; (A+) with concurrency step 6; (B) optimizer-only; (C) reserved as
syntax, not built. Confirm point 6(i): `(A) => B` means unknown effects forever.

**I8. Does this amend `concurrency-design.md`'s "never written, never in a type"? OPEN.**
A checked `pure` on a declaration *is* written. F-C would be *in a type*.
(a) Amend §4 narrowly: the analysis stays inferred; a checked, optional declaration marker
exists for boundaries; the type qualifier stays unbuilt (§7 is unchanged); (b) no marker at
all, and the baseline carries `pure` too.
*Recommend (a).* The marker is the owner's point 4, and it changes no code generation.

**I9. Traps inside getters. Settled (a) by what is built:** the getters guide
(`docs/guide/getters.md`) allows a trap from `as!`, an integer division or `divU` by zero, and
the example below runs. Whether the summary splits traps is I16.
`get first(self: Stack): i32 { self.xs[0] }` can trap.
(a) Allowed, which keeps D1510's ruling that a trap is not an effect; (b) forbidden.
*Recommend (a).* A getter that indexes is ordinary, and forbidding traps would forbid almost
every body that reads an array.

**I10. `print` inside a getter or a `pure` function. Getters: RULED (owner, 2026-09-23,
D-Q6)**, no host I/O in a getter or in anything it calls. **`pure`: OPEN.**
(a) Forbidden (`H`), with no escape; (b) a D-style `debug` escape.
*Recommend (a) in v1.* An escape is additive later. A getter that prints is the surprise the
contract exists to prevent.

**I11. Constant-trip loops. RULED (owner, 2026-09-22), with the metric and budget corrected
the same day (D-Q2).**
Constant-bounded loops are allowed: `for i in <int literal | const int> (to | until) <same>
[step <literal>]`, the loop variable never assigned, `break` and `continue` allowed.
**Invariant: the worst-case cost is computable at compile time from the source plus bounded
callees, and never data-dependent.** Never allowed: a `for`-in over data, a data-bounded range,
`while`, recursion. Cost is counted in **abstract steps**: a call costs 1 plus its callee's
cost, a loop multiplies, a branch takes the max. The total, transitive through calls, is at
most one named budget of **16 steps**, tuned by usage, which supersedes the earlier 64
iterations; the error names the call path. A constant-range loop variable gets an internal
interval type `[lo, hi)`, with no user syntax. Only the budget number may change, through a
`DECISIONS.md` entry and a std review. Build after the persona review's contract rows close
(steps over calls, string-literal compares, f64 `%`) and D2064 (intrinsics, closed #3048).
Why: steps charge calls, which trip counts left free. §C1a is the rule.

**I12. Staging. RULED (owner, 2026-09-23, D-Q6 (b+)).**
(S1) Compute now every fact whose meaning is settled: writes state (`W`), allocates
(source-visible `A`), cost in steps (`B`), and host I/O (`H`, `print` included). Each has a
reader on day one: hover shows the summary, and a dump fixture pins it so a wrong fact fails a
test. Getter admission of ordinary callees reads them: a getter may call a function with no
writes, no allocation, no I/O and a cost within the budget (previously S2). (Later, each with
its own ruling or first consumer) the read-location split (`R.let` / `R.heap` / `R.mem`), the
trap split (I16), `pure` as a contextual keyword with its rubric row, the std cost baseline
(I4), function-value effects (I7, F-A+), D1510's reorder admission, the trusted extern marker,
and optimizer hoisting. F-C is not scheduled.
Why: a fact with no reader goes wrong unnoticed, and these four have one.

**I13. Which module `const`s count as a constant range end? RULED (owner, 2026-09-22): (a).**
Only a `const` whose initializer is an integer literal, or another such `const`, bounds a loop.
Folding (b) is a later widening. Why: it meets the invariant with no folding machinery.
A module `const` may be bound to a run-time value (`const n = count()`), so "module const int"
needs a definition.
(a) A `const` whose initializer is an integer literal, or another such `const`; (b) any
integer `const` the compiler can fold (`const N = 4 * 2`); (c) any `const` of integer type.
*Recommend (a).* It meets the invariant with no folding machinery, and (b) is a pure
relaxation for later. (c) breaks the invariant.

**I14. Heap reached from a module `const` (a lookup table). RULED (owner, 2026-09-22): (a).**
A getter may read a module `const`'s heap; `pure` may not. Why: a table lookup is a natural
getter, and a worker's copy of the table is freshly initialised.
`const LUT = [0, 1, 4, 9]; get sq(self: Small): i32 { LUT[self as i32] }` reads a `const`'s
heap. Property-access §D3a-contract already permits it for getters ("the heap reachable from
`self` or from a module `const` is readable").
(a) Getters: allowed; `pure`: excluded (§C1b), because a worker's `LUT` is freshly initialised
and would miss a run-time mutation; (b) allowed for both; (c) excluded for both.
*Recommend (a).* A table lookup is a natural getter, and "constants" in the getter rationale
reads most naturally as including them. For `pure` the exclusion can be relaxed later if VL
gains immutable list literals, whose heap no one can write.

**I15. Loops bounded by a format constant. SUPERSEDED (owner, 2026-09-22, D-Q1).**
The premise was wrong: `__f64_rem__`'s trip count depends on the operands' exponent gap, so it
is data-dependent, and f64 `%` is refused in getters. The question as first put:
f64 `%` lowers to `__f64_rem__`, whose loops are bounded by the float format, not by the
operands. Property-access §D3a-contract already treats it as tier 2.
(a) Such helpers count 0 toward the budget; (b) they count their real worst case.
*Recommend (a).* The budget is about the loop a reader writes. A per-helper constant would add
a number to the rule that nobody can see in the source, and it would change whenever the
helper is rewritten.

**I16. Split `T` into explicit and implicit traps? RULED (owner, 2026-09-22): deferred.** Split
it when a VL-side hoist or speculation pass lands.
binaryen, Cranelift and LLVM all distinguish a certain trap from a possible one (§B2 finding 4).
*Recommend: not now.* `T` is optimizer-only and has no consumer that needs the split yet. Split
it when a VL-side hoist or speculation pass lands.

---

## Appendix: probes

Every program below was run with `dist/vl` at `9341d7e1c`. Disassembly uses
`/home/verit/vl/node_modules/.bin/wasm-dis`.

| # | probe | outcome |
| --- | --- | --- |
| 1 | `{ b: two + one, a: one + two }`, where `"+"` logs its left operand | prints `21`: source order kept through the operator rewrite |
| 2 | `{ b: sq(3), a: next() }` | the stash fires: 2 `local.set`s before `struct.new` |
| 3 | `{ b: sq(3), a: 1 }` vs `{ a: 1, b: sq(3) }` | 2 vs 0 `local.set`s, 216 vs 202 bytes: a pure call alone pays the stash |
| 4 | `n.name == "bob"`, `n.name + "!"`, `a.tags == b.tags` | `call $__str_eq__` (two loops), `call $__str_concat__` (allocates), inline `loop` |
| 5 | §A5: loop-invariant `popcnt(k)` and `apply(lambda, i)` at `-O3` | 0 `call_indirect` (the closure is inlined); `popcnt`'s loop is still inside the outer loop |
| 6 | `keepIf<T>(v, keep): T \| null` at `P` and at `f64` | `P`: no allocation; `f64`: two `struct.new` |
| 7 | the estimator over `compiler/*.vl` and `std/*.vl` | §C5's table; the largest SCC has 318 functions |
