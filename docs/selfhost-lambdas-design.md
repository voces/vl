# Self-host lambdas / closures + array HOFs (`.map`/`.filter`) — measured design

Status: design + feasibility analysis. No emit code changed — the first real slice
(non-capturing lambdas + a function-table/`call_ref` ABI) is **not** provably
byte-golden-safe in one pass, and the highest-value cheaper shortcut (desugaring
`.map`/`.filter` to a loop) is blocked by the WasmGC closure ABI the rest of the
emitter does not yet have. See §3 (crux) and §7 (why no prototype landed).

Branch: `selfhost-lambdas-design` off `origin/master` (`dad9804`).

Every count and claim below was grepped/driven out of the tree on this branch, not
estimated. The native self-host tool (`scripts/vl-host/target/release/vl`, cargo
release) + seed (`build/vl-compiler.wasm`, `deno run -A scripts/build-compiler-wasm.ts`)
were used to drive each corpus file and capture exact stage + message.

---

## 0. Headline (read this first)

The big surprise vs the task's framing: **the self-host front end already does the
hard parts.** `(x) => …` arrow syntax does **not** exist in VL — the surface is an
**anonymous `function` literal** (`xs.map(function(n: i32) n * 2)`). And:

- **Parser** already parses anonymous function expressions (`parseFuncExpr`,
  `parser.vl:715`) into an anonymous `FuncDecl` node (name `""`), and parses `.map`/
  `.filter` as ordinary `Member`-callee `Call`s. **No parser work is needed.**
- **Typechecker** already has a first-class function type (`TyFunc`,
  `typecheck.vl:101`), checks anonymous function literals, and **fully type-checks
  `.map`/`.filter`** including "map's result element type is the callback's return"
  and "filter's predicate must yield bool" (`typecheck.vl:1415–1442`). **No checker
  work is needed for the annotated-callback corpus.**
- The **entire gap is in `wasmEmit.vl`**: it resolves every call by *name*
  (`fnIndexOf`) and has no funcref / closure / function-table machinery at all.

So this is a pure **emitter** feature, not a parse/type feature — the opposite of the
numeric-types work (which was checker-light, emit-heavy in a different place). The two
genuine non-emit gaps are narrow: (a) contextual param inference for *un-annotated*
callbacks (`map-filter-inferred-callbacks.vl`), and (b) one diagnostic-text mismatch.

`.forEach` **does not exist anywhere** — not in the host TS compiler, not in the
corpus (grep: zero `.forEach(` call sites, zero `"forEach"` handlers in `typecheck.ts`
/`toWasm.ts`). VL iterates with `for x in xs`. It is included below only as a trivial
"map without a result array" variant if ever wanted; there is nothing to unblock.

---

## 1. Current state (verified by driving each file)

Driven with `vl run <f> --compiler build/vl-compiler.wasm` (native self-host) and, as a
control, `deno task run run <f>` (host TS). The host TS compiler runs **all** of these
correctly; the self-host fails every one at **emit**, never at parse, and (with one
exception) never at type-check.

| Corpus file | self-host `check` | self-host `run` (emit) | host TS |
|---|---|---|---|
| `functions/lambda.vl` | **ok** | `emitProgram: unsupported expression in return` | `3` / `15` ✓ |
| `functions/closure.vl` | **ok** | `emitProgram: unsupported statement in body` | `15`/`110`/`13` ✓ |
| `functions/escaping.vl` | **ok** | `emitProgram: ref valtype with no interned shape` | `15`/`110`/`17` ✓ |
| `arrays/map-filter.vl` | **ok** | `emitProgram: callee is not a function name` | ✓ |
| `arrays/map-filter-f64.vl` | **ok** | `emitProgram: callee is not a function name` | ✓ |
| `arrays/map-filter-inferred-callbacks.vl` | **type error** (param infer) | (same) | ✓ |
| `lists/struct-pop-get-map.vl` | **ok** | `emitProgram: callee is not a function name` | ✓ |
| `types/nullable-list-index.vl` | **type error** (`T[]?`, orthogonal) | (same) | ✓ |
| `functions/lambda-uninferable-param.vl` | **rejects** (an `@error` test — correct verdict, wrong text) | n/a | n/a |

