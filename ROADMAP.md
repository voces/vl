# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**,
**permissive & structural**, **fully type-safe** (statically sound — there is no
untyped code; inference holes resolve to concrete types), compiling to **lean
WebAssembly**. Deliverables:
**LSP-backed VS Code extension** (exists, partial; now with a Run-Current-File command) ·
**CLI to compile/run** (MVP: `deno task run` / `compiler/cli.ts`; native binary TBD) ·
**in-browser playground with a sandbox** (missing).

Status legend: ✅ done · 🟡 partial · ⬜ not started.

**Repo layout** (restructured June 2026): `compiler/` — the language core (compile,
toAST, toWasm, defaultScope + generated `antlr/`), owned by nobody else · `lsp/` — the
VS Code extension/LSP client+server over the core · `cli/` (future) · `playground/`
(future) · `grammar/` — the `.g4` spec + antlr gen project · `samples/` · `tests/` —
`.vl` corpus + runner · `docs/` · `reference/` — retired ts-interpreter. Single root
`package.json`/`node_modules` (so esbuild resolves deps from both `compiler/` and `lsp/`)
and root `deno.json` (workspace config + test/lint).

The tracks below are **independent** unless a dependency is called out. Within a
track, items are roughly ordered. See `docs/language-todo.md` for prose on the
closures / `is` / variance designs referenced here.

---

## Track A — Type system (`toAST.ts`)
*Blueprint: Elixir v1.20 set-theoretic types, adapted for a **fully-typed** language
(no `dynamic`/gradual escape hatch — VL has no untyped code). Independent of codegen.*

- 🟡 **A0. Inventory the existing type algebra.** Have: `Alias`, `Function`, `Object`
  (structural, with index signatures), literal types (`IntegerLiteral`/`RealLiteral`/
  `StringLiteral`/`BooleanLiteral`), `Union`, `Nullable`, `Unknown`, `Never`, `Type`,
  `Infer`, `Custom` (predicate). Missing the rest below. Note: `Unknown`/`Infer` are
  **inference holes that resolve** to concrete types, not a runtime `dynamic` — VL is
  fully typed, so there is no gradual escape hatch.
- ⬜ **A3. Intersection types** (`A & B`). Needed for narrowing results and structural
  refinement. Round out the set-theoretic algebra.
- ⬜ **A4. Negation types** (`not A`). Needed so guards can subtract types on the false
  branch.
- 🟡 **A5. Flow narrowing.** **DONE (nullness slice):** inside `if x != null { … }` (or
  `if x is T { … }`), `x` is narrowed to its non-null type, so member access resolves to the
  underlying shape (`p.x` is a type error on `{x:i32} | null`, valid after the guard). A shared
  `conditionNarrowing` fact (`typecheck.ts`) is applied by **both** passes: toAST narrows the type
  scope around the then-branch, toWasm a `narrowed` overlay consulted by `codegenType` (the local
  keeps its nullable wasm type, so `local.get`/`struct.get` — which accept a nullable ref — stay
  valid). **DONE (post-guard narrowing):** a guard clause whose then-branch *diverges*
  (`if x == null { return } /* x non-null below */`) narrows `x` for the rest of the block — the
  idiomatic null-handling pattern. `divergesStatement` (return/break/continue, a block ending in
  one, an `if` with all branches diverging, a divergent `while true`) + `postGuardNarrowing`,
  applied by both passes when walking a block's statements. Tests `types/nullable.vl`,
  `types/guard-narrowing.vl`. REMAINING (needs A3/A4 for the general case): narrowing **union**
  members (not just null), `&&`-chained guards (`if x != null && x.y …`), and `case`/multi-guard.
- 🟡 **A6. `is` operator.** **DONE (stage 1):** grammar `expr IS type` (`x is T`), a `VLIsNode`,
  typed boolean, feeds A5 narrowing. Runtime test is `ref.is_null` (for a `T | null`, `is null` vs
  `is T` are the only variants); `==`/`!=` against `null` are the natural sugar (also
  `ref.is_null`). Nullable **reference** types only so far: `T | null` for a struct/array/string/
  closure is a WasmGC nullable ref (`ref null $t`), `null` is `ref.null` (heap type from context).
  Tests `types/nullable.vl`. REMAINING — **stage 2:** general `x is SomeStruct` union discrimination
  via `ref.test`; **stage 3:** nullable *numerics* (`i32?`), which need a boxing/tagging decision.
