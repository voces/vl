# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive &
structural**, **fully type-safe** (statically sound — no untyped code; inference holes resolve to
concrete types), compiling to **lean WebAssembly**. Deliverables: an **LSP-backed VS Code extension**
(partial), a **CLI** (`deno task run`/`build`/`check`; native binary TBD), and an **in-browser
playground** (missing).

Status: ✅ done · 🟡 partial · ⬜ not started.

**Repo layout:** `compiler/` — the language core (compile, toAST, typecheck, toWasm, defaultScope) ·
`lsp/` — the VS Code extension + LSP server over the core · `grammar/` — the `.g4` spec (reference
only; the parser is hand-written) · `samples/` · `tests/` — `.vl` corpus + runner · `docs/` ·
`reference/` — retired ts-interpreter. Tracks are **independent** unless a dependency is called out.

> **Maintaining this file.** The roadmap is *forward-looking* — what to do, why, dependencies, what's
> remaining. It is **not** a changelog. Rule of thumb:
> - *Helps decide what to do next?* → here.
> - *Why we chose something non-obvious?* → `DECISIONS.md`.
> - *How an already-done thing works?* → the code + git history, or a `docs/<subsystem>.md` explainer
>   only where the mental model aids future work (`docs/unions.md`, `docs/narrowing.md`).
>
> Done items collapse to a one-line breadcrumb. Don't paste implementation narrative here. (Agents:
> on finishing, set the item to a one-line done marker; put rationale in `DECISIONS.md`.)

---

## Track A — Type system (`typecheck.ts`)
*Blueprint: Elixir v1.20 set-theoretic types, fully-typed (no gradual escape hatch).*

- ✅ **A0. Type-algebra inventory.** `Alias`, `Function`, `Object` (structural + index sigs), literal
  types, `Union`, `Nullable`, `Intersection`, `Negation`, `Unknown`/`Infer` (resolving holes),
  `Never`, `Type`, `Custom`.
- 🟡 **A3. Intersection types** (`A & B`). Done: narrowing algebra (`intersectType`; → `docs/narrowing.md`)
  + **surface syntax `A & B`** (parses, binds tighter than `|`, folds through `intersectType` at parse
  time). REMAINING: object-type structural intersection (`{x} & {y}` merge — needs `intersectType`/`meet`
  extension; today distinct objects meet to `Never`).
- 🟡 **A4. Negation types** (`!A`). Done: narrowing algebra (`subtractType`) + **surface syntax `!A`** and
  the negated type-guard **`x !is T`** (Kotlin-style; mirrors `is` narrowing inverted; → `DECISIONS.md`).
  REMAINING: full open-world negation tracking (needs A12).
- 🟡 **A5. Flow narrowing.** Done broadly — nullness, union-member (then `A` / else `U − A`),
  post-guard guard-clauses, `&&`/`||` chains (short-circuit, multi-place, De Morgan), else-of-else-if
  chaining, literal discrimination, `?.`/`??`. See **`docs/narrowing.md`**. REMAINING: `case`/multi-
  guard (no grammar); stored-witness (A6b Stage B); optional *call* `x?.f()` + chain short-circuit
  `x?.y.z` (use `x?.y?.z`); per-call reachability-pruned return types (blocked on memoize-with-holes —
  see `docs/narrowing.md`).
- 🟢 **A6. `is` operator + tagged unions.** Done — `x is T` discriminates an arbitrary value union at
  runtime (niche / value-kind / boxed encodings, global tag registry, `coerceUnion` at boundaries).
  See **`docs/unions.md`**. REMAINING: `ref.test` fast-path for ref-vs-ref; union arrays
  (`[boolean | i32]`); declared type-guard signatures (A6b Stage A).
- 🟡 **A6b. Proof-carrying narrowing (type guards as values).** Narrowing as a fact carried by a
  return value; discriminating the (possibly stored) witness refines the input that produced it. Done
  (degenerate, immediately-consumed): a body that is exactly `return <predicate-on-a-param>` is an
  inferred guard — `if present(v) { v.x }`, and the guard-clause `if absent(v) { return }`.
  REMAINING — **Stage A:** richer discriminants (`if bar(x) is null`), multi-input correlation,
  declared (verified) predicate signatures. **Stage B:** the *stored witness* (`const f = bar(x); …
  if f is null` narrows x) — needs binding tracking + invalidation (a lightweight borrow). Stage B
  also subsumes per-call tight return types (the forward direction of the same correlation).
- 🟡 **A7. Real `string` type.** Done (core): a proper Object (`{[i32]: i32}` index sig → i32-array of
  char codes, `.length`/`s[i]`/`+`/`==`/`slice`/`indexOf`/`includes`/`charCodeAt`). REMAINING:
  `boolean`-where-`i32`-expected coercion. (UTF-16 backing is B7.)
- ⬜ **A8. Exact / Inexact variance.** Params Inexact by default (accept excess properties), values
  Exact. Guards the `a.foo = b` width footgun. (TODO.md)