Reading the failures precisely:

- `functions/lambda.vl` (`const add = function(a,b) a+b`; `f(10)` inside `make`):
  parses + checks fine. Emit dies in the **return/tail-expression** path
  (`wasmEmit.vl:5643 "unsupported expression in return"`) because the tail of `make`
  is `f(10)` where `f` is a **let-bound function value**, not a named function — the
  emitter's `fnIndexOf` lookup has nothing to resolve. The bare-expression body of
  the anonymous `function(a,b) a + b` is itself a tail expression with no return path.
- `functions/closure.vl` (nested `function add(x) x + n` inside `makeAdder`):
  dies at `wasmEmit.vl:7364 "unsupported statement in body"` — a **nested `FuncDecl`
  inside a function body** is not handled. `collectFns` (`wasmEmit.vl:1337`) scans only
  **top-level** statements, so nested functions are never lifted/collected.
- `functions/escaping.vl` (returns the closure as a value, stores it in a field):
  dies at `wasmEmit.vl:8596 "ref valtype with no interned shape"` — a **function value
  needs a heap type** (the closure struct) that is never interned.
- `arrays/map-filter*.vl`, `lists/struct-pop-get-map.vl`: dies at `wasmEmit.vl:6288
  "callee is not a function name"` — a `Member` callee (`xs.map`) reaching the scalar
  call emitter has no name to look up. (`.push`/`.pop` are special-cased upstream;
  `.map`/`.filter` are not.)
- `arrays/map-filter-inferred-callbacks.vl`: the ONE checker gap —
  `function(n) n * 2` with no annotation needs contextual param inference
  (the receiver `i32[]` should pin `n: i32`). Host TS does this; self-host
  `typecheck.vl` does not, so it emits `parameter needs a type annotation`.
- `types/nullable-list-index.vl`: a `T[]?` (nullable-array) narrowing gap that has
  **nothing to do with lambdas** — listed only so it isn't mis-attributed.

### Corpus tally (the unblock surface)
- `@run` files using a lambda-as-value or a HOF callback: **5** core
  (`functions/lambda.vl`, `closure.vl`, `escaping.vl`, `arrays/map-filter.vl`,
  `map-filter-f64.vl`, `map-filter-inferred-callbacks.vl`) + 2 that use `.map`
  incidentally (`lists/struct-pop-get-map.vl`, `types/nullable-list-index.vl`).
- Verdict/`@error` files in the lambda area: **1** (`lambda-uninferable-param.vl`,
  already correctly rejected — only the message text differs).
- Project-wide, the self-host corpus-run test records the bucket explicitly
  (`tests/selfhost_corpus_run_test.ts:26`): of **304 `@run` files**, **70 are emit
  gaps**, and that bucket is labelled "**lambdas/for-in/…**" — lambdas are the named
  lead. So lambdas are the keystone the task describes: closing the emit gap here is
  the single largest emit-coverage lever, and it also unblocks the deferred param-skip
  ergonomics (`docs/lambda-param-skip-design.md`, whose Prerequisite 1 is *exactly*
  "self-host lambdas/HOFs don't exist yet").

---

## 2. Host model (reference; `.ts`)

How `compiler/parser.ts` / `typecheck.ts` / `toWasm.ts` represent and lower lambdas.

### 2.1 AST + type
- A function literal is a `VLFunctionDeclarationNode` with an optional `name`
  (anonymous ⇒ `name` undefined). The self-host AST mirrors this exactly: one
  `FuncDecl` variant, `fnName == ""` for anonymous (`ast.vl:90`).