- 🟡 **A7. Real `string` type.** DONE (core): `string` is now a proper Object in
  `defaultScope.ts` (was a half-baked `Alias`) — `name: "string"`, an `{[i32]: i32}` index
  signature (so it's an i32-array of char codes, with `.length`/`s[i]` for free), and `+`/`=`
  operators with a nominal `Custom` validator (mirrors the numeric pattern). Removed the
  `Alias "string"` special-cases (`toAST` `toType`, `getConcreteType`). Fixed a latent bug:
  `_softenImplicitType`'s Object case **dropped the `name`** when a property softened, which
  turned `string` into an anonymous object. `==`/`!=` now type-check (boolean) + codegen.
  REMAINING: richer methods (slice, indexOf, …); `boolean`-where-`i32`-expected coercion (storing
  a comparison result needs an `if` today).
- ⬜ **A8. Exact / Inexact variance** (TODO.md). Params Inexact by default (accept excess
  properties), values Exact. Guard the `a.foo = b` footgun noted in TODO.md.
- ⬜ **A9. Readable / Writable variance** (TODO.md). Applied automatically during
  parameter inference.
- ⬜ **A10. Parametric types / generics.** `function foo<T>(x: T)`. Elixir defers these too —
  hard. Needed for real collections.
- ⬜ **A11. Recursive types.** `getConcreteType` explicitly punts on recursion today.
  Needed for trees/lists/JSON-shaped data.
- ⬜ **A12. Soundness pass / test suite.** Port the "If T" narrowing benchmark idea; build
  a corpus of "must-error" and "must-not-error" programs. Define the soundness contract
  (statically sound — every well-typed program is type-safe at runtime).
- 🟡 **A13. Operator-constraint inference (row-polymorphic generics).** **DONE (the core):**
  a fully-inferred structural function now works end to end —
  `function add(self, b) { x: self.x + b.x, y: self.y + b.y }` over `{x, y}`, monomorphized per
  call shape (verified at **both i32 and f64** from two call sites, `functions/structural-generic.vl`),
  and `function max(a, b) { if a > b then a else b }` (`functions/inferred-compare.vl`). Three
  changes made it work: (1) `_typeFromExpression` BinaryOperation no longer **errors** on a hole
  operand — it returns boolean for comparisons / the operand type for arithmetic, deferring
  concretization to the call site; (2) codegen resolves operand + object-literal types from the
  **instance scope** (`codegenType` extended to `BinaryOperation` / `ObjectLiteral`), so a
  monomorphized body sees concrete numerics instead of declaration-time holes; (3) a block whose
  desired type is an unresolved hole takes its tail expression's concrete type. Mirrors how VL
  already infers *property* constraints (`o.x`) and *callability* (`fn(a,b)`). **REMAINING:**
  soundness of the hole-operand rule is permissive (doesn't yet reject `i32 + string`); and the
  *stored-closure* operator case (`vec + vec` via a `"+"` field, B13) is still blocked — there
  the method is compiled once at the inferred param shape, not per call, so it hits the WasmGC
  width-subtyping wall independently of this inference work.
- ⬜ **A14. Named/opaque type robustness (+ a real crash bug).** `type Point = { x: f64, y:
  f64 }` (with `=`) works as a structural alias and resolves as a param type. **BUG:** the
  opaque form `type Point` (no `=`/body — the `TYPE ID` grammar alt) registers a
  *self-referential* alias (`subType: {Alias: "Point"}`); using it as a type sends
  `getConcreteType` (`typecheck.ts`) into **infinite recursion → stack overflow**, which the
  per-statement `try/catch` swallows, silently dropping the declaration and yielding a
  misleading "undeclared." Fix: cycle-guard `getConcreteType` (it "explicitly punts on
  recursion" per A11 — same area), and DECIDE what `type Point` (no body) means — lean **clean
  error for now**, real **nominal/opaque types** later. Also surfaces the `{…}`-block-vs-object
  ambiguity: a bare `{…}` after `type Point` parses as a separate statement, not the body.
- 🟡 **A15. Equality.** DONE: `==`/`!=` default to **structural (by value)** — consistent with
  strings (already value-compared) and numerics, and with VL's structural/value semantics
  (`{x:1} == {x:1}` is `true`). Codegen: a per-shape `objectEqFn` (`toWasm.ts`) ANDs field
  equalities (native numerics, `__string_eq__` for strings, a recursive helper for nested
  structs); the type rule gates it on `isEquatable` (`typecheck.ts`). **Function-valued fields
  compare by reference** — a function value is a fat-pointer closure `{tableIndex, env}` (freshly
  allocated, so comparing the pointer is useless), so equality is *same function* (`i32.eq` on
  the table index) AND *same captured env* (`ref.eq`). Sound and well-defined ("data by value,
  functions by identity"); conservative only for capturing closures (a fresh env per instance
  compares unequal even with identical captured values — the non-idiomatic field-method pattern).
  A custom `==` operator (B13/B14) overrides the default. **Array `==` DONE** — length +
  element compare via a per-element-type `arrayEqFn`, recursing through a shared `valueEq` helper
  (numerics native, strings/arrays/structs recursive, functions by reference) that now also backs
  `objectEqFn` and the top-level `==`; an array is equatable iff its element type is, and a
  struct with an array field is now equatable too. Tests `objects/equality.vl`,
  `objects/equality-function-field.vl`, `arrays/equality.vl`. REMAINING: **referential identity**
  operator (O(1) `ref.eq`) — deferred; `is` is reserved for A6 type-narrowing, so identity needs
  its own spelling (`===`, or `identical(a,b)`); storing a comparison result as i32 still needs an
  `if` (boolean↔i32 coercion).

---

## Track B — Codegen, memory model & runtime (`toWasm.ts`)
*The "no-GC vs WasmGC" decision lives here. Recommendation: make placement a compiler
decision — escape analysis stack-allocates non-escaping values; escaping values go to
WasmGC; keep manual linear memory as an opt-in escape hatch.*

*Dependency decision: **keep binaryen** (unlike antlr4 — Track G). It's pure WASM/JS,
does the heavy lifting (IR + validation + optimizer), supports WasmGC types (helps
B1/B4), and is a library binding that does **not** block self-hosting. The binaryen
patch was **removed** (F8 done): the LSP server now builds as ESM, where binaryen's
top-level await is legal, so `patch-package` and the 242KB patch are gone. `toWasm`
stays tolerant of both binaryen forms (sync object / async init).*

- ✅ **B0. Numeric literals + i32/f64 arithmetic, if/while, direct calls, `__program__`
  start fn, memory builtins.**
- ✅ **B1. Allocation strategy DECIDED: WasmGC** (June 2026). The heap phase (closures,
  objects, arrays, strings) builds on WasmGC structs/arrays; linear memory stays as an
  opt-in escape hatch; escape-analysis stack-allocation is a later optimization.
  **binaryen upgraded 116→130** for the ergonomic GC API (`module.struct`/`module.array`/
  `TypeBuilder` — absent in 116). The old upgrade blocker (binaryen TLA breaking CJS) is
  moot since the LSP server is ESM. Only API drift: `i64.const` now takes a single bigint.
- 🟡 **B2. Finish numeric codegen.** DONE: **i64 & f32 binary arithmetic** — the numeric
  BinaryOperation dispatch was unified into two op tables (`INT_BINOPS` signed / `FLOAT_BINOPS`),
  applied as `m[wasmType][method]`, covering i32/i64/boolean (integer) and f32/f64 (float); this
  also enabled **float `/` and comparisons** (`<`/`>`/`<=`/`>=`), previously unhandled even for
  f64. A literal operand coerces to the other side's concrete numeric type (`i64var * 2` lowers
  `2` as i64) — the right operand of a builtin numeric op takes the left's type, not the operator
  method's (Union) param type. Tests `numerics/wide-arith.vl`. DONE: i64/f32 **type mappings**
  (`wasmType.ts`) — typed locals/params/returns + `print` of those. DONE: **range-aware
  integer-literal defaults** — an un-annotated integer literal defaults to the narrowest type that
  holds it *exactly* (i32, else i64) instead of wrapping; beyond-i64 is a diagnostic
  (`defaultIntegerType`, shared by `typecheck.ts` soften + `toWasm.ts` codegen). Still TODO:
  numeric **casting/coercion** between types (none today — e.g. `i32`→`i64` is implicit-only via
  literals; no explicit conversion of a *value*).
- ✅ **B3. First-class functions / indirect calls** — incl. per-shape monomorphization.
  *Representation note: B4 superseded the bare i32 index — a function value is now a fat-pointer
  closure struct `{ i32 tableIndex, structref env }`; the table + `call_indirect` dispatch below
  still stand.*
  A function value is an **i32 index into a wasm function table** (`addTable` +
  `addActiveElementSegment`); function-typed locals/params hold that index and
  `call_indirect` dispatches on it. An un-annotated higher-order param works: `function
  apply(fn, a, b) fn(a, b)` infers `fn` is a 2-arg function (see A6-adjacent inference in
  `toAST.ts`). Indirect-call signatures and inferred return types are read back from the
  monomorphized scope / compiled body (`getExpressionType`), not the once-inferred AST.
  **Per-shape monomorphization (done, → folds into A10):** each call site instantiates a
  *fresh* copy of the (generic) signature — `cloneTypeFresh` gives fresh-but-consistent
  inference holes, unified against that call's args, then collapsed (`makeExact`) to concrete
  types so the check is strict (this also closed the inferred-return soundness gap). Codegen
  keys wasm instances on the **wasm parameter signature** (`name`, `name$1`, …), so
  `apply(addi, …)` and `apply(addf, …)` emit two correctly-typed instances. *Numeric builtins
  now validate **nominally** (by `name`), not by reference identity, since instantiation
  copies types (`defaultScope.ts isNominal`).*
  **Variant-count tradeoff:** closures collapse to 1 instance (shared fat-pointer struct) and
  primitives to ≤4, but a **structural-object** param yields one instance per distinct concrete
  shape passed — WasmGC structs aren't width-subtypes, and the body is compiled against the
  argument's actual shape (so `getx({x,y})` ≠ `getx({x})`). Bounded in practice (few shapes per
  generic); the principled collapse is **WasmGC struct subtyping** via a global field-slot layout
  (row-polymorphism lowering) — a future optimization, not built. See `vl-monomorphization`.
- ✅ **B4. Closures** — full closures WORK (the project's first WasmGC codegen).
  1. **Nested function declarations** — a function-body block caches its value type during the
     walk (so return-type inference survives the scope pop), and Block codegen registers nested
     decls like the Program case.
  2. **Capture analysis** — `instantiate` compiles a capturing body twice: pass 1 collects the
     captured names (placeholders, body discarded) via a function-boundary check in `lookupName`;
     pass 2 recompiles against the env.
  3. **Environment struct** — a WasmGC struct (`TypeBuilder`, one field per capture); captured
     reads `ref.cast` the env parameter to it and `struct.get`. Captures may be objects (refs).
  4. **Escaping closures** — a function value is a **fat pointer**: a uniform WasmGC struct
     `{ i32 tableIndex, structref env }`. Every impl takes a leading `structref` env param (null
     for non-capturing), so all function values are interchangeable; a value packs
     `{ tableIndexOf(f), env }` (env captured at creation time, travels with the value); direct
     calls prepend the env, indirect calls extract index+env and `call_indirect`. Dispatch stays
     table-based (reuses B3). So capturing functions can be returned / stored in fields / passed,
     each keeping its own env (`functions/escaping.vl`: 15, 110, 17).
  Tests: `functions/closure.vl`, `functions/escaping.vl`. REMAINING (smaller): **mutable
  captures** — writing to a captured variable (needs boxing / a mutable env cell; reads are
  by-value today). Depends on B1 (done) + B3 (done).
- 🟡 **B5. Objects in codegen** — core object support DONE on **WasmGC structs** (reusing the
  closure struct machinery). `{x,y}` → `struct.new`; `p.x` → `struct.get`; `p.x = v` →
  `struct.set`. Shapes are interned by a canonical signature (fields sorted by name, mutable),
  so identical shapes share a struct type; `toWasmType` maps a structural Object to its struct
  ref. Working & tested (`objects/struct.vl`, `objects/pass.vl`): literals, read/write, nested
  reads (`p.a.x`), f64 fields, **objects as function args/returns**, **reassignment**, empty
  objects, and **objects captured in closures** (ref-typed env fields). **Excess properties are
  allowed** (permissive structural width subtyping: `function f(o) o.x` accepts `{x,y}`).
  **Function-valued fields + member-call syntax** work: `let o = { f: someFn }` then `o.f(args)`
  (a new `VLCallNode` for calling an arbitrary expression value; dispatches through the closure
  struct, so the field may hold a plain function *or* an escaping closure — `objects/member-call.vl`:
  7, 42, 105). Also fixed a parser precedence bug this surfaced: member-access *reads* (`.`/`[]`)
  bound looser than arithmetic (`a.x + b.y` mis-parsed as `(a.x + b).y`) — moved them above the
  operators in `VL_Parser.g4` + regen. REMAINING (separate features): **methods via explicit
  receiver + UFCS** (see B14 — DECIDED: no `this`), **method-shorthand** field sugar
  (`{ add(a,b) … }` — parser; the `{ f: function… }` form already works, B15 done), typed
  literals in object values (`{n: 4<i64>}` — parser), and **Exact-by-default for values**
  (A8 variance — excess is permissive everywhere today).
- 🟡 **B6. Arrays in codegen** (WasmGC arrays). Depends on B1. **MVP DONE.** Arrays are the
  type whose `[]` index operator (B13) is *native* (`array.get`/`array.set`) — fast integer-
  keyed, contiguous, the performance path. Represented (reusing the type layer) as an
  `i32`-index-sig object `{[i32]: T}` (`arrayElementType` is the shared detector). DONE:
  literal → `array.new_fixed`, `a[i]` → `array.get`, `a[i] = v` → `array.set`, `a.length` →
  `array.len`, native bounds-trap; verified through fn params/returns, object fields, loops,
  f64 elems (`arrays/basics.vl`, `arrays/f64-elems.vl`).
  **Size-member design (DECIDED):** `length` is **not** a structural member of `{[i32]:T}`
  (baking it in broke index-sig subtyping — a literal would carry a `length` a `{[i32]:i32}`
  param lacks). It's a **contract member accessed with property syntax, dispatched per type to
  a native lowering** — the *uniform access principle* (Ruby/Scala/Eiffel), the same model as
  `+`→`i32.add`. Rules: (a) `length` is **read-only** (no JS writable-length truncation —
  resizing is explicit ops); (b) **property syntax (no parens) is reserved for O(1)** members
  (`length`/`count`/`capacity`); computing operations (`push`/`map`/`slice`) are **methods**
  (parens), so a `.length` you see is always cheap; (c) **sparse uses distinct
  `count`/`capacity`/`extent`, never an overloaded `length`** (avoids Lua's `#`-on-sparse
  ambiguity — extent ≠ count ≠ capacity). Generalization (later, → B13): a per-built-in
  intrinsic-members table instead of the hardcoded `length` check; don't build until the 2nd
  intrinsic (`push` / string `length`) arrives.
  **Tiers (simplest first):** (1) ✅ **fixed-length arrays** — WasmGC arrays are runtime-*sized*
  but fixed-length-after-creation; `length` is intrinsic (`array.len`). (2) **growable
  list/vector** — a struct `{ array backing, i32 len, i32 cap }` where `length` is now a *real
  stored* field (logical len ≠ capacity), read-only; push/grow reallocates, built on (1). (3)
  sparse → the map below (`count`/`capacity`), not an array tier.
- ⬜ **B6a. Maps / non-string keys (`Map<K,V>`, Lua-flavored — distinct type, not every
  object).** DECIDED vision: support arbitrary keys (numbers, objects, …) as a *separate* hash
  `Map` type, NOT by making every object a dynamic table — keep three representations under one
  `[]`/`.field` surface: static-string-key **structs** (compile-time field index, fastest),
  `i32`-key **arrays** (native, contiguous), arbitrary-key **maps** (hashed, heap). You pay
  hashing only when you use a `Map` (no JS/Lua "every object is secretly a hashmap" tax), and
  it stays fully typed. Index signatures (`{[string]: T}`, already type-check but **dropped at
  codegen** — `objectStruct` keeps only StringLiteral keys) are the type-level precursor →
  this is their codegen. Dispatches through B13's `"[]"`/`"[]="` traps. Deferred.
- 🟡 **B7. Strings in codegen.** DONE (core): a string literal lowers to `array.new_fixed` of
  its code points; `toWasmType(string)` → a WasmGC i32-array (via the index sig, regardless of
  the nominal `name`); `.length`/`s[i]` ride the array machinery; `+` concatenates inline
  (`array.new` + two `array.copy`). Works as a value, param (`function f(s: string)`),
  reassignment, and a `self`-receiver (`"hi".first()`). **`==`/`!=`** done — a lazily-emitted
  `__string_eq__` helper (length + element compare). **Low-level printing** — `__store_string__(off,
  s)` copies a GC string's chars as bytes into linear memory (lazy `storeStringFn` helper), and
  `__log_string__(off, len)` host import renders raw bytes as text (used by `strings/print-and-eq.vl`).
  **`print(x)` convenience** done: a string streams its code points to the host one at a time
  (`__print_string__` → `__print_char__`/`__print_str_flush__`, no linear memory — the host can't read
  a GC array directly). Tests `strings/basics.vl`, `strings/string-method.vl`, `strings/print-and-eq.vl`,
  `run/print.vl`.
  REMAINING: **`wasm:js-string` builtins + UTF-16 (`i16`) string representation** — the *conventional*
  WasmGC↔JS-host story (what dart2wasm/Kotlin-Wasm do): the engine reads the GC array directly via
  `fromCharCodeArray`, replacing both per-char `print` streaming and any linear-memory copy in one bulk
  native call. Requires switching the string backing from an i32 code-point array to `(array mut i16)`
  (touches literals, indexing, `.length`, concat, `==`). Engine support confirmed (V8 14.9 accepts
  `{builtins:["js-string"]}`). Also: **UTF-8 / i8-packed** representation as a size optimization
  (current MVP is 4 bytes/char); richer methods (slice, indexOf).
- 🟡 **B8. Loops.** DONE: **`for…in` over arrays** — the `to`-less `for x in arr` (grammar:
  the `TO expr` clause is now optional) binds `x` to each element, lowered to a 0..length index
  loop over `array.get` (iterable evaluated once into a local); a non-array iterable is a clean
  type error (`loops/for-in.vl`, `loops/for-in-not-array.vl`). DONE: **`for` `step`** —
  increment uses the actual `step`, and the inclusive exit test is **direction-aware**
  (`(step>=0 && i>to) || (step<0 && i<to)`, with `to`/`step` evaluated once into locals), so
  descending loops work too (`loops/for-step.vl`: ascending 0,2,4,6→12; descending 5..1→15).
  DONE: single-line block bodies (`for … { s = s + i }`) — `block` no longer requires a leading
  newline after `{`, so `object` (tried first, fails on a non-pair) falls back to `block`;
  objects still win on key:value contents (`loops/single-line-block.vl`). DONE: a provably-empty
  literal `for` range **warns** (`5 to 1` → "range is empty and never iterates"; `loops/empty-range.vl`)
  — the first non-error diagnostic (see B17). REMAINING: `for…in` over objects / maps; the `for
  val, i in arr` (value + index) and `for , v in obj` destructuring forms (aspirational in
  `samples/loops.vl`).
- ✅ **B9. `break` in codegen.** A `break` branches to the loop's outer (`__brk`) block —
  the same target the loops already used for their exit test — so control resumes after the loop;
  `break <label>` targets a labelled loop (`brkLabel` centralizes the `cont`→`brk` naming, shared
  by the loops + the `Break`/`Continue` cases). Verified with `continue` and labelled `break outer`
  (`loops/break.vl`). Also fixed a pre-existing bug this surfaced: **sequential unlabelled loops
  collided** — `loopIndex--` undid its own increment, so every auto-named loop became `loop0`
  (binaryen requires unique IR names); the decrement is removed, so the counter is monotonic.
- ✅ **B10. Unary / prefix / postfix ops in codegen.** **unary `-`** (grammar prefix at
  tighter-than-`*`/looser-than-`^` precedence; toAST folds `-<literal>` to a negative literal,
  else lowers `-x` to a type-matched `0 - x`, reusing `-` codegen — i32 + f64). **`++` / `--`**
  (prefix returns the new value via `local.tee`; postfix returns the old via `tee` then undo the
  delta; statement position just mutates; a new `UnaryOperation` AST node, operand must be a
  variable). **`!`** (logical not → `i32.eqz`; also wired `boolean`→i32 in `wasmType.ts`, which
  booleans-as-values needed). DECIDED: **only `!`, not `not`** — VL's logical operators are
  symbolic (`&&`/`||`/`!=`), so the `not` keyword (the lone word-operator) was dropped from the
  lexer + grammar for one-way consistency. Tests `operators/unary.vl`, `loops/for-step.vl`.
  Minor gaps: `++`/`--` are i32-only and operate on a `Name` (not `o.x++` / `a[i]++` yet).
- ✅ **B11. `while true` return analysis.** A `while true` with no `break` escaping it now
  types as **`Never`** (it never fails its test, and `return` leaves the whole function — so it
  never falls through to a value), instead of `Nullable<body>`. So a function whose tail is such a
  loop returns purely via its inner `return`s, with no spurious `… | null` (`isConstTrue` +
  `hasEscapingBreak`, which respects labels + nested loops). Tests `loops/while-true-return.vl`.
  Two adjacent codegen gaps this surfaced, also fixed: (a) an un-annotated param used as a numeric
  operator's **right** operand (`i32 >= n`) unifies to the builtin's `Custom` validator type —
  `wasmType.ts` now maps a named `Custom` like its numeric; (b) a **generic inferred-return**
  function whose body ends in `return` compiled to a non-concrete (`unreachable`) result —
  `instantiate` now records the `return` value's wasm type and uses it as the fallback
  (`functions/generic-return.vl`, e.g. `function double(n) { return n * 2 }`).
- ⬜ **B12. `async`/`await`.** Keywords exist in the lexer; no semantics or codegen.
  Large; likely last.
- 🟡 **B13. Well-known-symbol dispatch (operator overloading / callable objects / index
  traps).** Generalize codegen so an operation on a *user* shape calls the typed method named
  for that operation in the shape's contract, instead of being hardcoded. **DONE (operators):**
  `toWasm.ts` BinaryOperation now dispatches a structural-object operand through its operator
  method field — `struct.get` the method closure, `indirectCall` with the right operand, reusing
  the B5 member-call machinery. A `vec` with a `"*"` / `"/"` field scales by a scalar
  (`objects/operator-overload.vl`). Also fixed a real bug this needed: **string object keys kept
  their quotes** (`toObjectLiteral` `getText()` without `.slice(1,-1)`), so a `"+"` key never
  matched the operator `+` — affected *all* string keys, not just operators.
  **DONE (object-shaped operands, e.g. `vec + vec`) via self-methods (B13+B14):** grammar now
  allows an **operator-named function** (`function +(self, b) …`, a `funcName` rule), and toAST
  routes `a op b` on a user object to `op(a, b)` when a free `self`-function named for the
  operator is in scope — reusing the FunctionCall path, so it **monomorphizes per call** and
  sidesteps the stored-closure width wall (`objects/operator-self-method.vl`: `vec + vec` →
  `{4,6}`, chains, native numeric `+` keeps its inlined path). The *field*-operator form (B13
  stored closure) still works for primitive operands and coexists (field has no free function →
  native BinaryOperation dispatch). REMAINING: callable objects (`"()"`) + index traps
  (`"[]"`/`"[]="`), still to wire.
  The type system **already** dispatches generically — `_typeFromExpression` BinaryOperation
  (`typecheck.ts`) finds the left operand's property whose name matches the operator and checks
  the right operand against its parameter type. Builds on B5 `indirectCall` — static, no runtime
  `Proxy`. (Also surfaced: **direct recursion doesn't work** — `toFunctionDeclaration` registers
  the name *after* the body, so `function f() … f() …` is "undeclared f"; forward-register the
  name before walking the body. Separate gap, tracks near A-track / functions.)
  - **Operator overloading:** `a + b` (and `- * / %  == < …`) on a user object calls its
    `"+"` method (typed `(right: T) -> R`). Mixed operands already expressible — the method's
    parameter type governs the RHS, so `vec + 5` vs `vec + vec` are distinct contracts.
  - **Callable objects:** an object with a `"()"` method **taking parameters and returning a
    value** is invokable — `obj(a, b)` dispatches to that method with `[a, b]` (the call
    operator is overloadable exactly like `+`). Needs (1) grammar/`toAST` to route a call
    whose callee is a *callable-object*-typed value to a `VLCallNode` instead of erroring
    (today `toAST.ts` pushes a `function-call` type error for a non-`Function` callee), and
    (2) the `"()"` well-known name in the operator-lookup path. (Multiple call signatures —
    true ad-hoc overloading by arity/type — is a later extension.)
  - **Index traps:** `o[k]` / `o[k] = v` dispatch to `"[]"` / `"[]="` methods when the shape
    declares them (else the static `struct.get`/`struct.set` field path). This is the
    "built-in instead of `Proxy`" goal: get/set/apply traps as **typed methods in the
    contract**, resolved statically. (Note: index *signatures* `{[string]: i32}` type-check
    today but are **dropped** at codegen — `objectStruct` keeps only StringLiteral keys — so
    dynamic-key storage is a separate runtime-representation question, likely a map/array
    backing, distinct from the trap-dispatch above.)
  Unblocks/over­laps **A7** (a real `string` object type needs exactly this operator-method
  codegen). Reuses B3 (monomorphization) + B5 (`Call`/`indirectCall`).
- 🟡 **B14. Methods via explicit `self` receiver + UFCS (no `this`).** **DONE (core):** a free
  function whose first parameter is named `self` is callable as `o.f(args)` — toAST rewrites it
  to `f(o, args)`, reusing the FunctionCall machinery, so `self` **monomorphizes to the
  receiver's shape per call** (rides A13/B3). Verified: `a.add({…})` returns a new shaped object,
  `p.sumsq()` (`objects/self-method.vl`). Resolution order implemented: a callable **field** wins
  (container/data, no receiver — `foo.add(…)`); else a free `self`-function (UFCS); else error. A
  **non-`self`** function is NOT reachable via an instance (`o.plain(2)` → "Unknown property" —
  no namespace pollution, `objects/self-method-pollution.vl`). `self` is a plain param *name*, no
  lexer keyword needed. REMAINING: route **operator** dispatch (B13) through self-methods so
  `vec + vec` works (the method path avoids the stored-closure width wall — `a.add(b)` already
  does); `c.area` (no `()`) as a bound value; mutation/variance (A9). DECIDED: VL has **no
  `this` keyword**. A method is a function whose first parameter is the **`self` keyword**
  (Rust-style); `o.f(a)` is sugar for `f(o, a)` (uniform function call syntax). Rationale: VL
  already has first-class closures and `o.f()`→`indirectCall`, so this adds **no hidden
  parameter** and no call-site rebinding (the JS footgun) — the receiver is an ordinary,
  visible, type-checked param, consistent with "structural, fully typed, no hidden data flow."
  Methods need no `class`/`shape` site and are open/extensible (any module may add `fn
  area(self: Circle) …`). Design decisions captured:
  - **`self` is the explicit, optional method marker.** First param is `self` → the function
    is a **method**: UFCS binds the receiver, and it's reachable as `o.f()`. No `self` → a
    **plain function / container field**: NOT reachable through an instance. `self`'s type is
    annotated (`self: Circle` → method on Circle) or inferred (`self` → *generic* method over
    any shape the body needs, monomorphized per receiver via B3). This is strictly better than
    a type-directed "first param happens to accept `o`" rule: it's syntactic, so (1) no
    namespace **pollution** — a global `println()` has no `self`, so `o.println()` never
    resolves; (2) **crisp errors** ("expected Circle, got Square", not "no candidate matched");
    (3) it *is* the method-vs-static split for free (no `self` → associated/`Type.f()` story).
  - **Resolution of `o.f()`:** a callable **field** `f` on the shape wins → call the field
    value with the args, **no receiver** (the container/namespace case, e.g. `let foo = { add(a,b)
    a+b }; foo.add(1,2)` — `foo` is pure data, nothing implicit passed); else a free **function**
    whose first param is `self` (typed to / inferring `o`'s type) → `f(o, args)`; else `o.f()`
    is an error. Diagnose field-vs-method collisions.
  - **Receiver is any expression, incl. literals:** `{x:1,y:2}.add({x:3,y:4})` is `add({x:1,y:2},
    {x:3,y:4})` — UFCS isn't limited to a `Name`. (Today the member-call only resolves `.f` as a
    *field*: a free-function `.add` gives "Unknown property `add`" — the UFCS fallback is the work.)
  - **DECIDED — local function-values also participate (gated by `self`):** UFCS is plain lexical
    name lookup, so a `let`-bound function with a `self` first param is reachable as `o.f()` too,
    not just top-level decls. The `self` marker still gates pollution (a local lambda without
    `self` isn't a method); lexical scope keeps it predictable. (But see B15 — a lambda *value*
    is monomorphic, so an untyped local method is shape-locked, unlike a top-level decl.)
  - **Mutation is free, variance is separate:** WasmGC objects are ref-typed, so `self: T`
    is already a reference and `self.x = …` is a `struct.set`. "May a method mutate its
    receiver?" is therefore an **A9 (Readable/Writable)** question, not a receiver question.
  - **`c.area` without `()`:** start as a plain value (resolves only if `area` is a field);
    optional later sugar = a bound method (a closure `() -> area(c)`), purely additive.
  - **Container/namespace objects** (your no-`self` field functions) are the motivating case:
    the function-reference form `{ add: add }` already runs today; what's missing is the B5
    parser/codegen sugar — **inline function literals as field values** (`{ add: function… }`
    parses + type-checks but codegen throws `Unhandled FunctionDeclaration`) and **method
    shorthand** `{ add(a,b) a+b }` (doesn't parse). Both already in B5's remaining list.
  Reuses B5 (`o.f()` lowering). Pairs with B13 (operator/call/index dispatch) — together they
  make "methods, operators, call, index" all ordinary typed functions resolved statically.
- 🟡 **B15. Anonymous / lambda functions (codegen) + the declaration-vs-value distinction.**
  DONE (typed): a `FunctionDeclaration` in value position lowers to its `closureValue`
  (`registerFunctionDecl` handles anonymous fns with a synthesized name; `toExpression` has a
  `FunctionDeclaration` case). Verified: let-bound lambdas called directly, lambdas capturing an
  enclosing variable, lambdas as higher-order args, and **inline function literals as object
  fields** (`let foo = { add: function(a,b) a+b }; foo.add(1,2)` — the container/namespace
  pattern, which also closed B5's inline-function-literal gap). Tests: `functions/lambda.vl`,
  `objects/inline-method.vl`. REMAINING: **untyped** lambdas (the first-class-polymorphic-value
  case below — a stored closure has one signature; needs pinning-by-use or boxing) and the
  **method-shorthand** `{ add(a,b) … }` parser sugar (B5).
  - **DECIDED — syntax:** **one form, `function(params) body`** (unambiguous, already modeled —
    just needs codegen). Bare keyword-less `(params) body` is rejected (the classic arrow
    ambiguity — `(a, b)` reads as a paren/tuple expr until after the `)`; today a hard parse
    error). In VL an arrow form would be **purely cosmetic** — the usual reason for two forms
    (JS's lexical `this`) is moot since VL has no `this`, and `function(…)` already captures
    lexically + has implicit single-expr return. The *only* upside is callback terseness
    (`map(xs, x => x*2)`). **DEPRIORITIZED:** a `(params) => body` arrow (explicit `=>` as the
    disambiguator) may be added later purely for that terseness; not now. Prefer non-syntax
    answers to callback noise first (trailing-closure sugar, UFCS/methods).
  - **DECIDED — declaration vs value (the important semantic):** a top-level `function f`
    monomorphizes **per call site** (B3 cloning), so an untyped `function add(self, b) …` is
    polymorphic across shapes. A `let`-bound lambda is a **closure value** with **one** wasm
    signature, fixed at creation — there's no per-call-site to specialize. So an *untyped*
    lambda is the **first-class-polymorphic-value** case: it's monomorphic (pinned by a single
    use, or annotate it); being usable at multiple shapes needs boxing (see the dictionary/
    uniform-rep fallback noted under B3). Annotated lambdas are fine (one concrete shape).
- ⬜ **B16. Redeclaration / overloading policy.** CURRENT (working): **same-scope
  redeclaration is an error** for `function`, `let`, and `type` (all push a `Redeclaration`
  diagnostic — `toAST.ts`); **nested shadowing** in a deeper scope is allowed (codegen
  uniquifies via `name_1` — `toWasm.ts handleFunctionDecl`) and is **verified correct** (a
  nested same-name `f` shadowing an outer `f` returns the inner one). FUTURE decision: whether
  to allow **ad-hoc overloading** (same name, multiple signatures by
  arity/type) — ties into B13's multi-call-signature note; default for now is "no, one binding
  per name per scope."
- 🟡 **B17. Diagnostics, in general.** STARTED: diagnostics carry `severity` (`error | warning
  | info`, `compile.ts`); the `Syntax` `ParseErrors` variant now has an optional `severity`
  (defaults `error`), so a diagnostic can be a non-fatal **warning** — first consumer is the
  empty-`for`-range warning (B8), and the test harness gained a `@warning` directive. BUILD OUT
  (deferred): (1) thread `severity` through *all* `ParseErrors` variants (only `Syntax` carries
  it today), or move to a dedicated warnings channel; (2) **stable diagnostic codes / categories**
  (the `code` field is ad-hoc ints/strings) for doc links + suppression; (3) a real **lint pass**
  — unused variable/param, unreachable code after `return`/`break`, `step 0` (non-progressing
  loop), shadowing hints, dead branches; (4) **quick-fixes / related-information** for the LSP
  (Track D); (5) consistent **message style** (currently "Syntax error:" prefixes a lot that
  isn't syntactic). The empty-range warning is the template: detect statically, emit a `warning`,
  don't block codegen.
- ⬜ **B18. Tail-call optimization (low priority).** Recursion works (B-track / `functions/
  recursion.vl`) but every call — including recursive — is a regular `m.call`, so it **grows the
  wasm stack**; binaryen does **not** auto-TCO. Deep tail recursion (`sum(100000)`) overflows.
  Substrate is ready: binaryen 130 has `return_call` / `return_call_indirect` + the `TailCall`
  feature (well-supported in V8/browsers). To add: detect **tail position** (a call that is the
  body's tail expression / `return f(…)` / the tail of a tail branch — *not* `n * f(n-1)`, which
  isn't tail-recursive and can't be helped) and emit `return_call` there. Caveat: precise
  tail-position analysis is the fiddly part, and without an explicit `become`/tail keyword it's
  best-effort, not a guarantee. Note many recursions (`fact`, `fib`) aren't tail-recursive
  anyway. **Deprioritized** — correctness is fine; this is a depth/perf optimization.
- ✅ **B19. `return` keyword / early returns.** A function body may `return` early (from a
  branch, from inside a loop) or fall through to a trailing `return`; a bare `return` yields null.
  Wired end-to-end: grammar `returnStatement` → toAST collects each `return`'s value type into
  the function's inferred return (no annotation needed) → toWasm emits `m.return`. A body that
  ends in `return` compiles to an `unreachable`-typed block, and `instantiate` reads the real
  result type from the resolved return type (not the body). Tests `functions/early-return.vl`
  (early/loop/fall-through, inferred i32 + string). *(Fixed alongside: `print(f())` dropped its
  function-call argument in statement position — now evaluated in value position.)*
- ⬜ **B20. Loops as expressions + `break <value>`.** VL is expression-oriented (`if` is an
  expression; blocks yield their tail) and the type system *already* types loops as `Nullable<T>`,
  but the **grammar makes `for`/`while` statements only** (`let x = for …` is a syntax error) and
  `break` carries no value. Proposal: lift loops into expression position, and let a loop evaluate
  to its `break` value — or **null** when it completes without one. Fits VL more cleanly than Rust
  (which restricts break-value to `loop`, since `while`/`for` are `()`): a loop becomes a natural
  *search* expression — `let found = for x in items { if test(x) { break x } }` → `Nullable<elem>`.
  Three layers: (1) **grammar** — `for`/`while` as expressions (follow `if`); (2) **types** —
  collect each loop's break-value types → `Nullable<union>` (a bare `break` + normal completion
  give the null arm), mirroring the `returnTypes` mechanism functions use; (3) **codegen** — the
  loop's outer `__brk` block gets a result type, `break v` → `br $brk (v)`, fall-through pushes the
  null default. **Labels:** `break outer v` targets the outer loop, so break-value collection is a
  *stack of per-loop collectors* indexed like `loopLabels` (a labelled break pushes into that
  label's collector); the value-carrying `br` already targets the right block by name. Notes:
  body's per-iteration tail value is discarded (only break-values + null form the loop value, so
  today's `Nullable<bodyType>` becomes `Nullable<breakValueUnion>`); `continue` stays value-less; a
  *provably* infinite loop (`while true { break v }`) could be non-null `T` — but that needs **B11**
  reachability (independent; Nullable is the safe default until then). Self-contained; sequence as
  (1)→(2) so each step is testable.

## Track C — CLI (`vl` / `vital` command)
*New surface. Depends on the existing parse→AST→wasm pipeline being callable outside the
LSP (today `toWasm` only runs inside `server.ts`).*

- ✅ **C1. Extract a headless `compile(source) → { wasm, diagnostics }`** entry point,
  decoupled from the LSP. Done — `compiler/compile.ts` is the single source of truth shared
  by the LSP, `tests/run.ts`, and (future) CLI + browser.
- 🟡 **C2. `vl run <file>`** — compile + instantiate + execute, wiring the `log` import
  (host stdout). **DONE (MVP):** `compiler/cli.ts` + `deno task run` runs a file, an inline
  snippet (`-e "…"`), or stdin — prints diagnostics to stderr, `print`/`log` output to stdout,
  non-zero exit on errors. The VS Code extension's **Run Current File** command (Ctrl+F5) shells
  out to it in a terminal (runs the live buffer via a temp file when unsaved). REMAINING: a real
  `vl`/`vital` binary (C5) rather than `deno task run`.
- ⬜ **C3. `vl build <file> -o out.wasm`** — emit `.wasm` (and optional `.wat`).
- ⬜ **C4. `vl check <file>`** — diagnostics only, exit code for CI.
- ⬜ **C5. Decide CLI runtime/distribution** — Deno (`deno compile` for a binary) vs Node.
  Affects packaging.

---

## Track D — LSP / editor experience (`server.ts`)
*Mostly independent; benefits from Track A.*

- ✅ **D0. Diagnostics** (parse + type errors) on change.
- ⬜ **D1. Hover types.** `stringifyType` already exists — surface it on hover.
- ⬜ **D2. Go-to-definition / find-references** (needs symbol→source-range tracking;
  AST nodes currently drop most ctx).
- ⬜ **D3. Autocomplete** (scope-aware; structural members).
- ⬜ **D4. Formatter** (+ `vl fmt` in the CLI).
- ⬜ **D5. Semantic tokens** (richer than the TextMate `syntaxes/vital.tmLanguage.json`).
- ⬜ **D6. Inlay hints** for inferred types — *the* feature for a "types are hidden" language.

---

## Track E — Browser playground + sandbox
*Depends on C1 (headless compile). The compiler is pure TS + Binaryen (WASM), so it can
run client-side.*

- ⬜ **E1. Bundle the compiler for the browser** (esbuild target browser; Binaryen runs in
  wasm already).
- ⬜ **E2. Playground UI** — editor (Monaco) + output pane. Reuse the LSP via
  `monaco-languageclient` or run diagnostics inline.
- ⬜ **E3. Sandboxed execution.** Run compiled user wasm in a **Web Worker** with a fresh
  `WebAssembly.Memory`, no host imports except a controlled `log`; enforce limits
  (memory cap, timeout, no network/DOM). The wasm sandbox + worker isolation is the
  security boundary.
- ⬜ **E4. Shareable links** (encode source in URL / gist).

---

## Track G — Replace antlr4 with a hand-written parser
*Goal: drop the antlr4 dependency. Independent; safe to do incrementally because
the `.vl` test corpus is parser-agnostic and `compile()` isolates the parser.*

Why drop it:
- **Heavyweight non-JS build step.** Regenerating the parser (`deno task gen`)
  needs Java + Gradle + the antlr4 gradle plugin — bolted onto a Deno/TS project.
  Every new syntax feature (e.g. the `is` operator) requires a regen.
- **Large committed generated code that drifts.** `VL_Parser.ts`/`VL_Lexer.ts`
  are committed in two places and copied around; they've already drifted (the
  dead interpreter test, a stray `override` type error in the generated parser).
- **Awkward CST→AST layer.** Half of `toAST.ts` is spelunking the untyped parse
  tree (`ctx.expr(0)`, `ctx.LBRACK()`, null-checks). Precedence is encoded as
  ordered `expr` alternatives; newline handling is `NEWLINE*` sprinkled everywhere.
- **Bootstrap blocker.** A Java-toolchain-generated parser can never be part of a
  self-hosted VL compiler. A hand-written one is a stepping stone toward it.

- ⬜ **G1. Hand-written lexer.** The lexer is already essentially a token list
  (`VL_Lexer.g4`); reimplement directly in TS. Cleaner significant-newline
  handling than `NEWLINE*` everywhere.
- ⬜ **G2. Recursive-descent statements + Pratt/precedence-climbing expressions.**
  Pratt handles the operator-precedence cascade elegantly. **Emit the typed AST
  (`VLExpression`/`VLStatement`) directly**, collapsing the CST→AST translation
  out of `toAST.ts` (the type-checking half stays). Full control over error
  messages and incremental parsing; no build step, no generated blob.
- ⬜ **G3. Keep `.g4` (or an EBNF doc) as the human-readable grammar spec.**
- ⬜ **G4. Delete antlr4 deps, the gradle project, generated dirs, and the
  `gen` task.** The `.vl` corpus validates behavior across the swap.
- Alternatives considered: a pure-JS PEG generator (peggy) drops Java but keeps a
  generic tree + a dep; parser combinators similar. Hand-written wins on errors
  and bootstrappability for a grammar this small.

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ✅ **F1. Test harness for the wasm path.** `deno task test` runs `tests/run.ts` over a
  black-box `.vl` corpus with `// @directive` expectations. (`reference/ts-interpreter`
  was the only prior test; excluded via `deno.json`.)
- ⬜ **F2. Strip / gate debug `console.log`s** in `toWasm.ts` (getFunction, "???",
  emitText dumps) behind a debug flag.
- ✅ **F3. Retired `ts-interpreter/` → `reference/ts-interpreter/`** (stale tree-walking
  backend; kept for reference, excluded from tests/lint).
- ⬜ **F4. Re-enable inline `m.validate()`** during dev (currently only the final validate
  runs) for earlier failure.
- ⬜ **F5. Settle the name** (VL vs Vital vs Vital Language) and apply consistently.
- ⬜ **F6. Document grammar regen** (`deno task gen`, needs gradle + the antlr4 project)
  and the build (`deno task build`).
- ⬜ **F7. Fix the `paramater` misspelling** project-wide (optional; currently consistent).
- ✅ **F8. Dropped `patches/binaryen+116.0.0.patch` + `patch-package`.** The LSP server
  now builds as **ESM** (`dist/server.mjs`, `--format=esm`); the client stays CJS
  (`dist/extension.js`). binaryen's top-level await is legal in ESM, so no patch is
  needed. Cleared all 9 `npm audit` advisories (77→13 packages). Verified headlessly:
  esbuild-bundled unpatched binaryen compiles + runs a VL program under Node. **Still to
  confirm in VS Code (F5):** vscode-languageclient forking an ESM server over IPC.

---

## Suggested first moves (highest leverage, lowest risk, mostly independent)
1. ✅ **C1** — headless `compile()`. Done: unblocked the CLI, the browser, *and* the
   `tests/run.ts` corpus.
2. **B3** — finish indirect calls (in flight) to unblock closures (B4).
3. **A6 + A5** — `is` operator + flow narrowing. The set-theoretic payoff for a fully-typed
   language: structural guards that refine types along control flow (needs A3/A4 first).
