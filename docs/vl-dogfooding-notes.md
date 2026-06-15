# VL dogfooding notes — papercuts log

A running friction-log from using `vl` to build and run real programs (mine + the
slice agents'). Organized into **tooling**, **the language**, and **performance**.
Each entry: what was hit, why it's friction, and a fix direction. `[FIXED #N]`
marks items resolved this session (kept for the progress record); everything else
is open backlog — triage as you like.

---

## 1. Tooling

### External (wasmtime / binaryen)

- **binaryen ↔ wasmtime feature-set mismatch.** `wasm-opt` on VL's WasmGC output
  needs EXACTLY `--enable-reference-types --enable-gc`: binaryen's defaults reject
  `struct.get`, and `-all` turns on post-3.0 features wasmtime 45 then refuses to
  load. So the "obvious" `wasm-opt -all` is a trap on both ends. Baked into
  `vl build -O` so users don't have to know — but anyone shelling to binaryen
  directly will hit it. (`wasm-dis` needs the same two flags to disassemble.)
- **Anonymous trap backtraces.** A wasm trap printed `0xa2 - <unknown>!<wasm
  function 4>` — no names. `[FIXED #285]` — the emitter now writes a `name`
  custom section (gated off by default for goldens; `vl run` enables it), so traps
  read `vl!divideByZero`.
- **wasmtime 45 uses its own `wasmtime::Error`** (not `anyhow`) — minor host-glue
  friction (different `.context`/`bail!` surface than the ecosystem default).

- **`fetch-seed.sh` didn't fall back to curl when `gh` was unauthenticated.**
  `[FIXED]` — `fetch()` used `gh release download` whenever `gh` was merely on
  PATH and only used curl when `gh` was ABSENT. In a sandbox with `gh` installed
  but not logged in, the gh call failed and the whole fetch errored — even though
  the release asset is public and a plain curl (302 → the published GitHub CDN
  range, already in the firewall allowlist) returns it fine. Now it tries gh and
  falls THROUGH to curl on any failure. (Diagnosed while bringing up the seed in
  the restrictive devcontainer: the failure looked like a firewall block but was
  purely the gh-XOR-curl branch.)

### Internal (`vl build` / `check` / `run`)

- **`vl check` used to do a full compile** (parse→type→**emit**). `[FIXED #283]` —
  now parse+typecheck only: faster (~1.0s vs ~2.3–3.9s on the whole compiler) and
  it stops false-rejecting type-valid programs the emitter can't lower yet.
- **`vl run <file.wasm>`** (run a prebuilt module) didn't exist. `[FIXED #282]` —
  magic-byte detection; also makes `vl build -O` output runnable/gateable.
- **`vl build -O`** (wasm-opt) didn't exist. `[FIXED #282]`. **Open:** no `-O`
  levels — it's on/off only; no `-O2`/`-Oz`/`--release` profile mapping to
  binaryen's ladder.
- **No `vl build -o -` (stdout)** — can't pipe a module to `wasm-dis`/another tool;
  output always goes to a file + a status line. Small, conventional add.
- **No `vl build --emit wat`** — text-format output requires a separate `wasm-dis`
  pass (with the GC flags). A thin wrapper would be convenient.
- **`check` green ≠ `build` succeeds.** Because `vl check` is (correctly)
  typecheck-only, a program can pass `check` and then fail at `build`/`run`'s emit
  stage (the emitter-coverage gaps — lambdas, generics, sets, …). Honest, but a
  user may be surprised that "it checks" doesn't mean "it builds". A `vl build`
  used as the real gate (or a `check --emit`) closes the gap.
- **Native traps don't map to `file:line:col`.** `vl run`'s trap reports a wasm
  trap + (now) a function name, but not the VL source location — the host TS
  pipeline maps `@trap` to `:7:6`, the native path doesn't yet. Needs source spans
  threaded through the emitter (spans rung-1 landed token positions in #286; rungs
  2–4 + an emitter source-map side channel are the rest).
- **Checker-accepts-but-emit-miscompiles is the worst failure class.** f64 was
  *accepted* by the checker but emitted garbage (`print(2.5)`→`185`) — silent wrong
  output, worse than a clean reject. `[FIXED #293]` (the f64 emit slice: a pure-i32
  IEEE-754 encoder). General lesson stands: the checker should not get ahead of the
  emitter without the emitter at least trapping/rejecting rather than miscompiling.

---

## 2. The language

### Common mistakes / surprising semantics

- **Global initializers run BEFORE top-level statements, not in source order.**
  ```
  const nodes: Node[] = []
  let i = 0
  while i < 6 { nodes.push({...}); i = i + 1 }   // top-level statements
  const firstWeight = nodes[1].weight             // global init — runs FIRST
  ```
  `firstWeight`'s initializer is hoisted ahead of the push loop, so `nodes[1]`
  indexes an empty array and traps. Surprising — violates source-order intuition.
  (Found while fixing for-in.) Fix direction: interleave global inits with
  top-level statements in source order, or diagnose use-before-population.
- **Narrowed bindings are pinned.** After `if x != null { … }` / `if x is A { … }`
  narrows `x`, you cannot reassign `x` — you must introduce a fresh variable. This
  bit me and the agents repeatedly; it forces `let s0 = …; let s1 = …` chains. A
  related sharp edge: a direct `g == <literal>` comparison on a *reassigned module
  global* emitted a spurious arity error (worked around with `g > 0`). Fix
  direction: allow re-widening on reassignment, and tighten the
  narrowed/global-binding comparison path.
- **Postfix vs prefix `++`/`--`.** Both used to desugar to `x = x±1`, so `x++`
  yielded the *new* value as an expression. `[FIXED #284]` — postfix now yields the
  old value; prefix unchanged.
- **Char literals are `i32`.** `'a'` is an integer code point, not a length-1
  string — assigning it where a string is expected, or printing it, surprises.
- **Integer-literal type defaulting + i64.** Bare integer literals default to
  `i32` and widen to `i64` only in i64 context; a literal exceeding the i32 range
  needs an explicit `: i64` or it wraps. (`i64`/`f32` were unknown types until the
  numeric slices; large hex like `0xDEAD_BEEF` printed as a negative i32 before.)
- **Inline vs named unions.** `function f(v: A | B)` used to fail where
  `type N = A | B; function f(v: N)` worked — same type, different result.
  `[FIXED #288]`.
- **`is`-narrowing is then-only on the self-host checker.** `if v is A { … }`
  narrows in the then-branch, but the `else`/`else if` complement (`v` is the other
  variant) and **shared-field-on-union access** (`(A|B).tag` when `tag` is in every
  variant) aren't supported yet — surprising that the positive branch narrows but
  the negative one doesn't. (~5 corpus files blocked on this.)
- **for-in lost the element type over struct arrays.** `for p in ps` (`ps: P[]`)
  failed because the loop var wasn't typed as the element struct. `[FIXED #287]`.

### Verbose syntax that could be simplified

- **No `?.` / `??` in the self-host** (the host has them) → nullable handling is
  deeply nested explicit guards. The emitter's own `checkParams` is 6 levels of
  `if !A { if !B { … } }` partly for this reason. Optional-chaining + coalescing
  would collapse a lot of it.
- **No string interpolation / template literals.** String building is `+`
  concatenation (which is also an O(n²) perf trap — see §3). Interpolation or a
  builder would help both ergonomics and performance.
- **No destructuring.** Struct fields are always `p.x` / `p.y`; no `{ x, y } = p`
  binding form, so multi-field reads are repetitive.
- **Pinned narrowing forces fresh names** (above) — turns what would be one
  reassigned variable into a chain of `s0/s1/s2`, which reads worse than the logic
  warrants.

### Parser desugaring loses surface syntax (formatter friction)

- **The parser desugars many surface forms in the arena, so the AST is not
  faithful to what was written** — a recurring tax on the formatter (and any
  tool that wants to reproduce source). Found while porting `format.vl`:
  `a += b` → `a = a + b`, `x++` → `Unary("p+", x = x+1)`, `++x` → `x = x + 1`,
  `x !is T` → `!(x is T)`, and `else if` ⟷ `elseif` collapsed to the SAME nested-If
  AST. Originally each was recovered in the formatter by scanning the source TOKENS
  in the node's span — surface fidelity living in two places. **MOSTLY RESOLVED** by
  carrying a faithful-surface MARKER on the node (the host's `compoundOperator`
  approach): compound assignment + prefix increment ride `BinExpr.binCompound`, the
  negated guard rides `IsExpr.isNeg`, and `elseif` was REMOVED as a redundant alias
  of `else if` (one canonical chain form — `else` whose branch is an `if`, no fused
  keyword). Remaining token-recovered surface: the `export` modifier, quoted operator
  keys, and `import` statements (no node — see below).
- **`import` statements produce no AST node** (the single-file parser `skipImport`s
  them; binding is the module layer's job). Any tool that walks the AST — including
  the formatter — silently loses them. `format.vl` had to re-scan `P.toks` for
  `IMPORT…STRING` runs and slice the source. A lightweight retained import node
  (even just its span) would be cleaner than token re-scanning.
- **A lookahead-then-construct ordering bug stretched a node's source span.** The
  union-decl parser ran `skipNewlines()` (to peek for a continuation `|`) BEFORE
  `mkUnionDecl`, so the node's end-token (`nodeEndOf`, the #385 spans) landed on a
  following blank/comment line — and the formatter's verbatim slice then swallowed
  the next comment. Fixed by pinning the cursor past the last variant before
  constructing the node. General lesson for the spans work: capture a node's end
  position at the construct's true end, not after speculative lookahead.
- **Method-call callees bypass the member-read arm.** A builtin method call
  (`xs.push(e)`, `m.set(k,v)`, `s.slice(a,b)`) is typed inside `checkCallNode`'s
  member-callee branch, which `return`s the result directly — the callee `Member`
  node is never `checkNode`'d through the member-read arm. So the per-member
  recording that drives IDE queries (`symMem`, the member-hover/-token tables) never
  sees those names; only member *reads* (`o.x`, `s.length`) and struct-field
  function calls (which fall through to `checkNode(n.callFn)`) are recorded. Found
  building native member semantic tokens — had to add a separate `symMemMethod`
  recorder at the call branch. A single member-resolution choke point shared by the
  read arm and the call arm would remove this asymmetry.
- **Scope spans live in offsets; the symbol queries live in line/col.** `nodePos`/
  `nodeEndOf` (the #385 spans) are CHAR OFFSETS, but every IDE query compares
  1-based-line / 0-based-col (token `.line`/`.col`). Building scope-at-position
  (completion) meant recovering a scope-owning node's start line/col by SCANNING
  the token table for the token whose `.start` equals the node's offset — there is
  no offset→line/col map. A small lexer-built line-start table (or storing both on
  the node) would make span work less ad-hoc. Also: the checker's lexical scopes
  are pushed/popped during the walk and gone afterward, so a position query needs
  each binding stamped with its scope's *source span* at decl time — the scope
  stack itself can't be queried post-hoc.
- **Demand inference re-runs a body from a deeper stack.** An un-annotated
  function called forward is type-checked ON DEMAND at the call site, so its body
  runs with the caller's scope stack underneath it — its apparent "enclosing
  scope depth" is wrong during that pass. Anything that reads scope DEPTH while
  recording (here: a function name's visibility scope = one frame out) gets a
  too-tight answer. The fix was to stamp top-level functions in the hoist pre-pass
  (global, before any demand inference) and make the recorder first-write-wins.
  Lesson: don't infer lexical structure from the live scope-stack depth during a
  pass that demand inference can re-enter — derive it from the node instead.

### Syntax worth documenting (not wrong, just non-obvious)

- `is` precedence sits **looser than the postfix operators but tighter than the
  binary operators** (so `n.x is A` is `(n.x) is A`, usable directly as an `if`
  condition). Easy to mis-predict.
- Two `for…in` forms: `for x in arr` (element binding) vs `for i in 0..n` (range).
- **Multi-line boolean expressions must break AFTER the operator, not before.** A
  `&&`/`||` chain wraps fine when each line *ends* with the operator
  (`a == x ||` ⏎ `  a == y`), but a continuation line that *starts* with `||`
  parses as a fresh statement → `Syntax error: unexpected "||"`. The lexer emits a
  `NEWLINE` that the expression parser treats as a terminator unless the prior
  token demands a continuation, so a trailing binary operator is the signal. (Hit
  writing the driver's `lexClassOf`; matches existing style in `wasmEmit.vl`.)

---

## 3. Performance (non-TS)

- **String building is O(n²).** VL strings are immutable code-point arrays, so
  `s = s + c` in a loop copies the whole accumulator each step (and WasmGC
  `array.copy` is a per-element host libcall, so the constant factor is bad too).
  The compiler itself was pathological here. `[FIXED #277]` for the compiler by
  accumulating code points in an `i32[]` and converting once via a `fromCodePoints`
  builtin (self-rebuild 6m29s→2.8s) — but the *language-level* trap remains: the
  natural idiom (concat in a loop) is quadratic, with no `StringBuilder`/rope and
  no concat-in-loop fusion for user code. This is the single biggest language perf
  papercut.
- **Unoptimized output is large.** The emitter does no optimization of its own (no
  const-fold, DCE, peephole) — it relies on external `wasm-opt`. A sample module
  shrank **198→111 bytes (44%)** under `-O`. So default `vl build` (no `-O`) is
  meaningfully bigger/slower than necessary, and getting it smaller requires an
  external tool. Cheap self-emitter wins (fold `0 - x` / `x ^ -1` constants, drop
  unreachable code) would help the no-`-O` path.
- **64-bit constant math runs in i32.** Because the self-host compiler is i32-only,
  encoding an `i64`/`f64` constant means multi-word hi/lo arithmetic (and, for f64,
  a full IEEE-754 pack with round-to-even) — verbose and slow. This is
  *compile-time* only (the user's runtime gets native i64/f64 ops), but it's a tax
  on the compiler and a reason the compiler can't easily use i64/f64 in its own
  code yet.
- **Compiler load cost is front-loaded but cached.** The dominant per-invocation
  cost is Cranelift-compiling the compiler module; mitigated by a `.cwasm` sidecar
  (warm `vl` invocations are ~5–7ms) `[#276]` and a null GC collector for the
  one-shot compile (no DRC barriers) — user programs (`vl run`) keep DRC. Good as
  is; noted so the sidecar/freshness logic isn't mistaken for dead weight. (Dev
  gotcha, not user-facing: the `vl` binary and the seed `.wasm` must come from the
  same branch — a stale binary against a newer seed fails on a missing export,
  e.g. `__print_i64__`.)