- The function **type** is first-class (`TyFunc { fnParamTypes, fnRet }` self-host;
  the host's `vlType(node)` of a function). Both sides already carry it.

### 2.2 The closure ABI (this is the part to copy)
The host's function-value representation (`toWasm.ts:585–642`):

- **One uniform "fat pointer" struct** for *every* function value, capturing or not:
  ```
  closureStruct = struct { i32 tableIndex ; structref env }   (both immutable)
  ```
  (`toWasm.ts:591–608`.) Making every function value the same heap type lets two
  closures of the same signature be interchangeable and lets one escape (be stored /
  returned / passed) carrying its environment.
- **Every callee takes a hidden leading `structref env` parameter.** A non-capturing
  function ignores it; its closure value carries `ref.null structref` as the env
  (`nullEnv()`, `toWasm.ts:610`).
- A **capturing** function gets an **environment struct** — one immutable field per
  captured value, in capture order (`EnvShape`, `toWasm.ts:549–625`). The closure
  value is `struct.new closureStruct [ i32.const tableIndex , struct.new env [...] ]`
  (`closureValue`, `toWasm.ts:631–642`). Inside the body each captured name reads
  `struct.get` on the env (the `Name` case routes captures through the env;
  `toWasm.ts:459–485`).
- **Invocation is `call_indirect` through a function table.** `indirectCall`
  (`toWasm.ts:2680–2712`) reads `tableIndex` and `env` out of the fat pointer, then
  `m.call_indirect("table", idx, [env, ...operands], (structref, params...) -> ret)`.
  Every function used as a value is laid out in a wasm **table** (`toWasm.ts:5931`)
  with the env-leading signature so `call_indirect` can dispatch on the i32 index.

### 2.3 `.map` / `.filter` lowering (host)
`lowerMapMethodCall` (`toWasm.ts:2143–2245`) lowers **inline to a wasm loop** — there
is no library `map`/`filter` function. But the callback is **not inlined**; it is built
as a closure value and invoked per element via `indirectCall(clo, ...)`:
```
map:    n = len(src); back = array.new_default(outElemArr, n)
        for i in 0..n:  back[i] = indirectCall(clo, [elem(i)])     // call_indirect
        return listWrapper{ back, n, n }
filter: n = len(src); back = array.new_default(elemArr, n); j = 0
        for i in 0..n:  if indirectCall(clo, [elem(i)]): back[j++] = elem(i)
        return listWrapper{ back, j, n }                            // len=j, cap=n
```
(`toWasm.ts:2181–2244`.) So even the loop form depends on the fat-pointer + table ABI —
**there is no first-class-funcref-free shortcut in the host.** (See §3 for whether the
*self-host* can take one.)

---

## 3. THE CRUX — closure representation in WasmGC, and the desugar shortcut

### 3.1 Two cases, exactly as the task frames them
1. **Non-capturing lambda** (`function(n: i32) n * 2`, `xs.map(function(n) n>2)`): no
   free variables. Representable as a plain `(ref func)` / a fixed table entry. No heap
   env needed; the env slot is `null`.
2. **Capturing closure** (`function add(x) x + n` capturing `n`): needs a heap
   **environment struct** of the captured values plus the code reference, invoked via
   `call_ref` / `call_indirect`.

**Capture analysis** to tell them apart is small and the checker already has the scope
machinery: for a function literal, collect the set of identifiers referenced in its
body that resolve to a binding **outside** the lambda's own params/locals but **inside**
an enclosing function frame (module globals and other top-level functions are NOT
captures — they're addressable directly). Empty set ⇒ case 1; non-empty ⇒ case 2. The
host does precisely this with `captureCollector` while compiling the body
(`toWasm.ts:558–625`).

### 3.2 Recommended representation: `call_ref` + a typed-funcref closure struct (NOT a table)

The host uses `call_indirect` + a **table** + an **elem section** because binaryen makes
tables cheap. The self-host emitter has **no table section and no elem section today**
(grep: the only `section 9`/table mention is a comment; the only `wU8(4)` is the `if`
opcode). Adding a table + elem segment is net-new section machinery.

**The cleaner self-host representation is a typed funcref + `call_ref`:**
```
closure struct  =  struct { (ref $fnsig) code ; structref env }     // immutable
```
- `code` is a **typed function reference** (`(ref $fnsig)`), produced by `ref.func`
  (`0xd2 <funcidx>`), not an i32 table index. `$fnsig` is the env-leading functype
  `(structref, params...) -> ret`, interned in the rec group exactly like the existing
  user functypes.
- Invocation is `call_ref $fnsig` (`0x14 <typeidx>`): push `env`, push operands, push
  the `code` funcref, `call_ref`. **No table, no elem section, no `call_indirect`** —
  `call_ref` reads the typed funcref directly off the struct.
- `ref.func` requires the referenced function to be **declared as referenceable**.
  With no table/elem segment, wasm requires a **declarative element segment**
  (`elem declare func i …`) listing every `ref.func` target — a small `0x09` section
  with form `0x03` (declarative). This is the *one* new section the funcref path needs,
  and it is far smaller/simpler than an active table + its bounds.

Why `call_ref` over the host's `call_indirect`+table:
- **No table/elem-active machinery** (the emitter has none; tables also force a min/max
  size the emitter would have to compute).
- **`call_ref` is structurally typed** on `$fnsig`, which slots into the existing rec
  group + functype interning with no new index space beyond one functype per distinct
  callee signature (most lambdas share `(structref, i32) -> i32`).
- Goldens are unaffected: see §3.4.

A non-capturing lambda uses the **same** struct with `env = ref.null structref`; the
callee ignores its leading env param. This keeps "every function value is one heap
type" (the host's interchangeability win) without a table.

### 3.3 The desugar-to-loop shortcut for `.map`/`.filter` — assessed, and it is BLOCKED
The task asks whether step (3) — `.map`/`.filter` desugared to a loop with an **inline**
lambda body — is a small self-contained win needing no first-class closures.

**Verdict: not as a shortcut around closures, for two concrete reasons.**

1. **The callback is a separate `function` literal node, not an inline body at the call
   site.** `xs.map(function(n: i32) n*2)` is a `Call` whose one arg is a `FuncDecl`. To
   "inline the body" the emitter would have to: bind the lambda's single param to the
   per-element value, then emit the lambda's body as the loop body's element expression.
   That is doable for a **non-capturing, single-expression-body** lambda (substitute
   `n → src[i]`), and it would unblock `arrays/map-filter.vl` and `map-filter-f64.vl`
   **without** any funcref/table/closure-struct machinery — a genuine self-contained
   win **for that subset**. So the shortcut is real but **narrow**: it only covers
   non-capturing, inline-`function`-literal callbacks.
2. **It does NOT generalize, and the corpus immediately needs the general case.** The
   same `map-filter.vl` file ends with `base.filter(...).map(inc)` where `inc` is a
   **named function**, not a literal — there is no body to inline; you need a real call
   to `inc`. And `equality-function-field.vl` / `escaping.vl` need function **values**
   regardless. So the inline-desugar makes *some* `@log` lines pass but cannot make the
   whole file pass; the file stays red until the funcref path exists.

**So:** the inline-desugar is a legitimate **optional micro-slice** (Slice 3a below)
that emits non-capturing single-expression callbacks with zero new ABI, but it is a
*head start on* the map/filter loop, not a replacement for closures. It is **not landed
in this pass** because (a) it only partially passes its target files (the named-callback
tails stay red), so it doesn't flip a single corpus verdict green on its own, and (b) it
risks a subtle wasm-validity bug (the substituted body must be emitted with the loop's
`i`/backing locals already allocated and the element value materialized exactly once for
filter, which re-reads `elem(i)` — host does this carefully at `toWasm.ts:2231–2233`).
A partial win that turns no file green and adds a substitution path is not worth the
gate exposure ahead of the real ABI.

### 3.4 Goldens / fixpoint interaction (why this is gate-safe to *build*)
- **No golden program uses a lambda, a function value, or `.map`/`.filter`** (the 14
  fixpoint goldens are i32/ref/struct programs; the self-host compiler's *own source*
  uses named functions and `for…in`, never a function value or HOF). So as long as the
  new closure-struct type, the `$fnsig` functypes, the declarative elem section, and the
  `ref.func`/`call_ref`/env-leading-param machinery are **only reached when a program
  actually contains a function value or a `.map`/`.filter`**, every existing golden
  emits **byte-identical** bytes and the full-fixpoint (compiler compiling itself) is
  unchanged.
- The one real index hazard: new heap types (closure struct + `$fnsig`s) must be
  **minted by `mAssignTypeIndices` AFTER all existing types** (`wasmEmit.vl:9310`,
  which still asserts the old offset formulas as a drift oracle). If a program uses no
  function value, `mAssignTypeIndices` must mint **zero** new types so `typeOffset` and
  every downstream index are unmoved. This is the same discipline the numeric slices
  used ("only fires for non-i32 user types"): here it's "only fires for programs with a
  function value."
- The declarative elem section (id 9) is emitted **only when** ≥1 `ref.func` exists, so
  the print-free goldens (which emit no section 9) and the import-bearing ones stay
  byte-identical — exactly as `nPrintTypes == 0` keeps the type-section rectype count at
  1 today (`wasmEmit.vl:9340–9345`).

---

## 4. Measured touch-point inventory (`wasmEmit.vl`, grep counts on this branch)

The whole feature is emitter-side. Parser: **0**. Checker: **0** for annotated
callbacks (only Slice 5's contextual inference + one diagnostic string touch it).

| Touch point | Sites | What changes |
|---|---|---|
| `collectFns` / `fnStmts` (function collection) | **49 refs**, 1 collector (`wasmEmit.vl:1337`) | today scans **top-level only**; must also **lift nested `FuncDecl`s** (closures) and **anonymous literals** in expr position into the flat function list with synthesized names + an env-leading param |
| `fnIndexOf` name-based call resolution | **8** | each is a "resolve callee by name"; a `Call` whose callee is a **let-bound value / member / anon literal** has no name — these sites need a funcref-value fallback (`call_ref`) |
| `callee is Ident` dispatch arms (per return-kind) | **19** | the scalar/ref/i64/f32/f64/array call paths each assume an `Ident` callee; a **function-value call** (`f(10)`) is a new callee shape across all of them |
| `exprIsX` return-kind classifiers special-casing `Call` by name | **21** | (`exprIsI64`/`exprIsF32`/… each read `fRet*[fnIndexOf(name)]`); a `call_ref` result type must be read from the value's `TyFunc`, not a name table |
| `callee is Member` method dispatch blocks | **16** | `.push`/`.pop`/`.get`/map-set live here; **`.map`/`.filter` are new `memProp ==` arms** beside them |
| `memProp == "push"`/`"pop"` array-method templates | **7** | the **template to copy** for the `.map`/`.filter` loop emit (pre-size backing, loop, `array.set`, build wrapper) |
| `fbValtype` / `pushVT` valtype dispatch | **43** | needs **one new kind code** for the closure-ref valtype `(ref $closure)` (param/local/result/field), mirroring how string/list/ref-array kinds were threaded |
| Rec group / type interning (`mAssignTypeIndices`, `wasmEmit.vl:9310`) | 1 central minter | intern the **closure struct** + one **`$fnsig`** per distinct env-leading callee signature, AFTER existing types, only when used |
| Type/function/code section layout | `emitModule` (`wasmEmit.vl:9281+`) | new: **declarative elem section (id 9)** listing `ref.func` targets, emitted only when ≥1 exists; every callee gains a **leading `structref` param** in its functype + code |
| New opcodes | n/a (none today) | `ref.func 0xd2`, `call_ref 0x14`, `struct.new`/`struct.get` (already emitted for objects), `ref.null 0xd0` (already emitted) |

**Headline count:** ~**8 + 19 + 21 + 16 = 64 call-path/classifier sites** ride the
"callee resolved by name" assumption and gain a function-value arm; **43** valtype-
dispatch sites gain one closure-ref kind; plus the **1** central type-interner, the
**1** function-collector (made recursive + anon-aware), and the **2** new section bits
(env-leading functype param, declarative elem section). The single biggest lever is the
same as numeric's: **one new valtype kind + one new interned type, threaded once**, then
every call path learns the `call_ref` arm. Unlike numeric, there is **no front-end work**
beyond Slice 5.

---

## 5. Sliced rollout (ordered by value/risk)

Each slice is a self-contained PR with its own gates. Order builds the shared
closure-ABI once on the lowest-risk shape, then layers HOFs and captures.

### Slice 1 — non-capturing lambdas as function VALUES (`call_ref` ABI, the foundation)
Build the shared machinery on the easy case (no env):
- recursively collect nested + anonymous `FuncDecl`s into the flat function list
  (`collectFns` → recurse bodies; synthesize names for `fnName == ""`);
- give **every** callee a leading `structref env` param in its functype + code
  (non-capturing callees ignore it);
- intern the **closure struct** `{ (ref $fnsig) code ; structref env }` + one `$fnsig`
  per distinct signature, AFTER existing types, only when a function value exists;
- emit a function VALUE as `struct.new closure [ ref.func $f , ref.null structref ]`
  (with `elem declare func $f`);
- emit a function-value CALL `f(args)` as `call_ref $fnsig` over the struct's fields;
- one new `fbValtype`/`pushVT` kind for `(ref $closure)`.
- **Unblocks:** `functions/lambda.vl` (let-bound function value, called directly).
- **Gate-risk:** *medium* — the central risk is the **declarative elem section** and
  the **env-leading functype param** landing only for function-value programs; if a
  no-lambda program mints zero new types and emits no section 9, all goldens + full
  fixpoint stay byte-identical. The `mAssignTypeIndices` drift-assert is the safety net.

### Slice 2 — capturing closures (the heap-env slice)
- capture analysis (free vars resolving to an enclosing frame; globals/top-level funcs
  excluded);
- per-capturing-lambda **env struct** of captured values (immutable fields, capture
  order), interned beside the closure struct;
- closure value = `struct.new closure [ ref.func $f , struct.new $env [captures...] ]`;
- inside the body, each captured name reads `struct.get $env` off the leading env param.
- **Unblocks:** `functions/closure.vl`, `functions/escaping.vl` (escape is free — the
  fat pointer already carries the env, so returning/storing it Just Works),
  `objects/equality-function-field.vl`.
- **Gate-risk:** *medium* — reuses Slice 1's ABI; the new surface is env layout +
  capture resolution. Still only fires for capturing programs ⇒ goldens unmoved.

### Slice 3 — `.map` / `.filter` over arrays (the HOF loop)
- new `memProp == "map"` / `"filter"` arms beside `.push`/`.pop` (`wasmEmit.vl:~6992`);
- emit the host's inline loop (`toWasm.ts:2181–2244`): build the callback's closure
  value once, pre-size the backing, loop, `call_ref` the closure per element, build the
  result list wrapper; `filter` writes survivors compactly with `len=j, cap=n`.
- **Slice 3a (optional micro-shortcut, §3.3):** for a **non-capturing, single-
  expression** inline `function` callback, substitute `param → src[i]` and inline the
  body — skips the closure alloc for that one common case. Head start, not a replacement.
- **Unblocks:** `arrays/map-filter.vl`, `lists/struct-pop-get-map.vl` (the `.map`
  half), and — once the i32-element loop works — the f64/i64 element loop is the same
  with the per-element backing type swapped.
- **Gate-risk:** *medium* — pure additive method arm; the loop is well-specified by the
  host. Only fires on `.map`/`.filter` call sites.

### Slice 4 — `.map`/`.filter` over `f64[]`/`i64[]` (per-element backing)
- monomorphize the Slice-3 loop over the element's backing array heap type (i64/f64
  arrays already landed via the numeric slices — reuse those backing types).
- **Unblocks:** `arrays/map-filter-f64.vl`.
- **Gate-risk:** *low* — element-type parameterization of an existing loop.

### Slice 5 — contextual callback-param inference + the param-skip ergonomics
- **Checker:** infer an un-annotated callback param's type from the expected callback
  type at the call site (`function(n) …` over `i32[]` ⇒ `n: i32`); host TS already does
  this. Also align the diagnostic text so `lambda-uninferable-param.vl` matches
  `cannot infer a type for parameter \`n\``.
- **Then** the param-skip ergonomics (`docs/lambda-param-skip-design.md`) become
  buildable — Prerequisite 1 (lambdas/HOFs) is satisfied by Slices 1–4, Prerequisite 2
  (param names in function types) is a small `TyFunc` extension.
- **Unblocks:** `arrays/map-filter-inferred-callbacks.vl`, and the deferred param-skip
  design entirely.
- **Gate-risk:** *low* on emit (checker-only); the diagnostic-text change touches one
  verdict file.

**Why this order:** Slice 1 builds the one shared ABI (closure struct + `$fnsig` +
`call_ref` + declarative elem) on the no-env case, which is the highest-risk *new*
section/index work but on the simplest value. Slice 2 adds the env with the ABI proven.
Slice 3 layers HOFs on top (and is where most corpus value lands). Slices 4–5 are
parameterization + the front-end inference that the param-skip design waits on.

---

## 6. Per-slice gate-risk summary

Gates (all must stay green; never regenerate goldens):
`selfhost_emit_fixpoint_test.ts` (byte-identical, FIRST) → `SELFHOST_FULL_FIXPOINT=1`
→ `scripts/native-fixpoint.sh` → `selfhost_corpus_run_test.ts` +
`SELFHOST_NATIVE_ALIGN=1 selfhost_native_align_test.ts` → `deno task test` + `deno lint`.

| Slice | Golden byte-risk | Fixpoint risk | Notes |
|---|---|---|---|
| 1 (non-cap value, `call_ref` ABI) | **low IF** zero new types + no section 9 for no-lambda programs | low (compiler source uses no function value) | the central discipline; `mAssignTypeIndices` drift-assert guards it |
| 2 (capturing env) | low (only capturing programs mint an env) | low | reuses Slice 1 ABI |
| 3 (map/filter loop) | low (only `.map`/`.filter` sites) | low | additive method arm |
| 3a (inline desugar) | low | low | but turns **no file** fully green alone — not worth it ahead of 1–3 |
| 4 (f64/i64 element) | low | low | element-type swap |
| 5 (param infer + text) | **none on emit** (checker-only) | none | one diagnostic file's text changes |

The invariant that makes every row safe is the same as the numeric work: **the
self-host compiler's own source contains no function value and no HOF**, so as long as
the new closure/`$fnsig`/`call_ref`/elem machinery is reachable **only** for programs
that actually use a function value or `.map`/`.filter`, the full-fixpoint output and all
14 goldens are byte-unchanged.

---

## 7. Why no prototype landed in this pass

- The first **real** slice (Slice 1) is **not** a sub-500-line, single-pass,
  provably-byte-golden change: it introduces a **new wasm section** (declarative elem,
  id 9), a **new interned heap type** (the closure struct) plus per-signature
  functypes, **a leading `structref` param on every callee's functype + code**, and the
  `ref.func`/`call_ref` opcodes — across the ~64 call-path sites and 43 valtype sites
  in §4. Each must be provably inert for no-lambda programs (zero new types, no section
  9) to keep the goldens and full fixpoint byte-identical. That is a careful,
  multi-touch emitter change whose dominant failure mode (an accidental type-index
  shift, or section 9 emitted unconditionally) is exactly what the byte-identical gate
  forbids — too large and too coupled for one safe pass.
- The cheap shortcut (Slice 3a inline-desugar) is genuinely small **but turns no corpus
  file fully green by itself** (§3.3): `map-filter.vl` ends with a named-callback
  `.map(inc)` that needs a real call, and `escaping`/`equality-function-field` need
  function values regardless. A partial win that flips no verdict, while adding a
  param-substitution path with its own re-evaluation hazard, is not worth the gate
  exposure ahead of the real ABI.

A thorough measured design with no implementation is, per the task framing, the correct
outcome: the parser and checker already do their parts, the entire remaining work is a
coherent emitter ABI (closure struct + `$fnsig` + `call_ref` + declarative elem +
env-leading param), and that ABI is the unit of risk — it should land as Slice 1 in its
own gated PR, not be half-built behind a partial shortcut.

---

## 8. Merge sequencing / in-flight overlap
The numeric slices (i64/f32/f64, per `docs/selfhost-numeric-types-design.md`) have
**already landed** on `origin/master` (the `fRetI64`/`fRetF32`/`fRetF64` tables and
`exprIsF32`/`exprIsF64` classifiers are present) — Slice 4 here (`f64[]`/`i64[]`
element HOFs) builds directly on their array-backing heap types. The only high-traffic
shared area is the `fbValtype`/`pushVT` valtype dispatch (§4, 43 sites) and
`mAssignTypeIndices` (the type interner); any concurrent emitter PR touching either
should be sequenced before/after Slice 1, since both add one kind / one interned type.