- ⬜ **A9. Readable / Writable variance.** Applied automatically during parameter inference. (TODO.md)
- 🟡 **A10. Parametric types / generics** (`function foo<T>(x: T)`). Stage 1 (function type params),
  Stage 2 (array element inference — `first<T>(xs: T[]): T`), Stage 3 (generic `type` aliases —
  `type Box<T> = {value: T}`, applied in any type position incl. nested/array; `tests/cases/generics/`)
  done. **Build-side array generics done:** `xs.map(f)` / `xs.filter(f)` build a new `T[]`/`U[]` over the
  growable rep (B6); `map`'s result element `U` is inferred from the callback's return via a shared `Infer`
  hole + the existing per-call instantiation. REMAINING: same for `Map`/`Set` when they land (B6a);
  **annotation-free inference for forward-referenced / mutually-recursive top-level functions** — #67
  landed mutual recursion via signature *hoisting*, but a fully un-annotated cyclic group still needs a
  declared return type; closing that needs call-graph **SCC grouping + group unification** (ML
  `let rec … and …` style: hole the whole cluster's signatures, check bodies together, solve). Matters
  for VL's inference-first identity (a recursive-descent compiler is one big mutually-recursive cluster).
  Also REMAINING: **const generics** (numeric/*value* type parameters, e.g. `Decimal<10, 8>` /
  `Buffer<N>`) — today generics take *type* params only; the enabler for the parameterized fixed-point
  `Decimal<Backing, Scale>` family (B2) and any fixed-size/parameter-by-value type.
- 🟢 **A11. Recursive structural types.** Done — `type Tree = { value, left: Tree | null, … }`
  constructs/traverses/compiles (cycle-safe traversals + a self-referential WasmGC struct rec-group;
  `types/recursive-tree.vl`). REMAINING: mutual recursion across *separate* `type` decls; recursion
  through an **array** element (`{ rest: [List] }`); bodyless `type Point` still errors cleanly (A14).
- 🟡 **A12. Soundness corpus.** Done (started): a must-error / must-not-error `.vl` corpus under
  `tests/cases/soundness/`; the runner is strict-by-default. REMAINING: keep growing it; the
  known-unsound corners are `xfail`-marked (e.g. the permissive `i32 + string` hole rule, A13).
- 🟡 **A13. Operator-constraint inference (row-polymorphic generics).** Done (core): a fully-inferred
  structural function (`add(self, b) { x: self.x + b.x, … }`) monomorphizes per call shape (i32 & f64
  from two call sites). REMAINING: the hole-operand rule is permissive (doesn't reject `i32 + string`
  yet); the *stored-closure* operator case (`vec + vec` via a `"+"` field) still hits the WasmGC
  width wall (B13).
- 🟡 **A14. Named/opaque type robustness.** The bodyless-`type Point` infinite-recursion crash is
  fixed (cycle-guarded `getConcreteType`; it now errors cleanly). REMAINING: real **nominal/opaque
  types** (decision: clean-error-for-now → `DECISIONS.md`).
- 🟡 **A15. Equality.** Done — `==`/`!=` are structural by value; functions by reference; arrays + nested
  structs recurse via a shared `valueEq` helper, gated by `isEquatable`. (→ `DECISIONS.md`.) REMAINING:
  a referential-identity operator (`===` / `identical`, O(1) `ref.eq`); `boolean`→i32 coercion when
  storing a comparison result.
- 🟡 **A16. Literal-union types (enums-as-unions).** Done (type-level): annotations constrain
  (`"a"|"b"` rejects `"c"`); `==`/`!=` discriminate + narrow; a numeric-literal union is its base
  scalar for arithmetic; a covering `if/else if` chain is **exhaustive** (no spurious `| null`). (→
  `DECISIONS.md`.) REMAINING: the **enum representation** (i32 tag for a closed literal union — see
  `docs/unions.md`); a literal union read *inside* a body softens to base (coarser member-narrowing
  there than at the call boundary).

---

## Track B — Codegen, memory model & runtime (`toWasm.ts`)
*Allocation = WasmGC; binaryen stays (it doesn't block self-hosting). → `DECISIONS.md`.*

- ✅ **B0. Numeric literals, i32/f64 arithmetic, if/while, direct calls, start fn, memory builtins.**
- ✅ **B1. Allocation strategy = WasmGC** (binaryen 116→130 for the GC API). → `DECISIONS.md`.
- 🟡 **B2. Numeric codegen.** Done: i64 & f32 arithmetic + float `/` & comparisons; i64/f32 type
  mappings; range-aware integer-literal defaults; **value-level bitwise/shift operators** (`& | ^ ~
  << >> >>>`, integer-only, i32/i64 → `i32.*`/`i64.*` and/or/xor/shl/shr_s/shr_u; H4.2 self-host gap).
  REMAINING: explicit value casting/coercion between
  numeric types (today only literals coerce); **`0x` hex / `0o` octal / `0b` binary integer literals
  + digit separators** (`1_000`, `0xFF_FF`) — a lexer/parser add the self-host lexer flagged (it does
  hex via `* 16` for lack of the literal); **arbitrary-precision `BigInt` and a `Decimal<Backing, Scale>`
  family** as future ***`std`-library*** generic types (not primitives — wasm has only
  `i32`/`i64`/`f32`/`f64`). A decimal is a scaled integer (`mantissa × 10⁻ˢᶜᵃˡᵉ`) parameterized over a
  backing int (`i64`/`i128` bounded, or `BigInt` unbounded) and a scale: `Decimal<i64,2>` = currency,
  `Decimal<BigInt,8>` = arbitrary-magnitude, with `BigDecimal` the dynamic-scale member. **Prereq:
  const generics** (numeric/value type params, e.g. `Decimal<10,8>`) — see A10; rides the module/`std` work.
- ✅ **B3. First-class functions / indirect calls + per-shape monomorphization.** A function value is
  a fat-pointer closure `{ tableIndex, env }`; each call site instantiates a fresh signature, keyed in
  codegen by wasm param signature. (See `vl-monomorphization` memo; folds into A10.)
- ✅ **B4. Closures** (the first WasmGC codegen) — nested decls, capture analysis, env struct,
  escaping closures. REMAINING: mutable captures (boxing / a mutable env cell).
- 🟡 **B5. Objects.** Done on WasmGC structs — literals, read/write, nested, f64 fields, args/returns,
  reassignment, captured-in-closures, excess-property width subtyping, function-valued fields +
  member-call; **method-shorthand `{ add(a,b){…} }`** (parser desugar to a function-valued field — no
  typecheck/codegen change). REMAINING: methods via `self`+UFCS (B14); typed literals in object values
  (`{n: 4<i64>}`); Exact-by-default for values (A8).
- 🟡 **B6. Collections — one user-facing collection, spelled `T[]`** (WasmGC; design + rationale:
  `docs/collections-design.md`). DONE (core rep): `T[]` is now a growable `{backing,len,cap}` WasmGC struct
  (per element wasm type), monomorphized-not-boxed, 2× growth (floor 4) — via compiler-emitted per-element
  helpers (`compiler/builtins/lists.ts`, à la `__string_eq__`). `[...]` seeds `len=cap=N`; `a[i]`/`a[i]=v`
  **trap on OOB** (bound = `len`); `.length`/`.capacity`/`.get(i): T|null`/`push`/`pop`/`clear`/`+` (concat)
  implemented; for-in + structural equality updated; strings stay on the raw-array path (`isListType`
  excludes them). **`Map[k]: V | null`** is the Rust/Swift split (map lookup optional; sequence index traps).
  REMAINING: in-place bulk append (deferred — will be `xs.push(...ys)` once variadics land, rather than a
  bespoke `extend` method); representation inference (§VL.7 — lower never-grown values to a header-less fixed
  array; a safe optimization); `map`/`filter` build-side generics (A10); `.vl`-std migration once a module
  system exists (the helpers are compiler-internal for now). **The names `List`/`Array` stay UNCOMMITTED**
  (`T[]` + inference is the whole committed surface — no user-facing way to force a representation).
- 🟡 **B6a. `Map` + `Set`** — completes the "usable for modding" trio with `T[]`. DONE (core): ordered
  open-addressing hash maps (Python-dict shape) over WasmGC, compiler-emitted per-type helpers
  (`compiler/builtins/maps.ts`). **string keys**; `Map[k]: V | null` (missing key = normal absence);
  `m[k]=v`; `.size`/`.get`/`.has`/`.set`/`.delete`/`.keys()`/`.values()`; `Set` `.add`/`.has`/`.delete`.
  **Deterministic insertion-order iteration** (multiplayer/replay). Delete compacts + sizes the index to
  the live count (bounded under churn); tombstone-aware probing. REMAINING: **i32-keyed Map/Set** (clean
  diagnostic for now — i32 keys use `T[]`); `for k in map` direct iteration (parser; use `.keys()` today);
  `map`/`filter` over Map/Set (A10); clean diagnostic polish for unannotated/used `Map()`.
- ⬜ **B6b. Collections building blocks & open items** (all detail in `docs/collections-design.md`).
  - **Prerequisite intrinsics** — the two-primitive floor the collection is built over: dynamic-length
    `__array_new__`/`__array_new_default__` + bulk `__array_copy__`, thin `defaultScope` intrinsics. The
    building block before the collection itself.
  - **Std-over-primitives** — write the collection (and opportunistically `print`) as `.vl` std, not
    compiler-privileged types (ties to H3). Open dependency: no module system yet.
  - **Indexing perf** (DECIDED resolutions; sub-choices/analysis open) — native-indexing flag (drops the
    B13 indirect call; nominal-vs-annotation open), backing-pointer hoisting (LICM), and bounds-narrowing
    (now an optimization, not a prerequisite, since trap-on-OOB is already a bare `array.get`).
  - **Representation inference** (DECIDED direction; analysis is new open compiler work) — infer
    fixed-array vs growable rep from usage; interprocedural + alias-unioned; co-design with variance (A9).
    Subsumes the old constant-literal optimization and most of the raw-array escape.
  - **Naming & forcing surface — UNCOMMITTED** — the names `List`/`Array` and any annotation to *force* a
    representation (vs the inferred default) are deliberately open; `T[]` + inference is the committed surface.
  - **Language-wide, still open** — value-vs-reference (default reference; also gates the inference
    analysis), the error model ("results for expected absence, traps for bugs").
  - **Deferred** — per-frame pooling beyond capacity-retaining `clear()` (kept in v1); a user-facing
    low-level array escape (only the FFI/SIMD/linear-memory case remains, post-inference).
  - **Remaining open questions** — capacity/seed construction spelling; `map`/`filter` return type.
- 🟡 **B7. Strings.** Done (core): WasmGC i32-array of code points — literal, `.length`/`s[i]`, `+`,
  `==`/`!=`, `print`. REMAINING: switch the backing to `(array mut i16)` + `wasm:js-string` builtins
  (bulk JS-host interop — what dart2wasm/Kotlin-Wasm do); UTF-8/i8 packing (size); richer methods.
  **Strings direction (design/research; not before bootstrap):** `docs/strings-design.md` —
  long-term UTF-8 internal storage, **code-point-indexed API** (`s[i]` = code point) made O(1) for the
  ASCII common case by an **ASCII fast-path** flag, no UTF-8-validity guarantee (Go-style), graphemes
  in an opt-in `std/unicode` module; strings immutable. Ties A7.
- 🟡 **B8. Loops.** Done: `for…in` over arrays, direction-aware `step`, single-line block bodies,
  empty-range warning. REMAINING: `for…in` over objects/maps; `for val, i in arr` and `for , v in obj`
  destructuring forms.
- ✅ **B9. `break` / `continue` in codegen** (incl. labelled `break outer`).
- ✅ **B10. Unary / prefix / postfix ops** (`-`, `++`/`--`, `!`; → `DECISIONS.md` for `!`-not-`not`).
  Minor gaps: `++`/`--` are i32-only and operate on a `Name` (not `o.x++` / `a[i]++`).
- ✅ **B11. `while true` return analysis** — a non-escaping `while true` types as `Never`, so a
  function tail'd by one returns via its inner `return`s with no spurious `| null`.
- ⬜ **B12. `async`/`await`.** Keywords lexed; no semantics/codegen. Large; likely last.
- 🟡 **B13. Well-known-symbol dispatch (operator / call / index).** Done: operator overloading — a
  user-shape operand dispatches through its operator method (stored-closure field *or*, for object-
  shaped operands like `vec + vec`, a free `self`-named operator function that monomorphizes per call).
  Index traps — a user object that declares a `"[]"` method handles `o[k]` (and `"[]="` handles
  `o[k] = v`), dispatched as a field-method call resolved statically; a native i32-keyed array keeps
  its fast `array.get`/`array.set`, so the trap fires only for non-array objects that declare it.
  (→ `DECISIONS.md`.) REMAINING: callable objects (`"()"`).
- ⬜ **B13a. Multi-index matrix idiom** (low priority). Single-bracket `m[i, j]` (comma-separated
  indices → multi-arg `"[]"`/`"[]="` traps) plus a flat-backed `Matrix`/`Grid` type (contiguous
  storage, no array-of-arrays pointer-chase) for cache-friendly numeric work. Nested `m[i][j]`
  already composes today, so this is the ergonomic/perf matrix sugar, not basic 2D support.
- 🟡 **B14. Methods via explicit `self` + UFCS (no `this`).** Done (core): a free `self`-first
  function is callable as `o.f(args)` (rewrites to `f(o, args)`, monomorphized per receiver);
  resolution order field-then-self-fn; non-`self` functions aren't instance-reachable. (Full decision
  set → `DECISIONS.md`.) REMAINING: route operator dispatch (B13) through self-methods; `c.area`
  (no `()`) as a bound value; mutation/variance (A9).
- 🟡 **B15. Lambdas + the declaration-vs-value distinction.** Done (typed): a `FunctionDeclaration` in
  value position lowers to its closure value (let-bound, capturing, higher-order, inline object
  fields). Method-shorthand `{ add(a,b){…} }` is done (parser desugar, see B5). (Syntax + decl-vs-value
  decisions → `DECISIONS.md`.) REMAINING: **untyped** lambdas (a stored closure has one signature —
  needs pinning-by-use or boxing).
- ⬜ **B16. Redeclaration / overloading.** Current: same-scope redeclaration errors; nested shadowing
  is allowed (uniquified in codegen). Future: ad-hoc overloading? Default "no, one binding per name
  per scope" (→ `DECISIONS.md`).
- 🟡 **B17. Diagnostics + lint.** Started: `severity` (error/warning/info), a `@warning` test directive,
  the empty-range warning, stable diagnostic `code`s, and the **lint pass** (`compiler/lint.ts`):
  unused-variable (function locals + params; `_`-prefix suppresses) and unreachable-code, both tagged
  `unnecessary` so VS Code greys them out. BUILD OUT — the lint rule backlog (keep it a few at a time):
  - **`export`-aware top-level unused** — unused top-level bindings are flagged *now* (dead in a
    whole-program compile). Once an explicit `export` keyword lands, *exported* top-level bindings become
    exempt (consumer-facing surface, not dead). Lint already suppresses *all* warnings on a file that has
    error-severity diagnostics (report the real errors first). (Ties into the modules/`export` work.)
  - **prefer-`const`** — a `let` that is never reassigned should be `const` (info/warning + quick-fix).
  - **unused function / unused import**; **dead/constant branch** (`if false`); **`step 0`** range loop;
    **unreachable after a diverging `if/else`** (have the simple after-`return` case).
  - **LSP quick-fixes** (code actions): "remove unused binding" / "prefix with `_`" / "`let`→`const`".
    The diagnostics already carry stable `code`s to match on; the LSP has no code-action provider yet.
  - Cross-cutting: thread `severity` through all remaining error variants; consistent message style.
- ⬜ **B18. Tail-call optimization** (low priority). binaryen 130 has `return_call`; detect tail
  position and emit it. Deprioritized — correctness is fine; this is a depth/perf optimization.
- 🐛 **B-bug. `while` as the tail statement of a void function crashes binaryen's Vacuum pass.**
  A `while` loop in *tail position* of a `void`-returning function body aborts inside binaryen
  optimization (reproduces with locals only — unrelated to globals; found while landing H2 gap #2).
  Workaround today: don't end a void function on a bare `while`. Fix: investigate the Vacuum-pass
  input we emit for a result-less loop in tail position (likely a malformed/None-typed block tail).
- ✅ **B19. `return` / early returns** (early, from loops, fall-through; a bare `return` yields null).
- ⬜ **B20. Loops as expressions + `break <value>`.** Lift `for`/`while` into expression position; a
  loop evaluates to its `break` value or `null` (a natural *search* expression — `let found = for x
  in xs { if test(x) { break x } }` → `Nullable<elem>`). Three layers: grammar → types (mirror the
  `returnTypes` mechanism) → codegen (`__brk` block gets a result type). Labels need a per-loop
  break-value collector stack.
- 🟡 **B-debug. Name section + source maps + trap-to-source diagnostics.** Done (#76): emits the wasm
  **name section** + a **Source Map v3** (binaryen debug locations threaded from Track G spans; survives
  `optimize()` via `setDebugInfo(true)`), and `runWasm`/CLI catch a trap and report a **line-and-column
  precise** VL-source error (`runtime error at file:L:C — <reason>`) instead of a raw wasm abort.
  REMAINING (owner-approved follow-ups): (1) **full source-mapped stack traces** — map *every* wasm frame
  in the trap's stack → VL `function (file:L:C)`, not just the top frame; (2) **value-rich panic messages**
  — a host `panic(msg)` abort path that formats the offending values (e.g. `index 7 out of bounds
  (length 3)`), with a stable structured shape for human + LLM readability; (3) an index-assignment LHS
  has no parser span yet, so an OOB *write* falls back to the statement line — broaden parser span coverage.
  Unblocks browser-DevTools source-level stepping later (DAP / native DWARF further future). A **REPL** is
  feasible on this wasm architecture (accumulate-session-source + recompile-per-entry + show-new-output) as
  a possible future CLI item. (Integer divide-by-zero stays a **trap** — the universal convention; a
  `divChecked: i32|null` dual is a possible future opt-in.)

---

## Track C — CLI (`vl` / `vital`)

- ✅ **C1. Headless `compile(source) → { ast, wasm, diagnostics }`** (`compiler/compile.ts`), shared
  by the LSP, the test runner, and the CLI.
- ✅ **C2. `vl run`** — compile + run a file / `-e` snippet / stdin (`deno task run`). Drives the VS
  Code Run-Current-File command.
- ✅ **C3. `vl build <file> [-o out.wasm] [--wat]`** — emit wasm bytes (and optional `.wat`).
- ✅ **C4. `vl check <file>`** — diagnostics only, non-zero exit on errors (CI gate). `--codegen` opt-in runs the full binaryen pipeline so codegen-only errors (e.g. recursion limit exceeded) are also caught.
- ✅ **C5. Distribution via `deno compile`** — native `vl` binary builds + runs binaryen embedded
  (`deno task compile`/`smoke`; all 11 smoke checks pass). See `README.md` "Building the Native
  Binary" and `DECISIONS.md` "Parser, distribution & bootstrapping". REMAINING: public release
  (tag/tap/sha256 bump) — decoupled from the compiler work.

---

## Track D — LSP / editor experience (`lsp/src/server.ts`)
*Mostly independent; benefits from Track A. AST nodes now carry source spans (Track G), unblocking
D1/D2.*

- ✅ **D0. Diagnostics on change.**
- ✅ **D1. Hover types.** `onHover` resolves the cursor: bindings via the D2 symbol table, **and
  `receiver.member`** (object fields, array/list/string members) by locating the member node via public
  spans, typing the receiver (`typeFromExpression`), and looking up the member (`listMemberType` / field
  / string member); rendered via `stringifyType`. REMAINING: flow-narrowed receiver types; Map/Set members
  (when B6a lands).
- ✅ **D2. Go-to-definition / find-references.** Parser populates a symbol/binding table
  (`compiler/symbols.ts`) during its scope walk; the LSP queries it by cursor (`textDocument/definition`
  + `textDocument/references`). Locals, params, function decls, type aliases; single-document. → `DECISIONS.md`.
- 🟡 **D3. Autocomplete.** Done (core): scope-aware identifier completion + structural member
  completion via `identifierCompletions`/`memberCompletions` (`lsp/src/typeFeatures.ts`), wired in
  `server.ts`, tested (`tests/lsp_completion_test.ts`). REMAINING: keyword/snippet completions,
  trigger-character tuning, and wiring a completion provider into the Monaco playground (E).
- 🟡 **D4. Formatter** (+ `vl fmt`). Done (core): an AST-driven source formatter (`compiler/format.ts`,
  `vl fmt`, LSP `textDocument/formatting`) — generates source from the AST, idempotent,
  round-trip-AST-equivalent, comment-preserving, with line reflow (wraps long calls / array & object
  literals / boolean chains at 80 cols, collapses when they fit). REMAINING (follow-ups):
  - **Unfaithful-fallback constructs** — reproduced *verbatim from the source span* rather than
    regenerated: `type` aliases (body & span discarded by the checker), operator-named & method-shorthand
    functions and operator/index-method call desugars, and leaf statements that enclose an own-line
    comment. Address so these round-trip through the AST like everything else.
  - **AST type-syntax fidelity gap** (the root cause of the fallbacks above; → Track G/A) — the
    typechecker fully RESOLVES every type it records (a tiny `i32` becomes a giant structural `Object`;
    `type`-alias bodies and their spans are discarded), so surface type syntax (annotations, `is`/`!is`
    check types, alias references) is NOT reprintable from the AST. Retain the *as-written* type syntax
    (or its span) so the AST is lossless for types — also benefits hover/inlay rendering (D1/D6/D8).
  - **Trailing commas** — the reflow doesn't yet emit trailing commas in multi-line literals; a parser
    change to *accept* them is in flight (`claude/trailing-commas`), after which `fmt` should emit them
    for cleaner diffs.
- ✅ **D5. Semantic tokens.** `textDocument/semanticTokens/full` — hybrid classifier: identifiers via the
  D2 symbol table (variable/parameter/function/type + `declaration` modifier), literals/keywords/operators
  via the lexer token stream, comments by source scan, **and `receiver.member` names** (→ `property` /
  `method`, typed via the same member resolution as D1). (Full only; `range`/`delta` not yet.)
- ✅ **D6. Inlay hints** for inferred types — *the* feature for a "types are hidden" language. Inline
  `: <type>` at unannotated `let`/`const`/params and omitted returns; annotated positions and unresolved
  holes are suppressed. (Annotation detection is currently source-text heuristic in `lsp/`; a future
  compiler-side `binding.annotated` flag would be the cleaner long-term source.)
- ⬜ **D7. Cross-references in doc-comments** — expand `///` docs with clickable symbol links following
  established conventions (JSDoc `{@link Name}` / rustdoc intra-doc `` [`Name`] ``) rather than a bespoke
  syntax, resolving names via D2's symbol table definition spans for click-to-definition; single-file first,
  workspace-wide later.
- ⬜ **D8. Preserve type-alias names in display (the "`aliasSymbol`" gap).** Today a reference to an
  alias resolves *through* to its body before rendering, so a hover on `type thing = "a" | I32` shows
  `"a" | i32`, not `"a" | I32` — the inner alias name is lost (the `Type` node in `ast.ts` carries
  `subType` but no `name`). This mirrors TS, which only keeps alias names because it hangs an
  `aliasSymbol` on the resolved type. Fix: carry the alias name on the resolved type (a `name?` on the
  `Type` node, or keep the reference as a named `Alias` and resolve lazily) and let the renderer choose
  per context — **preserve** the name in hovers/inlay (D1/D6: show what the programmer wrote);
  **expand** to the body in type-mismatch errors (the message must explain the actual incompatibility);
  show `type I32 = i32` (name = expansion) when hovering the alias *declaration* itself. Self-contained
  once the name is threaded; the only real design work is the preserve-vs-expand policy above.
  **Manual step-expansion (owner ask): expand one depth level at a time, on demand.** The renderer
  should take a *depth* and expand only the outermost alias layer per step (`"a" | I32` → `"a" | i32`,
  and for nested aliases one layer each press), not all-or-nothing. Surface it via **VS Code hover
  verbosity levels** — the `+`/`−` controls in the hover popup (LSP hover verbosity: the server returns
  a hover flagged `canIncrease`/`canDecrease`, and each "increase verbosity" request re-renders at
  `depth+1`). This needs `stringifyType` to grow a `maxDepth` parameter (alias `Type` nodes below the
  cap render as their name, above it expand to the body) and the LSP `onHover` to thread the requested
  verbosity level through. Default hover = depth 0 (all names preserved); stepping reveals the structure
  progressively. Same `maxDepth` renderer powers the preserve-vs-expand contexts above.

---

## Track E — Browser playground + sandbox
*Depends on C1. The compiler is pure TS + binaryen (wasm), so it runs client-side.*

- ✅ **E1. Bundle the compiler for the browser** (esbuild + `esbuild-deno-loader`, browser target). binaryen@130
  runs client-side unmodified (ESM, top-level-await self-init); `deno task playground` builds + serves.
- 🟡 **E2. Playground UI** — `<textarea>` + Run + diagnostics/log/WAT panes + sample picker (`playground/`).
  REMAINING: Monaco/CodeMirror editor.
- ⬜ **E3. Sandboxed execution** — compiled user wasm in a Web Worker, fresh `Memory`, controlled
  `log` only, enforced limits. The wasm sandbox + worker isolation is the security boundary. (Today user
  wasm runs on the main thread with a fresh `Memory` + `log`-only imports — fine for trusted local use,
  harden before any public deploy.)
- ⬜ **E4. Shareable links** (encode source in URL / gist).

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ✅ **F1. Test harness** (`deno task test` over the `.vl` corpus with `// @directive` expectations).
- ⬜ **F2. Gate debug `console.log`s** in `toWasm.ts` behind a debug flag.
- ✅ **F3. Retired `ts-interpreter/` → `reference/`.**
- ⬜ **F4. Re-enable inline `m.validate()`** during dev for earlier failure.
- ⬜ **F5. Settle the name** (VL vs Vital) and apply consistently.
- ⬜ **F6. Document the build** (`deno task build`/`test`; the antlr/gradle gen step is gone).
- ⬜ **F7. Fix the `paramater` misspelling** project-wide (optional; currently consistent).
- ✅ **F8. Dropped the binaryen patch + `patch-package`** (LSP server is ESM, where binaryen's TLA is
  legal). REMAINING (F5-adjacent): confirm vscode-languageclient forking the ESM server in VS Code.
- 🟡 **F9. Perf baseline** (`deno task perf`) — compile-time (front/codegen split) + emitted wasm size over
  the corpus + synthetic stress programs; best-of-N, standalone (not in CI). Headline finding:
  **literal-union compilation is ~cubic** in member count (200 → ~2s) — bootstrap-relevant (token/AST-kind
  unions). REMAINING: a *runtime* benchmark (run compiled `.vl` programs, e.g. the selfhost lexer, on large
  inputs); investigate the cubic union (A16).

---

## Track G — Hand-written parser ✅ DONE
Replaced antlr4 with a hand-written TS lexer + recursive-descent/Pratt parser that emits the typed
AST directly. antlr4, the gradle project, the generated dirs, and the `gen` task are gone; AST nodes
now carry source spans (`Context = { start, stop }`). This was the parser-side bootstrap gate (H1). →
`DECISIONS.md` for the hand-written-over-generator choice.

**Tooling foundation (done):** node spans are now **publicly exposed** (`NodeSpans` + `spanOf` via
`toAST`/`compile`), and the lexer emits **comment-carrying tokens** — comments are retained with spans
(a flat `comments` list + per-token `leading`/`trailing` trivia) without entering the grammar token
stream. This unblocks an AST-driven formatter (D4), a real `binding.annotated` flag for inlay hints
(D6), and doc-comment cross-references (D7).

---

## Track H — Self-hosting & distribution (the bootstrap end-state)
*The goal: VL compiles itself; the TypeScript/Deno host (Deno, the TS compiler core, the already-gone
antlr/Java generator) retires; the compiler becomes VL→wasm on a generic wasm runtime. The `.vl`
corpus (A12) is the host-agnostic oracle — the same tests pass whichever compiler runs them.
**Distribution does NOT require self-hosting** (the two timelines below are independent).*

- ✅ **H-M1. Distribute now via `deno compile` (= C5).** Done — see C5. Native binary ships binaryen
  embedded; `deno task compile` + `smoke` verified. Decoupled from everything below.
- ✅ **H1. Parser self-hostable (= Track G).** The one piece that categorically can't live in a
  VL-in-VL compiler is gone.
- 🟡 **H2. Make VL expressive enough to write a compiler.** Recursive tree types (**A11 ✅**), generics
  (**A10 ✅** incl. `map`/`filter`), `List` (**B6 ✅**), maps (**B6a** ⬜), string munging (**A7**).
  **Gaps a `selfhost/lexer.vl` spike found** (ranked; the concrete H2 to-do list):
  (1) ✅ **`.push` a non-nullable struct array** (`Tok[]`) now works — the backing array's slot type is
  nullable-widened to `(ref null $T)` for non-defaultable ref elements (so `array.new_default` is legal in
  every allocate-then-fill path: grow, `map`, `filter`, `+`); reads off the live `[0, len)` region
  `ref.as_non_null` back to the surface non-null type. Struct accumulators no longer need `(T|null)[]`
  (unblocks AST-node lists); (2) ✅ **module-level mutable `let` mutated through a function** — a scalar top-level
  binding referenced from inside a function now lowers to a shared wasm `global` (`global.get`/`global.set`),
  so reads/writes from a function hit the one cell, not a captured copy (`tests/cases/globals/`); (3) ✅
  **string escapes** now decoded in the lexer (`\n`/`\t`/`\xXX`/`\uXXXX`/…); (4) ✅ **`toString` resolves in
  nested scopes** — root cause was a prototype-chain leak in scope lookup (`name in scope` matched
  `Object.prototype.toString`); fixed by `Object.hasOwn` everywhere (also closes the same hazard for
  `constructor`/`valueOf`/etc.); (5) ✅ **`fromCodePoint(code): string` builtin** — code-point-named (replaced the
  JS-ism `fromCharCode`); (6) ✅ **ref/string module-globals through a function** now lower to shared wasm
  globals (extends gap-2's scalar-only support to ref/string cells); (7) ✅ **one-char string literal `.length`**
  no longer mis-types as a char — string literals soften to nominal `string`. Remaining known: maps (B6a),
  enum tag for literal-unions (A16); char literals ✅ and a `toString`/stringify ✅ are now done.
- 🟡 **H2a. Re-land a clean `selfhost/lexer.vl`** (near-term, now unblocked). The spike PR #54 was closed
  "fix gaps, re-land clean"; with the H2 gaps above fixed, re-land a lexer that drops the workarounds:
  hand-rolled `i32ToStr` → real `toString`, raw `\xXX`/`\uXXXX` lexemes → `fromCodePoint`, struct-threaded
  scanner state → a real ref-typed module global. The first concrete slice of H3.
- ⬜ **H3. Port the compiler to VL.** Rewrite `toAST`/`typecheck`/`toWasm` as `.vl`, validated by
  running the corpus through the VL-written compiler. Incremental; TS and VL compilers cross-checked.
  First slice (lexer) spiked + closed (#37, then #54) pending the H2 gap fixes; re-lands clean as
  `selfhost/lexer.vl` (H2a). Front end now wired **end to end from source text**: a raw VL string
  runs through the real `lexer.vl → parser.vl → typecheck.vl` chain (driver
  `tests/selfhost_pipeline_test.ts` + `tests/selfhost/pipeline_harness.vl`), proving the whole front
  end self-hosts — no hand-built token streams. The lexer↔parser token-kind/name divergences are
  reconciled in the driver glue (no `.vl` compiler edits); gaps catalogued in `docs/selfhost-gaps.md`.
- ⬜ **H4. WASM emission — DECIDED: emit bytes directly + optional `wasm-opt`** (binaryen's npm build
  is JS-bound; → `DECISIONS.md`, incl. the Heap2Local caveat). binaryen stays for the TS compiler.
- ⬜ **H-M2. Wasm-native distribution (end-state).** The `vl` binary becomes a wasm runtime (wasmtime —
  full WasmGC since v27 / Wasm 3.0) + a small host shim that runs *both* the compiler-wasm and
  user-program-wasm. No V8, no binaryen, no Deno.
- ⬜ **H5. Versioning — deferred; rustup/Volta model, not nvm** (→ `DECISIONS.md`). Make the H-M1
  install path version-stamped so a launcher can slot in later.

**Sequence:** H-M1 (now) → H2 (A10 + collections) → H3 port → H-M2 host swap. Cost is dominated by
H2/H3; H1 done, H4 decided.

---

## Next (highest leverage)

- **A10 generics + collections (B6 `List`, B6a maps)** — the H2 capability bar, and the gate on
  self-hosting (H3). The deepest remaining type-system work.
- **C5 / H-M1** — `deno compile` + brew. Small, decoupled, ships the distribution story now.
- **D1** — hover types, now that AST nodes carry source spans (D2 go-to-def/refs is done).
- Smaller/independent: B6 growable lists, B13 callable-objects, B17 lint pass, A6b Stage A.
