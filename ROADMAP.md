# VL / Vital — Roadmap

The vision: a scripting-feel language with types **hidden by aggressive inference**, **permissive &
structural**, **fully type-safe** (statically sound — no untyped code; inference holes resolve to
concrete types), compiling to **lean WebAssembly**. Deliverables: an **LSP-backed VS Code extension**
(partial), a **CLI** (the native `vl` — `build`/`check`/`run`, `-O` via wasm-opt; brains in
`build/vl-compiler.wasm` under wasmtime), and an **in-browser playground** (partial).

**Self-hosting status:** the compiler is written in VL (`compiler/*.vl` — lexer/ast/parser/
typecheck/wasmEmit) and **compiles itself to a byte-exact fixpoint** (stage3 == stage4,
`scripts/native-fixpoint.sh`, ~6s, no TS past the seed; gated in CI by `ci-native`). The TS
genesis is gone — the seed's source of truth is the published `seed-latest` release (self-compiled
each master push), with the immutable `seed-v0` anchoring the lineage. **The TS host is DELETED** —
the ~18K-LOC `compiler/*.ts` front end, the `cli.ts` release binary, and the `checker-parity-sweep.ts`
oracle are all gone; only the dependency-free type leaves (`coreTypes.ts`/`diagnostics.ts`) remain for
the LSP/playground. The self-hosted `compiler/*.vl` is the one and only compiler.

Status: 🟡 partial · ⬜ not started.

**Repo layout:** `compiler/` — the self-hosted compiler (`*.vl` — lexer/parser/typecheck/wasmEmit,
built to the wasm seed; the only `.ts` left are the `coreTypes`/`diagnostics` type leaves) ·
`scripts/vl-host/` — the native Rust `vl` host · `lsp/` — the VS Code extension + LSP server (drives
the seed) · no `grammar/` — the old `.g4` spec is gone; the hand-written parser + the `tests/`
corpus are the de-facto spec · `tests/` — `.vl` corpus + runner · `docs/` ·
`reference/` — retired ts-interpreter. Tracks are **independent** unless a dependency is called out.

> **Maintaining this file.** The roadmap is *forward-looking* — what to do next, why, dependencies,
> what's remaining.
> - *Shipped work?* → `CHANGELOG.md`.
> - *Why we chose something non-obvious?* → `DECISIONS.md`.
> - *How an already-done thing works?* → the code + git history, or a `docs/<subsystem>.md` explainer.
>
> Done items graduate to CHANGELOG. Partial items keep only the remaining/forward part. (Agents:
> on finishing, move the item to CHANGELOG as a one-liner; put rationale in `DECISIONS.md`.)

---

## Next (highest leverage)

> **#1 priority — destringify types (`docs/internals/destringify-types-program.md`).** The 2026-07-25
> discovery census measured **2,414 type-string operations** still live — *under its own vocabulary*:
> 222 discovered resolvers + any character-literal comparison + whole-spelling structure equality
> (1,435 resolver calls · 931 inline surgery · 48 whole-spelling), **703 of them distinct consumer
> decisions**. Quote that number *with* its denominator or not at all — the old SCORECARD list covered
> 38% of one column and 0% of another, which is why every prior "we're done" verdict was premature.
> The single highest-value target: **`nameToTy` is the checker's SECOND recursive-descent type parser**
> (~150 ops), and its bank is already shipped and proven — #1117's spelling tree probed at **0
> disagreement over 319,945 comparisons** — and still **completely unread** (`typecheck.vl` does not
> contain the string `annTs`). #1129 measured away the prerequisite that was thought to gate it: the
> canon pass runs at the *end* of `checkProgram`, so it cannot reach a checker-time resolution
> (333,073 reads · 0 stale · 0 missing). `tsToTy` is the whole remaining cost.

### Consumer-driven requirements — webcraft (`docs/webcraft-requirements.md`)

The first real downstream consumer, currently TS with a planned VL rewrite, has published a tiered
ask keyed to **our own item IDs** (A14, A16, B6a, B15a, B-mem, B-hint). Its tiers are adopted as-is
rather than re-derived. The forcing date is **M7** (the port begins); M2–M6 gate on nothing from us.

**P0 — gates the port STARTING. The `Buffer` linear-memory tier (our B-mem, "one deliberate escape
hatch").** All four are prerequisites for each other in practice:
- 🟨 **P0.1 `Buffer` alloc + the full load/store width matrix** — `Buffer(n)`, `.length`, and
  u8/i8/u16/i16/i32/i64/f32/f64 both directions. **The WIDTH MATRIX and the growth ops have shipped;
  the allocator and the bulk ops have not.** Today: **8 load widths** (`__load_i8__`, `__load_u8__`,
  `__load_i16__`, `__load_u16__`, `__load_i32__`, `__load_i64__`, `__load_f32__`, `__load_f64__`)
  and **4 store widths** (`__store_i32__`, `__store_i64__`, `__store_f32__`, `__store_f64__`) plus
  `__memory_size__`/`__memory_grow__`, all lowered to single instructions and verified by
  disassembly. Every scalar VL has now round-trips at its own width; what is missing is the NARROW
  store pair (`i32.store8`/`i32.store16`), whose spelling §O2 leaves unruled.
  *(This line used to read "today: 4 store widths, 1 load width". That was measured false: it counted
  DECLARATIONS, and described `compiler/wasmBuiltins.ts` — deleted by kill-TS, #466. Before the load
  slice there was exactly one working store width and one working load width. See
  `docs/internals/buffer-design.md` §A1 for the probe table and §I for the store slice.)*
  Still needed: a real allocator (bump is fine — the sim allocates a few large Buffers at init and
  never frees), replacing today's "program picks raw addresses, two users collide" scratch page; and
  the `Buffer` type itself, which is deliberately NOT shipped while O1/O5/O6 are unruled.
  **The capture bug (§B3/O7) that blocked every `Buffer` METHOD is fixed**: `capScan` exempts a
  builtin/intrinsic in CALLEE POSITION (#1172) and now reads the checker's own reservation list, so
  a named function wrapping any memory intrinsic emits in a module that uses a function value.
  **`Buffer.copy` / `buf.fill` lowering to `memory.copy`/`memory.fill`
  are load-bearing, not conveniences** — snapshot and rollback *are* those ops; without them a
  snapshot is a per-word loop. The host flag they need (`--enable-bulk-memory`) has landed ahead of
  them, so `vl build -O` will not break the day the emitter writes `0xfc`.
- ✅ **P0.2 Exported memory** — replaces the per-scalar host-call ABI for bulk data; the host
  overlays `Float32Array`/`DataView` in place, and nothing else in the export contract changes.
  The module's linear memory is exported as `memory`, automatically,
  gated on the memory existing at all (the same `memUsed` flag that emits the memory section), so a
  program that never touches linear memory is byte-identical to before. A memory-only module now
  emits an export section, which it previously skipped entirely. A user function exported as
  `memory` in a memory-using program is a loud compile error (O4 ruled (i)). No host change was
  required — wasmtime, the JS import shape, `wasm-opt` and `wasm-dis` all already tolerated an
  exported memory; proved from both hosts (`tests/vl_exported_memory_test.ts` overlays
  `Float32Array`/`DataView` on `instance.exports.memory.buffer` and reads guest bytes in place).
  **A `memory.grow` DETACHES every host view**: `byteLength` goes to 0 and an indexed read returns
  `undefined` rather than throwing, so a JS host must re-read `.buffer` after any call that can grow.
  That contract is asserted by test, not merely documented. (In a Rust/wasmtime host the same hazard
  is a borrow-check error instead — measured.)
- ✅ **P0.3 Reinterpret casts** — `f32bits`/`f32fromBits`/`f64bits`/`f64fromBits`, one opcode each.
- ✅ **P0.4 Float/int opcode intrinsics** — f32/f64 `sqrt abs floor ceil trunc nearest min max
  copysign`; i32/i64 `clz ctz popcnt rotl rotr` + unsigned `divU remU ltU leU gtU geU`. Free
  functions, width taken from the operands, shadowable by a program's own function of the same name.
  `sin/cos/pow/exp` stay a deliberate non-ask — no wasm opcode computes one, so any std `sin` would
  be a policy choice in its last bit, i.e. a determinism trap.

**P1 — gates the port being GOOD.**
- ⬜ **P1.1 Typed views over Buffer** (`buf.f32view(off, count)`, `x[i]`, `.length`) — the kernel is
  structure-of-arrays; this is "the thing most worth absorbing into the language".
- ⬜ **P1.2 `flat` record layouts (AoS)** — declared field order = layout, fixed sizes, no reordering,
  scalars and nested `flat` only; `buf.rows<T>(off, count)`. The C-struct tier **WasmGC structurally
  cannot provide**. Forcing customer is a Lua 5.3 VM needing bit-exact `pairs()` order. Ships after
  P1.1; only the Lua port is blocked on it.
- ⬜ **P1.3 Optimization defaults** — Heap2Local in the blessed pipeline + a documented release
  profile (`--closed-world -O3 --gufa`). Our union boxes and `{backing,len,cap}` wrappers **must melt**
  in per-tick scratch code or alloc-free-steady-state becomes "avoid half the language".
- ⬜ **P1.4 Bounds-check ergonomics** — not asking for unsafe access; asking that the canonical
  view loop either hoists the bound or relies on the memory trap, **and that this is stated** so
  kernel code can be written to the fast pattern deliberately.
- ⬜ **P1.5 Nominal/opaque types (= our A14)** — `EntityId`/`PlayerSlot`/`AbilityHandle` are all i32
  and interchange silently today. Zero-cost newtype. Cheap, high-value for engine code.
- ⬜ **P1.6 `vl test`** — already designed and already slated (see Track H); webcraft needs it to
  *exist* by M7 for thousands of table-driven cases. **See the promotion note below.**

**P2 — wanted, not gating:** i32-keyed Map/Set + `for k in map` (B6a); contextual f32 literals (sim
code is f32-saturated and today every constant needs a cast); **`match` phase 2 — variant payload
binding** (`match cmd { Move{x,y} => … }`); literal-union compact representation (A16); readonly
fields / A9 variance; default params (B15a); SIMD over Buffer (unlocked by P0, not requested yet);
keep emitting a names section on non-`-O` builds.

**Non-asks, deliberate — do not build these for them:** exceptions/async (our `T|E` + trap model is
*preferred*), separate compilation / wasm linking, UTF-8 strings (B7), WASI, a std math/trig library,
in-language GC knobs.

- ⬜ **PROMOTE `vl test` ahead of the std expansion.** (Owner's ordering: *"before we expand the std
  library, I'd prefer we get our own test runner and assertion library"*.) It is **already designed** —
  `docs/internals/test-runner-design.md` — and the design **already encodes the owner's "as much code
  as possible in VL, Rust is a thin wrapper" direction**: *"the brain is VL; Rust is the mechanism
  pump"*, *"runner logic in VL wherever possible, not Rust"*. `std:test/runner` is **a VL program**
  owning all POLICY (argv interpretation, the directory WALK + glob/filter, the plan, `.only`/skip,
  report formatting, the exit code); the host owns only mechanism the wasm capability model cannot
  express, as RAW primitives never policy — `listDir`, `readFile`, thread pool, instance lifecycle,
  capture buffers, trap catching, timeouts.
  **Browser execution falls out for free**, which is the property to protect: the two sides talk
  through a **command-queue protocol** (host pumps `rnNextCmd()`, executes, commits back) and
  **the linker stays EMPTY — no host-function imports at all**. So a browser driver is the same loop
  in JS with nothing to shim, and the VL brain survives the H-M2 Rust-host teardown unchanged.
  Two things to settle, one now decided:
  1. **Sequencing — DECIDED: `vl test` lands BEFORE the std expansion.** The charter's "v1 lands with
     std-design slice 4" is **superseded**; `std:testing` comes out of slice 4 as its own unit. The
     reason is the owner's stated preference — a real test runner and assertion library must exist
     before std grows, so every std addition arrives with tests written in VL rather than TypeScript.
  2. **The genuine gate is the failable-IO story, not the ABI.** The VL-side walk consumes fs
     primitives, so `std:fs` must exist, and `std:fs` is **gated on `docs/error-handling-design.md`
     (`T | E` with a structural `IoError = { code, msg }`) which is DRAFTED, PENDING OWNER REVIEW**.
     That review is the critical-path item. Note also `std-design.md` files `std:fs`/`std:args`/`std:io`
     as "WASI-era additions" — reconcile with (a) browser execution and (b) webcraft's explicit WASI
     non-ask: the primitive set should be host-neutral (`listDir` is deliberately shaped as
     `fd_readdir` so the VL walk survives a WASI transition with only the transport changing).
  Motivation is independently strong: **all 38 test files are TypeScript/Deno today**, so the language
  cannot test itself and Track J has no on-ramp. The runner is also *"the first nontrivial VL program
  (not compiler module) in the tree"* — demand-driven dogfooding.

- ⬜ **Host ABI for VL scripts (dogfooding).** *Not* a test-runner blocker (above) — this is about the
  12 shell scripts. VL programs today can **compute and print, nothing else**: the entire import
  surface is seven print builtins, so `scripts/fuzzgen.vl` writes to stdout and the shell splits it,
  and `fuzz-vl.sh` passes parameters by **sed-rewriting the VL source before compiling it**
  (`s/^let RICHVALUES = .*/let RICHVALUES = $VALUES/` — rename that `let` and the flag silently stops
  working). Value order: **(1) `argv`** (kills the sed-patching); **(2) file read/write**;
  **(3) directory listing**; **(4) process spawn + exit code + captured stdout/stderr** — which is what
  unlocks the orchestrators, since `refresh-compiler.sh` / `rep-fuzz-check.sh` / `native-fixpoint.sh`
  exist to run the compiler and compare; **(5) `env` + `exit`**.
  **Cost to name up front: every new import must land in THREE hosts** — `scripts/vl-host/src/main.rs`,
  `tests/support/runWasm.ts`, `scripts/wasmtime-host.rs` — plus the declaration in `compiler/wasmEmit.vl`.
  Miss one and a script runs under the CLI and fails under `deno task test`. Keep the ABI tiny, land it
  as one batch. These are the same syscalls a `vl` CLI written in VL needs, so it is step 1 of Track H.

- ⬜ **`match` over ALL unions, not just literal unions.** Verified at `cd69bd9`: a litunion scrutinee
  works, and both other union kinds are rejected by the checker —
  `match scrutinee must be a literal union, got {c: i32} | {d: i32}` and `…got i32 | string`. The
  workaround is an `is`-chain, which works but is not exhaustiveness-checked — so the one property that
  makes `match` worth adopting in the compiler's own kind ladders (a missing arm is a *compile* error,
  not a runtime "no interned slot") is exactly the property unavailable on the unions the compiler
  actually uses. This is the load-bearing dependency under the kind-numbering collapse below, which
  currently reads "make sure that surface is actually load-bearing enough to carry rep code first" —
  **it is not, yet, and this is why.** Needs: scrutinee admission for struct/scalar/mixed unions in
  `typecheck.vl`, arm patterns that bind the narrowed type (reusing the `is` narrowing machinery), a
  tag-switch lowering (the union box already carries a tag — `is` chains re-test it linearly), and
  exhaustiveness over the member set (which is now a real data structure, `unMemTys`/`unMemberSet`).
  **Distinct from webcraft's P2 "match phase 2" (variant payload binding, `Move{x,y} => …`)** — that
  extends the *arm*, this extends the *scrutinee* — but they share the narrowing and lowering work, so
  do them adjacently and let phase 2 ride the tag-switch this lands.

> **#2 priority — drive the rep-composition fuzz baseline to 0** (`scripts/rep-fuzz-baseline.txt`;
> item 2 below). Every remaining entry is a fail-loud REJECT — a coverage gap the compiler refuses
> cleanly, never a miscompile — so this is *finishing the implementation of the language surface we
> already accept*, not new features. As of 2026-07-19 it is **17** (from 199 earlier the same day;
> `docs/internals/rep-fuzz-findings.md`). The residual is the deepest tail — nested
> closures×maps×arrays×unions at depth 4-5 — which is exactly where the parallel kind-numbering
> (below) hurts most, so the burn-down and the `repOf` rewrite reinforce each other.

- ⬜ **Dogfood `match` + literal-unions to collapse the kind-numbering (use the surface we HAVE).**
  The recurring authoring pain (evidence: the depth-4-5 burn-down tail) is that rep families are
  *stringly-typed* (`"nullist"`, `"nuli64list"`) and *bare-i32 field codes* (18/28/29/30…), enumerated
  in **parallel switch ladders that must stay hand-synced** — `fbValtype` / `fbValtypeNullable` /
  `fbRefNullForKind` / `fbHeapIdxForKind` over one kind set; `fieldTypeCode` / `nameFieldCode` /
  `anonFieldCode` over another. The dominant slice failure mode is "forgot the arm in ladder N," found
  only at runtime as "no interned slot." **VL already has literal-union types + a working `match`
  (A16/B21 phase 1) — adopt them in the compiler's own rep/kind code** so a missing arm is a
  non-exhaustive-`match` *compile* error, not a runtime hole. Order: (1) make sure that surface is
  actually load-bearing enough to carry rep code first — `match` exhaustiveness (A-exhaust / B21) and
  literal-union ergonomics fully implemented and dogfood-tested; (2) migrate the kind ladders to a
  single `match` over a literal-union of kinds, opportunistically as the `repOf` rewrite touches each.
  **Step (1) widened in B21 phase 2a**: exhaustiveness-checked `match` is no longer literal-union-only
  — it covers struct / scalar / mixed / `| null` unions too, so a ladder keyed on a VALUE union (the
  `Ty` arena's own shape) gets the same missing-arm compile error a litunion ladder does. The one
  union kind still outside it is a union with LITERAL members (`0 | 1 | 2`): an arm's test would be
  `n is 0`, which does not lower — see B21 below.
  Deliberately NOT building new enum/ADT machinery yet — only if adopting today's `match`+union
  surface proves insufficient. Related: carry structured `Ty` through codegen instead of
  round-tripping through emit-name strings (the `tyToEmitName` `K0→string` softening caused an
  invalid-wasm this session; `splitUnionAtoms` paren-depth was the same class) — subsumed by the
  `repOf(type)→descriptor` rewrite (item 3, which already derives from the `Ty` arena).

- ⬜ **Emitter rep architecture — reduce the structural↔nominal / kind-scheme special-casing.** The
  recurring smell (see `DECISIONS.md` if expanded): the checker is **structural** (`{x:i32}`), the
  emitter is **nominal** (keyed by name in `structIndexByName`/`rlSlotByName`), and the same wasm rep
  families are enumerated in **3+ numbering schemes** (`vtKind`, `sigKeyRetKind`, mf-result-kinds) with
  translation functions between them. Plan, in order of leverage:
  1. ⬜ **Structural-tolerant emitter (incremental, low-risk).** Migrate nominal-only resolvers to the
     structural-aware `structIndexOfTypeName` (tries nominal first, then field-set match) so the
     structural→nominal bridge is centralized, not re-added per consumer. Do it opportunistically when
     touching a site; gate each step (fixpoint + corpus + suite). Migrating a resolver is
     behavior-preserving for nominal names (`structIndexOfTypeName` tries `structIndexByName` first) and
     only ADDS resolution for structural shapes — so the gate validates safety even where the fixpoint
     (i32-only) can't. **First target — inline-shape nested struct field — DONE (#665):**
     `collectNestedFieldShapes` pre-pass + `fieldTypeCode`/`fieldRefElemName` resolving via
     `structIndexOfTypeName`. The remaining `structIndexByName` sites stay nominal-only for now — migrate
     each opportunistically when a structural name actually reaches it (premature otherwise: today they
     all receive nominal names, so a blanket swap is a no-op with risk).
  2. 🟡 **Rep-bug burn-down — THE #1 PRIORITY (drive to 0).** ✅ **Soundness milestone holds:** every
     unsound class (INVALID-WASM, TRAP, MISMATCH) is **0**; the check is EXACT/bidirectional
     (`scripts/rep-fuzz-check.sh`: soundness never baselineable, new rejects + stale entries both
     fail). Wave history in `docs/internals/rep-fuzz-findings.md`. **As of 2026-07-19 the baseline is
     17** (a broad 16-seed net; down from 199 the same day — a session that graduated the map-reader
     value-call path (former item (c)), the nullable-scalar & nullable-list families (former item (d)),
     nullable-litunion/f32 struct fields, f32/f64-list value atoms, variant composite-field boxing,
     closure-result composite/nullable/map results, array-of-(nullable-)closure elements, and several
     hand-found TRAP/INVALID-WASM fixes the fuzzer never generated). REMAINING (coverage, not
     soundness) is the DEEPEST tail — depth-4-5 compositions such as
     `{[string]: {a, f: (i32) => (() => {[string]: i64}), z}}` (map→struct→closure→closure→map) and
     `(((i32) => f32)[] | i32)[]` (closure-array-under-union in an array) — several of which resist
     point-fixes and want the recursive `repOf` rewrite (item 3) + the `match`/kind dogfood (above)
     rather than another parallel-ladder arm. Keep graduating baseline shapes as fixes land; when the
     list empties the fuzzer is at true zero over the wide net.
  3. 🟡 **`repOf(type) → descriptor` unification (the "rewrite") — strangler, in progress.**
     Foundation SHIPPED (→ `CHANGELOG.md`): `emit_rep.vl`'s `RepDesc` derived table-driven from the
     `Ty` arena (cycle-safe: kind arms recurse ≤1 wrapper level; generation-stamped visited marks),
     with the print-import scan exact, `vtKindOfType` delegated, the `$fnsig` seam COMPLETE
     (one token vocabulary; keys mint AND decode only through it — `repSigSlotTokOfKind`/
     `repSigTokHasSlot` on the encode side, the single `sigKeyRet*` result decoder on the
     consume side; `repLegacyCodeOfKind` and every per-site digit/char parse deleted —
     → `CHANGELOG.md`), and the `fRet*` fold COMPLETE (every per-family flag table folded
     into the stored `fRetKind: VKind[]`; `inferredRetKindCore` is a plain read —
     → `CHANGELOG.md`).
     The SLOT layer (item (b)) is COMPLETE — structural heap-type dedup by canonical layout
     across ALL FOUR name-keyed tables: STRUCT (`repCanonKey` → `sTwin` → shared `sHeapIdx`),
     REF-LIST (`rlTwin` + the inline-shape spelling bridge), MAP-VALUE (`mvTwin` + the
     canonical tag/arm seam `mvCanonRepOf`), and VARIANT (`buildVariantTwins` →
     `uVarTwin`/`uVarHeap`, retiring the arithmetic `uVarIdx + vi` heap identity) — see
     `DECISIONS.md` + `CHANGELOG.md`.
     Rep-rewrite Stage A SHIPPED (audit Part III Phase 2 items 3–4, the foundation; →
     `CHANGELOG.md`): the RECURSIVE `Rep` tree — `repTreeOfTy`, TOTAL over the post-mono
     arena (every type gets a tree or an explicit `unsup(reason)` policy node; hash-consed
     index-linked arena, cycle-safe, generation-stamped like #917's memos) — plus the
     `$VL_REP_SHADOW` differential harness (tree vs flat on every `rdCovered` fact; corpus +
     self-compile + 16 pinned fuzz seeds + a branching/declared/multiobs survey sweep with
     ZERO disagreements) and the per-compile coverage report (the Stage B burn-down buckets).
     Stage B WAVE 1 SHIPPED (→ `CHANGELOG.md`): (b1) litunion alias PROVENANCE on the
     arena (mint-site stamps + `tyLitUnionAliasIx`; the alias-copy half of the
     `litunion:noalias` bucket is real atoms now — the residue is inferred literal-JOIN
     unions, context-dependent by design, correctly policy nodes), the three #920
     flat-path irregularities reconciled (arity-aware variant-member registration; the
     bare-array litunion arm provenance-widened to match the nullable twin; the inline
     positional asymmetry documented as the canon pass's intended policy), and the FIRST
     consumer migration: `repOfTy` is tree-PRIMARY (kind/nul/list-elem are the tree's
     projections wherever the flat arms claim coverage; flat still owns coverage + the
     nominal slot, and shadows the tree under `$VL_REP_SHADOW` — the Stage A direction
     inverted).
     Stage B WAVE 2 slice 1 SHIPPED (→ `CHANGELOG.md`): the R1 map-valued-FIELD seams —
     mono-ness at `mvSlotOfValNameFind` decided by the interner's own classifier (atom /
     niche map fields ride the mono map), the shape-text variant seam records + interns
     code-19 field value slots (map-in-union-arm lowers), the narrowed-member map
     receiver resolves through the variant field tables, and the field-set matchers
     (`objVariantName` / `shapeFieldTypeCompat`) are map-VALUE-rep tightened so twin
     name-set arms with different map values never collide. Baseline 273 → 255 (18
     graduations, 4 pinned tests).
     Stage B WAVE 2 slice 2 SHIPPED (→ `CHANGELOG.md`): the R1 map-in-list-in-union seam
     (`{[string]: V}[] | X` constructed from `[h]` map-binding literals) — the array
     literal routes through the ARM's build (`unionRefArrayArmSlotForMapElem` picks the
     arm by canonical value rep, the arm's reflist slot threads the build, the wrapper
     tags with the arm's slot tag) and the frame pre-pass reserves the map scratch
     narrowing-blind for the `t[i][k]` read shape. Baseline 255 → 249 (6 graduations,
     1 pinned test).
     Stage B WAVE 2 slice 3 SHIPPED (→ `CHANGELOG.md`): the R1 union-variant FIELD kinds
     (the "only iN/boolean/string/array union-variant fields" bucket) — nested-struct
     fields (code 15) accepted on the inline-shape variant path (`variantNestedShapeOk`,
     the pure `internInlineShape` mirror; `collectA` interns the deferred target), field
     UNIONS of union-arm shapes pre-registered (`registerVariantArmFieldUnions`, before
     the outer union's rows so slices never interleave), the construct seeds
     `pendingStructIdx`/`pendingMapSlot` (the `emitObj` discipline) with the target
     union's OWN arms picked first (`unionArmVariantForObj` — the cross-union name-set
     collision), `structIndexOfExpr`/`memberUnionFieldName` resolve narrowed/variant
     receivers (the latter narrowing-BLIND for the frame pre-pass, `nodeTyIsUnion`-gated),
     `callRefSlot` reserves for member-chain closure callees
     (`calleeIsUnionArmClosureMember`), and the member-STORE scalar widening
     (`emitScalarFieldStoreVal` — the pre-existing `p.g = 9` i64-field invalid-wasm, flat
     and nested). Baseline 249 → 221 (28 graduations, 4 pinned tests).
     Stage B WAVE 2 slice 3b SHIPPED (→ `CHANGELOG.md`): map-through-closure-result in
     union arms (`forceCloResultMapTypes` — the collect-scan forces the map machinery +
     interns the value slot from a union arm's / nullable-closure's / curried closure
     RESULT, the R2×R1 combo; a value-union result stays deliberately un-forced/loud).
     Baseline 221 → 220 (1 graduation, 1 pinned test).
     Stage B WAVE 2 slice 3c SHIPPED (→ `CHANGELOG.md`): the nulclosure-sig R2 family
     (`collectCloSigs` interns the inner closure key from every nulclosure annotation
     TypeRef; `collectFnValUse` flips the machinery for kind 19 — a null-only caller's
     narrowed call now finds its sig) + repOf item (d), the closure-value-call ref-arm
     union-result narrow (`refArmUnionRetName`: adopt + record + pin + `nodeUnionName`
     resolve — one renderer, producer and consumer agree). Baseline 220 → 213
     (7 graduations, 2 pinned tests). Residuals stay loud: list/curried/value-union
     nulclosure RESULTS (collection/sig seams still unminted), the no-lambda decoy-only
     ref-arm union spelling, and the anonymous-element ref-arm unions behind the #911
     declared-twin gate — widening the gate was ATTEMPTED and REVERTED: the structural
     producer pin turns the construct-only fuzz line
     (`p2c ((i32) => {f: boolean}[] | {w: i32}) | f64`) PASS → REJECT because
     `emitReturnValue`'s union-arm matcher cannot box an anonymous-element reflist arm
     ("array value does not match any array member"), so the gate holds until that
     boxing seam lands.
     STAGE B remaining charter (consumer migration, family-by-family, each PR gated by
     fixpoint + corpus + rep-fuzz + the shadow sweep): (b2, REMAINING TAIL) typed-value
     maps in composition (R1) through `Map(val)` trees — the still-loud
     nested/nullable-value policy set (each stays rejected until its
     rep is genuinely minted); (b3, REMAINING TAIL) nullable-list-in-field /
     struct-through-list (R5/R6, compositional once consumers read the tree — the R4
     2-D-array half SHIPPED: the family dissolved through the existing composed
     machinery, → `CHANGELOG.md`); (b4) closure
     composite results via sig keys interned from `Closure(params, result)` nodes (R2);
     (b5) value-union composite members (R3b/R7 — the genuine ABI-policy cluster); then
     migrate `vtKindOfType`/the valtype ladders onto `repTreeVKind` and delete the flat
     `RepDesc` when its last consumer moves.
     REMAINING legacy items: (a) widen `repOfTy` coverage (typed-value maps,
     litunion/union-element arrays — subsumed by Stage B above); (e) the variant⇄struct-table seam: a DECLARED struct twin
     flowing into a variant-arm position (`pickU(k: Kot)` where `U = Cat | Dog`, `Kot`≅`Cat`)
     still fails validation — the box/`is` resolution is nominal (`variantIndexOf`) and
     `uVarHeap`/`sHeapIdx` do not dedup across the two tables — and an inline-shape union arm
     (`type U = {m:i32} | Dog`) rejects a declared-name `is` spelling (`u is Cat`); both are
     loud, and the fix wants the #911 declared-twin-gated bridge at the variant resolvers.
- ✅ **Kill the TS host. DONE — the TWO COMPILERS are now one.** The TS compiler core
  (`compiler/*.ts` front end + `cli.ts` + the `checker-parity-sweep.ts` oracle) is DELETED; the
  self-hosted `compiler/*.vl` (the wasm seed) is the sole compiler. Got here in stages:
  0. ✅ **Corpus oracle flipped off the TS compiler.** `cases_wasm_test.ts` (seed under deno) is
     the sole corpus oracle, run in `ci-native`; the TS `cases_test` runner is gone.
  1. ✅ **LSP-on-wasm.** `server.ts` is wasm-only (the `vital.checker: ts|both` modes + their
     live parity instruments removed). The batch parity sweep reached accept/reject VERDICT parity
     over the corpus and was retired; the residual 81 span/ergonomic deltas are recorded in
     `docs/internals/vl-tech-debt.md` (native is the spec now — "match the TS span" is no longer a goal).
  Follow-through that outlived the TS kill (separate, still open):
  - ⬜ Delete the gated deno-side RUN half + its 305-file whitelist outright (see F-tiers).
  - ⬜ `std:` Phase 2 (H0) written in VL — DESIGNED: `docs/internals/std-design.md` (the `std:` scheme,
    hybrid delivery, the two-primitive intrinsic floor + `__trap__`, slices 0–6 with gates; six
    open decisions flagged for the maintainer). Doubles as the demand-driven discovery engine
    for the remaining emitter long tail (each gap fails loudly).
  - The `.vl` compiler is now the spec, so the parked soundness xfails (arith-hole-operand — A13;
    array-element-recursion — i32-keyed maps) are fixable bugs, not parity constraints.
- ⬜ **`vl test`.** DESIGNED: `docs/internals/test-runner-design.md` (jest-shaped `describe`/`it`/`expect`
  over `std:testing`; two-phase registration, host-driven `vlt*` protocol; `*.test.vl` discovery
  + configurable globs; files parallel by default / in-file serial, opt-in fresh-instance
  `it.concurrent`; per-test capture, failure-first reporting). **v1 lands BEFORE the std expansion,
  not with std-design slice 4** — the charter's sequencing is superseded (see the promotion note under
  Next); chartered follow-ups: compiler-injected call sites, generic `expect<T>` + structural diffs,
  power-`assert` rewriting. New behavioral tests switch to `*.test.vl` at v1 (directive-corpus
  growth stops; conversion waits for the TS-tier teardown).
- ⬜ **Error-handling design** — DRAFTED, pending owner review: `docs/error-handling-design.md`
  (errors-as-values via unions — `T | null` for absence, `T | E` with a structural `IoError`
  alias for reasoned failure, traps (`__trap__(msg)`) for bugs; no catchable throw in v1, `exnref`
  reserved for a possible async era, Go-style multi-value returns ruled out; union-`as`
  propagation (`x as T` narrows-or-early-returns the remainder, under a unified `as`
  principle) chartered as follow-up; fallible std sequenced after the R3b/R7 rep family). Settles the
  failure story BEFORE std grows fallible APIs (`std:fs`, parsing). Until it lands, std ships
  only total functions + `__trap__` aborts (std-design D1). Seven open questions (O1–O7)
  flagged for the maintainer.
- **Explicit numeric conversion syntax** — the lossless-only implicit-widening rule (#298) makes
  the lossy edges (`i32→f32`, `i64→f64`, all narrowings) EXPRESSIBLE ONLY via a cast that does
  not exist yet; design + land it (both compilers).
- **Param-skip ergonomics** (`docs/guide/lambda-param-skip-design.md`) — prerequisite 1 (self-host
  lambdas/HOFs) is nearly satisfied; decide leading-comma vs `$#` (recommendation deliberately open).
- **C5 / H-M1** — `deno compile` + brew tap. Small, decoupled; ships the distribution story now.
- Smaller/independent: A-robust holes (`Map()`/`Set()` empties, generics), A-exhaust codegen elision,
  B6b collections building blocks, B13 callable objects, B17 lint backlog, A6b Stage A.

---

## Track A — Type system (`typecheck.vl`)
*Blueprint: Elixir v1.20 set-theoretic types, fully-typed (no gradual escape hatch).*

- 🟡 **A4. Negation types** (`!A`). REMAINING: full open-world negation tracking (needs A12).
- 🟡 **A5. Flow narrowing.** REMAINING: `case`/multi-guard (no grammar); stored-witness (A6b Stage B);
  optional *call* `x?.f()` + chain short-circuit `x?.y.z` (use `x?.y?.z`); per-call
  reachability-pruned return types (blocked on memoize-with-holes — see `docs/guide/narrowing.md`).
- 🟡 **A6. `is` operator + tagged unions.** REMAINING: `ref.test` fast-path for ref-vs-ref; union
  arrays (`[boolean | i32]`); declared type-guard signatures (A6b Stage A).
- 🟡 **A6b. Proof-carrying narrowing (type guards as values).** REMAINING — **Stage A:** richer
  discriminants (`if bar(x) is null`), multi-input correlation, declared (verified) predicate
  signatures. **Stage B:** stored witness (`const f = bar(x); … if f is null` narrows x) — needs
  binding tracking + invalidation (a lightweight borrow). Stage B also subsumes per-call tight return
  types (the forward direction of the same correlation).
- ⬜ **A8. Exact / Inexact variance.** Params Inexact by default (accept excess properties), values
  Exact. Guards the `a.foo = b` width footgun. (TODO.md)
- ⬜ **A9. Readable / Writable variance.** Applied automatically during parameter inference. (TODO.md)
- 🟡 **A10. Parametric types / generics.** REMAINING: same `map`/`filter` generics for `Map`/`Set`
  (B6a); **const generics** (numeric/value type parameters, e.g. `Decimal<10, 8>` /
  `Buffer<N>`) — today generics take *type* params only; enabler for the parameterized
  `Decimal<Backing, Scale>` family (B2) and any fixed-size/parameter-by-value type.
  (Forward/mutual-reference return-type inference: shipped as A17 — see `CHANGELOG.md`.)
- 🟡 **A12. Soundness corpus.** REMAINING: keep growing it; the known-unsound corners are
  `xfail`-marked (e.g. the permissive `i32 + string` hole rule, A13). The SELF-HOST checker's
  soundness floor (15 false-accept classes) is closed; new classes go straight to corpus +
  both checkers.
- 🟡 **A13. Operator-constraint inference.** REMAINING: the hole-operand rule is permissive (doesn't
  reject `i32 + string` yet); the *stored-closure* operator case (`vec + vec` via a `"+"` field)
  still hits the WasmGC width wall (B13).
- 🟡 **A14. Named/opaque types.** REMAINING: real **nominal/opaque types** (decision: clean-error-for-now → `DECISIONS.md`).
- 🟡 **A15. Equality.** REMAINING: a referential-identity operator (`===` / `identical`, O(1) `ref.eq`);
  `boolean`→i32 coercion when storing a comparison result; SELF-HOST struct/function-value equality
  (guarded loudly today — and note the `call_ref`-ABI wrinkle: funcrefs admit no `ref.eq`, so
  function-identity compare needs an identity token on the closure struct).
- 🟡 **A16. Literal-union types.** REMAINING: the **enum representation** (i32 tag for a closed
  literal union — see `docs/guide/unions.md`); a literal union read *inside* a body softens to base
  (coarser member-narrowing there than at the call boundary).
- ⬜ **A17 follow-up: `never` inference + `unconditional-recursion` lint.** A17 demand-driven inference
  is shipped. REMAINING: (a) infer `never` for a genuinely base-case-less divergent recursive cycle
  (currently a stopgap "annotate a return type" error); (b) an `unconditional-recursion` lint that fires
  even when the return type is explicitly annotated (catches accidental infinite loops).
- 🟡 **A-infer-empty. Usage-based inference for empty collections.** Empty ARRAY `[]` inference shipped
  (see `CHANGELOG.md`): `const xs = []; xs.push(1)` infers `xs: i32[]` from downstream usage (push /
  `T[]` param / annotated assignment / `T[]`-returning tail / index-set). REMAINING: the same for
  `Map()`/`Set()` — infer key/value/element from `m.set(k,v)` / `.add(x)` later usage; the `Map()`/`Set()`
  hole isn't yet materialised into a `{[K]:V}` object by `.set`/`.add`.
- ⬜ **A-infer-null. `let x = null` as a nullable hole.** Treat `let x = null` like `[]`: infer the `T`
  in `T | null` from later usage (`x = 5` ⇒ `i32 | null`), the initializer contributing `| null`, with
  flow-narrowing stripping the `| null` on definitely-assigned paths (no null tax on the straight line);
  an unconstrained `let x = null` resolves to `null`. Today `let x = null` pins `x` to the exact `null`
  type, so `let x = null; x = 5` errors. Distinct from a pin violation — `null` is hole-bearing, not a
  complete type. Ties A-infer-empty (same usage-driven hole-filling) and A-definite-assign (shared flow
  machinery). (Rationale: DECISIONS "`let x = null` is a nullable hole".)
- ⬜ **A-infer-params. Top-level function param inference.** Infer named-function param types from
  usage constraints (HM / the existing A13 row-poly inference path), consistent with "hide types where
  possible." Requiring annotations on all named-fn params is NOT VL's stated stance.
- 🟡 **A-exhaust. Exhaustiveness analysis for `is`-chains.** Dead-arm flagging and omit-the-`else`
  return-coverage shipped. REMAINING: **codegen** — elide the provably-true final discriminant test +
  drop the dead arm (a type-driven optimization binaryen cannot do; runtime already correct via the
  no-`else` `unreachable` fall-through; pure size/speed, deferred).
- 🟡 **A-robust. Robustness floor.** An unresolved `Infer`/`Unknown` type must produce a clear
  **"cannot infer — annotate"** diagnostic; it must NEVER surface as a cryptic `Unhandled "Unknown"
  type` codegen error or a `containsInfer` TypeError crash. The main trigger — `const xs = []; xs.push(1)`
  — is fixed (A-infer-empty now infers it, and the "cannot infer — annotate" floor is deferred to
  scope-close so it fires only for a genuinely-unconstrained empty). REMAINING: audit the other holes
  (`Map()`/`Set()` empties, unresolved generic params) for the same clean-diagnostic-not-crash guarantee.

---

## Track B — Codegen, memory model & runtime (`wasmEmit.vl`)
*Allocation = WasmGC; binaryen stays (it doesn't block self-hosting). → `DECISIONS.md`.*

- 🟡 **B2. Numeric codegen.** Hex/octal/binary literals + digit separators: SHIPPED (see
  `tests/cases/literals/`). Self-host i64/f64/f32 scalars, `f64[]` arrays, the
  lossless-only implicit-widening matrix, and explicit `x as T` numeric casts (every
  direction — the lossy widenings, narrowings and trapping float→int; see `CHANGELOG.md`):
  SHIPPED (#290–#298). REMAINING: **arbitrary-precision `BigInt` and a `Decimal<Backing,
  Scale>` family** as future `std`-library generic types (not primitives). Prereq: const
  generics (A10).
- 🟡 **B5. Objects.** REMAINING: methods via `self`+UFCS (B14); typed literals in object values
  (`{n: 4<i64>}`); Exact-by-default for values (A8).
- 🟡 **B6. Collections — growable `T[]`.** REMAINING: in-place bulk append (deferred — will be
  `xs.push(...ys)` once variadics land); representation inference (§VL.7 — lower never-grown
  values to a header-less fixed array); `map`/`filter` build-side generics for `Map`/`Set` (A10);
  `.vl`-std migration once a module system exists. (design: `docs/guide/collections-design.md`)
- 🟡 **B6a. `Map` + `Set`.** REMAINING: **i32-keyed Map/Set** (clean diagnostic for now — i32 keys
  use `T[]`); `for k in map` direct iteration (parser; use `.keys()` today); `map`/`filter` over
  Map/Set (A10); clean diagnostic polish for unannotated/used `Map()`. (Self-host native parity:
  string-keyed maps, delete, `Set`/`.add`/`.get`, and ref-valued maps (string/struct values, #319)
  landed; map-typed params are the remaining native map gap.)
- ⬜ **B6a-opt. `Set` drops the unused `vals` array** (LOW priority). A `Set` is emitted as a
  boolean-valued map, so it carries a `vals` array that is always `true` (~17% of a Set's memory +
  needless alloc/grow/`array.copy` on resize). The type already tracks `mSet` (a Set is distinguished
  from a real `{[string]: boolean}` Map, which genuinely needs `vals`), so a Set can leave `vals`
  null and skip the vals-touch in new/add/compact/rehash (~5 `mSet`-gated sites). Memory/perf
  refinement, behaviorally invisible; would intentionally diverge from the host (which keeps `vals`
  for sets) as a justified improvement, not a regression.
- 🟡 **B6b. Collections building blocks & open items** (all detail in `docs/guide/collections-design.md`).
  - ✅ **Prerequisite intrinsics** — `__array_new__`/`__array_new_default__` + bulk `__array_copy__`
    (+ `__trap__`, std-design D1), thin `defaultScope`/typecheck.vl intrinsics lowered inline in both
    emitters, monomorphized per element type (native: i32/boolean/f64 element reps; ref/string
    elements fail loudly — emitter long tail). Corpus `tests/cases/intrinsics/`.
  - **Std-over-primitives** — write the collection (and opportunistically `print`) as `.vl` std, not
    compiler-privileged types (ties to H3 / H0 phase 2 `std:` scheme).
  - **Indexing perf** (DECIDED resolutions; sub-choices open) — native-indexing flag (drops B13
    indirect call), backing-pointer hoisting (LICM), bounds-narrowing.
  - **Representation inference** (DECIDED direction; open compiler work) — infer fixed-array vs
    growable rep from usage; interprocedural + alias-unioned; co-design with variance (A9).
  - **Naming & forcing surface — UNCOMMITTED** — `T[]` + inference is the committed surface; names
    `List`/`Array` and any annotation to force a representation are deliberately open.
  - **Language-wide, still open** — value-vs-reference (default reference), error model.
  - **Deferred** — per-frame pooling; user-facing low-level array escape.
  - **Remaining open questions** — capacity/seed construction spelling; `map`/`filter` return type.
- 🟡 **B7. Strings.** REMAINING: switch backing to `(array mut i16)` + `wasm:js-string` builtins
  (bulk JS-host interop — dart2wasm/Kotlin-Wasm style); UTF-8/i8 packing (size); richer methods.
  **Strings direction:** `docs/guide/strings-design.md` — long-term UTF-8 internal storage,
  code-point-indexed API made O(1) for the ASCII common case via an ASCII fast-path flag; strings
  immutable. Ties A7. **Third argument for the i8 packing, beyond size:** wasmtime's
  `ArrayRef::new_from_i8_slice` (memcpy a host byte slice straight into a GC array) is i8-only, so
  `(array i8)` is what lets the host stage source in ONE call instead of ~3.4M — see B-mem. Weigh
  against the loss of word-at-a-time scanning (`memory-gc-design.md` §2.2).
- 🟡 **B8. Loops.** REMAINING: `for…in` over objects/maps; `for val, i in arr` and `for , v in obj`
  destructuring forms; **expression `step`** on a counter range (`for i = 1 to 5 step i * 2` — a
  multiplicative/variable step, not just a const increment), distinct from the const-step
  build-loop-fusion descriptor (DECISIONS) and the `step 0` lint (B17);
  **float for-range bounds** (`for i = 1 to 1.5` — today bounds must be i32; open up to f64, maint.
  note on #377); **user-defined iterators** (`for x in <anything>` via an iterator protocol, so
  `for…in` is not array/map-only — maint. note on #377).
- ⬜ **B12. `async`/`await`.** Keywords lexed; no semantics/codegen. Large; likely last.
- 🟡 **B13. Well-known-symbol dispatch.** REMAINING: callable objects (`"()"`).
- ⬜ **B13a. Multi-index matrix idiom** (low priority). Single-bracket `m[i, j]` → multi-arg
  `"[]"`/`"[]="` + flat-backed `Matrix`/`Grid` type. Nested `m[i][j]` already composes today.
- 🟡 **B14. Methods via explicit `self` + UFCS.** REMAINING: route operator dispatch (B13) through
  self-methods; `c.area` (no `()`) as a bound value; mutation/variance (A9).
- 🟡 **B15. Lambdas + declaration-vs-value.** SELF-HOST function-value ABI shipped (#306: `call_ref`
  + closure struct, non-capturing + capturing; design `docs/internals/selfhost-lambdas-design.md`); escaping
  closures + function-valued struct fields shipped (#310); `.map`/`.filter` EMIT is the next slice
  (see Next). REMAINING (host): **untyped** lambdas (a stored closure has one signature — needs
  pinning-by-use or boxing).
- ⬜ **B15a. Optional params + default values.** Wanted (owner, 2026-07); neither parses today
  (`p?: T` and `p: T = e` are both parse errors — verified). Design intent: **defaults subsume
  optionals** — VL has real `null` unions, so `p?: T` is sugar for `p: T | null = null`; one
  mechanism, two spellings. v1 = **direct-call-site sugar only**: the callee keeps full arity and
  the checker/emitter fill omitted trailing args with the default expression at each direct call;
  function VALUES keep the full signature (the `$fnsig` closure ABI is untouched — do NOT multiply
  rep signatures; that seam is mid-rewrite). Sequencing: after the rep Phase-2 `$fnsig` interning
  wave, since both touch call classification. Intrinsics don't wait on this — `__trap__(msg?)`
  (error-handling-design.md) is bespoke checker arity, like existing builtins.
- ⬜ **B16. Redeclaration / overloading.** Current: same-scope redeclaration errors; nested shadowing
  allowed (uniquified in codegen). Future: ad-hoc overloading? Default "no" → `DECISIONS.md`.
- 🟡 **B17. Diagnostics + lint.** BUILD OUT — the lint rule backlog (a few at a time). Shipped (see
  `CHANGELOG.md`): prefer-`const`, unused-import, dead/constant branch (`constant-condition`), `step 0`
  (`for-step-zero`), unreachable-after-return / -break / -diverging-if/else, unused function,
  match-arm coverage via the unified lint walker, binding-keyed use tracking. REMAINING:
  - **division by constant zero** — a literal / constant-foldable zero divisor: hard **error** for
    integer division (`x / 0` WILL trap at runtime — wasm `i32.div_s`), **warning** for float
    (`0.0 / 0.0` is a defined quiet NaN per IEEE-754, but a literal zero divisor is almost always
    a typo). Runtime semantics stay untouched (int: trap; float: IEEE NaN/±inf — the standard
    modern-language split). Precedent: the `for-step-zero` lint.
  - **discarded call result** — a non-void call whose result is silently dropped at statement
    position (`work()` for an `(): i32`) is likely a bug; warn (with an explicit-discard escape
    hatch TBD, e.g. `_ = work()`). Codegen correctly emits `drop` today
    (`tests/cases/statements/discarded-call-return.vl`); eliding a provably-pure dropped call is
    binaryen `optimize()`'s job, not ours. (Very low priority.) An intentional bare assignment
    STATEMENT (`x = 5`) is fine and never warns — assignment-as-expression yields the RHS by
    design (→ `DECISIONS.md`).
  - **assignment-of-a-literal in condition position** — `if x = true { … }` (especially with
    `x: boolean`) slips past the mandatory-bool condition check because the assignment
    EXPRESSION types as the RHS; an assignment whose RHS is a LITERAL inside a condition is
    almost certainly a mistyped `==`. Warn. (The non-literal form `while (line = next()) != ""`
    is the intended idiom and stays clean.)
  - **per-line / per-file diagnostic suppression** — an `// vl-ignore <code>` (line) /
    `// vl-ignore-file <code>` mechanism so any lint can be locally silenced; prerequisite for
    shipping opinionated lints like the two above. Diagnostics already carry stable `code`s.
    (Low priority.)
  - **LSP quick-fixes** (code actions): "remove unused binding" / "prefix with `_`" / "`let`→`const`".
    Diagnostics already carry stable `code`s; the LSP has no code-action provider yet.
  - Cross-cutting: thread `severity` through all remaining error variants; consistent message style.
- 🟡 **B-mem. Linear memory — make it a design, not a scratch page**
  (design: `docs/internals/memory-gc-design.md`). The collector half shipped (`vl run` on the
  engine's tracing collector + the `$VL_GC` knob). REMAINING, in order:
  - **Audit gaps** — nearly closed. TWO of the seventeen memory builtins declared in
    `typecheck.vl`'s default scope have no emitter lowering: `__store_string__` and
    `__log_string__`, bridges for a `__log__` path the native emitter replaced with an in-module
    decoder, which nothing reaches (`buffer-design.md` O8 proposes deleting both declarations
    outright). The diagnostic half is done — an unlowered builtin is a positioned CHECKER admission,
    not `call to unknown function`.
    *(This bullet used to read "SEVEN of the ten … The store/load matrix is also asymmetric — four
    `__store_*__` widths, only `__load_i32__`." The seven was right; the "four store widths" counted
    DECLARATIONS — measured, only `__store_i32__` ever lowered. Seven loads plus
    `__memory_size__`/`__memory_grow__`, then the three wide stores, have since been lowered, which
    is what moved the count from seven to five to two. It also said "the matrix is now asymmetric the
    OTHER way: eight load widths, one store width" — true until the store slice.)*
    The matrix is now symmetric for every scalar VL has; only the narrow 8/16-bit stores are absent.
  - **Bulk host I/O.** Export `ioMem` and implement the staging ABI `scripts/vl-host` already
    documents and probes for (`<name>Reserve` / `<name>Load`, plus an `rbyte` bulk sibling): today
    source crosses at ONE host call per code point (~3.4M per self-compile) and emitted bytes at one
    call per byte (~1M). **Cheaper alternative to weigh first:** wasmtime 47's
    `ArrayRef::new_from_i8_slice` builds a GC array from a host byte slice in ONE memcpy — no linear
    memory, no `ioMem`, no data section. It is **i8-only**, so it lands free the moment strings are
    `(array i8)` (B7) and not before. Sequencing question, not a fork: if B7 comes first this bullet
    shrinks to a driver-ABI change.
  - **The tier itself** — an allocator (bump/arena), a data section, and the `Buffer`/`Array<T>`
    escape (`collections-design.md` §OQ.7), designed once for FFI / SIMD / bulk-I/O rather than
    accreted as intrinsics. Not a second object model → `DECISIONS.md`.
- ⬜ **B-hint. Emit branch hints** (`wasm-toolchain-audit.md` §4.0). wasmtime reads the
  `metadata.code.branch_hint` custom section to lay cold blocks out of line
  (`Config::wasm_branch_hinting`; off by default until the proposal is fuzzed, so the host opts
  in). Hints are ADVISORY — never semantics — so a wrong hint costs speed, never correctness,
  which makes this the cheapest optimization channel VL has. The emitter already writes a custom
  section (`selfhost-name-section.md`), and the checker already knows what an engine cannot infer:
  `is`-guard arm ordering, null checks the narrowing pass proved, and the provably-true
  discriminants A-exhaust computes. Start with the one-sided cases (a trap arm is cold; a
  `?? default` fallback is cold) and measure before widening.
- ⬜ **B-alloc. Allocate less** (the real answer to GC pressure, `memory-gc-design.md` §4.4).
  Heap2Local on the DEFAULT path (today `wasm-opt` runs only under an explicit `-O`, so the pass
  `DECISIONS.md` leans on is opt-in); representation inference (B6 §VL.7) to drop the
  `{backing,len,cap}` wrapper for never-grown lists; more union-arm niche encodings to drop
  `{tag,value}` boxes; `Set`'s dead `vals` array (B6a-opt).
- ⬜ **B18. Tail-call optimization** (low priority). binaryen 130 has `return_call`; detect tail
  position and emit it.
- ⬜ **B-chore-liststore-fuse. Re-fuse the three split-form list stores in `emit_rep.vl`**
  (one-liner). The indexed-store eval-order fix (the #918 family's LIST twin — `a[i] = f()`
  where `f` reallocates `a`'s backing) landed, but #921's split-form workarounds at the tree
  builders (`rtGo`'s array arm, `rtOfNullable`, `rtOfMap` — comment-marked) must stay ONE seed
  generation: the published seed's store lowering predates the fix (bootstrap ordering, the
  #918 precedent). Once a seed containing the fix publishes, swap each split temp back to the
  fused `rtChild[ix] = …` store.
- 🐛 **B-bug. `while` as the tail statement of a void function crashes binaryen's Vacuum pass.**
  A `while` loop in *tail position* of a `void`-returning function body aborts inside binaryen
  optimization. Workaround: don't end a void function on a bare `while`. Fix: investigate the
  Vacuum-pass input for a result-less loop in tail position (likely a malformed/None-typed block tail).
- ⬜ **B-validwasm. Codegen must emit valid wasm WITHOUT relying on binaryen `optimize()`.** Some
  constructs (nullable-ref narrowing after null-checks, divergent loops, maps/sets, recursive types)
  currently produce valid wasm only after `optimize()` runs. The H4 self-hosted emitter path has no
  binaryen, so codegen must produce valid wasm pre-optimize. Surfaced by the `VL_NO_OPT` experiment;
  prerequisite for H4 / H-M2 (emit-bytes-directly). Audit each construct that relies on binaryen to
  legalize its output and fix the IR-builder to emit legal wasm directly.
- ⬜ **B20. Loops as expressions + `break <value>`.** Lift `for`/`while` into expression position;
  a loop evaluates to its `break` value or `null`. Three layers: grammar → types (mirror the
  `returnTypes` mechanism) → codegen (`__brk` block gets a result type).
- 🟡 **B21. `match` over tagged unions (payload binding).** Phase 1 (literal-union `match`,
  exhaustiveness-by-default — a missing arm is a hard error, à la Rust/Swift) and **phase 2a
  (VALUE-union scrutinees)** have shipped (→ `CHANGELOG.md`; `tests/cases/match/*`). Phase 2a is the
  discrimination half: an arm pattern is a member TYPE (`C =>`, `i32 =>`, `null =>`, `A | B =>`),
  parsed into a real `IsExpr` over the scrutinee, so compiler-enforced completeness now covers
  structural/tagged-union discrimination — the complement to the if-chain coverage check
  (A-exhaust), which cannot demand completeness at all. Every arm binds the narrowed member.
  REMAINING:
  1. **Payload/field BINDING** — `Move{x, y} => x + y`, binding an arm-local name per field rather
     than re-reading through the narrowed scrutinee. The desugar is the extension point: an arm is
     already `if scrut is Move { <body> }`, so a binding arm prepends `const x = scrut.x` statements
     to that block. Nothing about the chain, the narrowing or the emitter has to change.
  2. **Unions with LITERAL members** (`0 | 1 | 2`, `"x" | 7`) — refused at the type tier today
     (`match over a union with literal members is not supported`) because an arm's test would be
     `n is 0`, which the emitter has no rep for (`literal \`is\` over a struct union is not
     supported`, on master too). Two ways out: teach the emitter the literal `is`, or route a
     homogeneous numeric-literal union through phase 1's `==` arm path (its members already
     canon-collapse to the base scalar).
  3. **A `_` written before other arms is silently REORDERED to last** (phase 1 behaviour, unchanged:
     `desugarMatchAt` makes the wildcard the bare `else` wherever it sits, so `match k { _ => a,
     "x" => b }` runs `b` for `"x"`). First-match-wins says `a`. Either honour source order or
     reject a non-final `_`.
  4. **An OR-arm's residual is a pre-existing emitter gap**, not a match one: `A | B => …` lowers to
     `(u is A) || (u is B)`, and reading a field on the complement in a LATER arm hits
     `emitProgram: field access but no struct type declared` — reproducible on master from the
     hand-written `if u is A || u is B { … } else { u.c }`.
- 🟡 **B-debug. Source maps + trap diagnostics follow-ups.** REMAINING: (1) **full source-mapped
  stack traces** — map every wasm frame in the trap's stack → VL `function (file:L:C)`, not just
  the top frame; (2) **value-rich panic messages** — a host `panic(msg)` abort path that formats
  the offending values (e.g. `index 7 out of bounds (length 3)`, `integer division by zero` —
  today both surface as a bare wasm backtrace); (3) an index-assignment LHS has
  no parser span yet — broaden parser span coverage for OOB *write* errors. Also feasible: a
  **REPL** (accumulate-session-source + recompile-per-entry) as a future CLI item.
- ⬜ **B-emitmsg. Human, clear, explainable emit-failure errors.** Codegen/emit failures still
  surface developer-internal phrasing — e.g. a recursion cycle through a nested collection
  (`{ [string]: Tree[] }`) reports `emitProgram: map value type has no interned slot` / `(emit error)`,
  jargon that names an internal data structure rather than the user's mistake. Audit the `wasmEmit.vl`
  error paths and rewrite each into a source-located, plain-language diagnostic that names the
  offending construct and (where possible) the supported alternative — matching the quality bar the
  type-checker diagnostics already hit (cf. the A-track honest-message work). The still-unsupported
  nested-collection recursion shape is the canonical first case (its fixture lives in
  `tests/vl_check_codegen_test.ts`, which deliberately asserts only the emit-stage *marker* so it
  won't pin the wording this item improves). Compile-time analogue of B-debug's value-rich panic
  messages (runtime traps).
- ⬜ **B-repdebug. Rep-resolution introspection for compiler authors.** Diagnosing WHY a composite
  shape rejects — or which parallel kind-ladder is missing an arm — is a manual minimal-repro hunt
  today, the single biggest per-slice time sink in the rep burn-down. Two cheap tools would collapse
  it: (1) `vl check --why-reject <file>` (/ `--explain-rep <type>`) printing the rep-resolution path
  and the exact bail site (e.g. `map value kind → -3 at mvValKindOfName`) — the emit dual of the
  checker's honest messages; (2) `vl build --dump-reps` dumping the interned rep / heap-type table +
  the `mAssignTypeIndices` layout — the heap-index oracle is append-only and invisible, so seeing it
  is the difference between a 30-second and a 30-minute diagnosis. Serves the compiler author, not
  end-users (contrast B-emitmsg, the user-facing message). Adjacent, cheap: have the `.vl` corpus
  runner label WHICH tier failed (run-oracle vs `assertLint`) — a lint-tier fixture-directive bug
  (undeclared `@warning`, or an `@hint` the wasm-lint tier can't emit) reads as a compiler failure
  today and has cost real misdiagnosis.
- ⬜ H3 merge-by-renaming is a bridge — post-parity revisit notes live in native-modules-design.md
  §Post-parity revisit (symbol-based resolution replaces the rename walker).

---

## Track C — CLI (`vl` / `vital`)

*The NATIVE `vl` exists (`scripts/vl-host`, ~150 lines of frozen Rust over wasmtime): `vl build`
(`-O` via wasm-opt) / `vl check` (parse+typecheck only) / `vl run` (incl. `.wasm` passthrough) /
`vl fmt` (`-w`/`--check`, AST-driven via `format.vl` — the sole formatter; the TS `format.ts` is
retired), brains in `build/vl-compiler.wasm`. Iteration: `scripts/refresh-compiler.sh` refreshes the
seed from current `compiler/*.vl` in ~40s.*

- 🟡 **C5. Distribution (public release).** The shipped artifact is now the NATIVE `vl` host with
  the seed embedded (`--features embed-seed`; `release.yml` builds all 5 targets, `build-binary.sh`
  locally) — the `deno compile cli.ts` path is retired. REMAINING: tag / brew tap / sha256 bump
  (the publish job + Formula are drafts) — decoupled from all compiler work, deferred to H5.
- ⬜ **C-cli polish.** `vl build` to stdout when no `-o` (decided: yes, pipe-friendly); WAT output
  (`--wat`, via wasm-tools or wasm-opt); surfacing diagnostics with spans once the spans rungs land.

---

## Track D — LSP / editor experience (`lsp/src/server.ts`)
*Mostly independent; benefits from Track A. AST nodes carry source spans (Track G).*

- 🟡 **D1. Hover types.** REMAINING: flow-narrowed receiver types; Map/Set members (when B6a fully lands).
- 🟡 **D3. Autocomplete.** REMAINING: wiring a completion provider into the Monaco playground (E).
- 🟡 **D4. Formatter.** REMAINING:
  - **Unfaithful-fallback constructs** — reproduced verbatim from the source span rather than
    regenerated: `type` aliases (body & span discarded by the checker), operator-named &
    method-shorthand functions, operator/index-method call desugars. (Trailing comments on `type`
    aliases now stay on their line — #146; functions with a commented expression body now fall back
    to verbatim correctly — #154; the trailing-comment placement fixes — #165/#172/+.)
  - **AST type-syntax fidelity gap** — the typechecker fully resolves every type it records (a tiny
    `i32` annotation becomes a giant structural `Object`; `type`-alias bodies and spans are
    discarded). Retain the *as-written* type syntax (or its span) so the AST is lossless for
    types — also benefits hover/inlay rendering (D1/D6/D8).
- 🟡 **D — Project-wide unused-export hints.** Core shipped: debounced workspace pass on save (+ 3 s idle), use-map over ≤500 `.vl` files, `hint`/`unnecessary` diagnostics for zero-reference exports. REMAINING: **struct field–level unused-export analysis** — deferred because VL's structural typing makes field-level usage tracking fuzzy (a field could be "used" via a widened receiver type without any import); a future refinement could cross-check field names against known call sites once structural subtyping is tightened.
- ⬜ **D8. Hover verbosity step-expansion.** Alias-name preservation is done (see `CHANGELOG.md`).
  REMAINING: the interactive shallow↔deep verbosity stepper — expand one alias layer at a time
  on demand via the proposed LSP 3.18 hover-verbosity API (`HoverParams.context.verbosityLevel`
  + `Hover.canIncrease`/`canDecrease`). The renderer (`stringifyType` `maxDepth`) is ready;
  blocked on the protocol landing in `vscode-languageserver` (currently 3.17.5). When it lands:
  deps/min-version bump + map `params.context.verbosityLevel` → `maxDepth`, set
  `canIncrease`/`canDecrease` on the returned `Hover` — no renderer change needed (see comment
  in `lsp/src/server.ts` ~L394).

---

## Track E — Browser playground + sandbox
*Depends on C1. The compiler is pure TS + binaryen (wasm), so it runs client-side.*

- ⬜ **E3. Sandboxed execution** — compiled user wasm in a Web Worker, fresh `Memory`, controlled
  `log` only, enforced limits. (Today user wasm runs on the main thread — fine for local use,
  harden before any public deploy.)

---

## Track F — Infrastructure & hygiene
*Independent; do continuously.*

- ✅ **F2. Gate debug `console.log`s** — moot: `toWasm.ts` is deleted (the `.vl` emitter has no such logs).
- ⬜ **F4. Re-enable inline `m.validate()`** during dev for earlier failure.
- ⬜ **F5. Settle the name** (VL vs Vital) and apply consistently.
- ⬜ **F6. Document the build** (`deno task build`/`test`; the antlr/gradle gen step is gone).
- ⬜ **F7. Fix the `paramater` misspelling** project-wide (optional; currently consistent).
- 🟡 **F8.** REMAINING (F5-adjacent): confirm vscode-languageclient forking the ESM server in VS Code.
- 🟡 **F9. Perf baseline.** The TS-driven harnesses (`scripts/perf*.ts`) were RETIRED with the
  kill-TS dev-script sweep (they benchmarked the TS `compile()`); the past wins/abandons live in
  `CHANGELOG.md`. REMAINING: rebuild a baseline against the NATIVE binary
  (`vl build`/`vl run` timing) if/when regression-tracking is wanted again; plus:
  - ⬜ **F9b. Cache / clone binaryen IR across selfhost sub-tests** — LOW priority (the dominant
    cost fell with the F9c memoize; binaryen modules are not trivially cloneable).
  - 🟡 **F-tiers. Collapse the redundant corpus runner.** (This is Track J's J1 — it removes
    Deno-as-an-engine.) REMAINING: delete the
    `SELFHOST_DENO_RUN`-gated tiers (the corpus RUN half + its 305-file whitelist, the check→emit
    verdicts, the V8-side golden fixpoint + emit-program suite) outright once the native tier is
    the undisputed runner; fold the deno-side CHECK verdicts the same way when the native checker
    gates message/span parity. Also: the single-unit assembly compile is SUPERLINEAR in the TS
    host (~5s as a 2-module graph vs ~100s concatenated — wasmEmit.vl is the multiplier); worth a
    profile if any gated assembly is still exercised regularly. (Landed → `CHANGELOG.md`: gating,
    parallel sweep, seed cache + ~3s refresh, graph-compile caching — no big assembly remains
    always-on. The native golden byte-tripwire that briefly covered this is since retired —
    redundant with the fixpoint + the functional corpus, → `CHANGELOG.md`.)

---

## Track H — Self-hosting & distribution (the bootstrap end-state)
*The goal: VL compiles itself; the TypeScript/Deno host retires; the compiler becomes VL→wasm on a
generic wasm runtime. **Distribution does NOT require self-hosting** (the two timelines are
independent).*

- 🟡 **H0. Module system.** Phase 1 done — see `CHANGELOG.md`.
  - **Phase 2 (⬜):** the `std:` scheme + embedded `.vl` std over the two-primitive intrinsic floor
    (collections, `std:fmt`, `std:testing`).
  - **Phase 3 (🟡):** cross-file / std LSP. Module-aware DIAGNOSTICS landed (`lsp/src/moduleGraph.ts`):
    the open file is analyzed as the entry module — its imports resolve through a workspace
    `ModuleReader` (open buffers + disk), so imported names no longer flag "undeclared" and genuine
    import errors (bad path / not-exported / cycle) surface on the import line. Hover/completion seed
    the same imported-name types (real types, no squiggle). Cross-file NAVIGATION now landed:
    go-to-definition and doc-comment xrefs on an imported name jump to the EXPORTING sibling's
    declaration (resolved by reading the sibling through the workspace reader and locating the
    exported binding's decl span via the symbol table); find-references gathers occurrences across
    the current file + other OPEN documents + UNOPENED on-disk siblings (a name's canonical
    `(exportingKey, exportedName)` is matched per document; the importer's symbol table is
    graph-seeded so imported-name uses are recorded). On-disk crawl is scoped: project root detected
    from the LSP workspace-folder root, or by walking up to the nearest ancestor containing
    `deno.json`, `package.json`, or `.git` (at most 6 levels); `.git`, `node_modules`, `dist`,
    `.claude`, `reference` dirs are skipped; at most 500 `.vl` files read per request
    (`MAX_DISK_FILES`); open-buffer text wins over disk for any file open in the editor.
    REMAINING: the `std:` scheme (phase 2).
  - **Deferred:** import maps, namespace/default imports, export-all, re-exports.
- 🟡 **H2. Make VL expressive enough to write a compiler.** REMAINING: maps (B6a), enum tag for
  literal-unions (A16).
- 🟡 **H3. The self-host compiler (`compiler/*.vl`).** Corpus parity REACHED (sweep 312/316, the
  residue is the parked soundness xfails — see "Kill the TS host" in Next; history →
  `CHANGELOG.md`). The port compiles ITSELF to a byte-exact native fixpoint (stage3 == stage4,
  `scripts/native-fixpoint.sh`, ~6s, gated in CI by `ci-native`). REMAINING:
  - **Spans** — continue the rungs (rung 1 = token positions; rung 2 = native `path:line:col:`
    diagnostics, #312; rung 3 = end positions for LSP ranges, `diagEndCol`) so more diagnostics
    carry real positions; message/span parity gates the deno-CHECK-tier deletion (F-tiers).
  - **The untested emitter long tail** — each fails loudly (nullable lists beyond `i32[]|null`,
    map-typed params / nullable map fields, struct-union `==`, `?.` beyond i32/boolean leaves,
    …); burned down demand-driven as real VL code (std, the compiler) hits them.
  - ⬜ **H4.1. No `byte`/`u8` type (ergonomic/representation gap, not a blocker).** Bytes are
    represented as `i32` masked `& 0xff` in `wasmEmit.vl` and round-trip/instantiate fine; a real
    packed byte buffer (B7/B6 `(array i8)`) would drop the 4×-wide detour. (detail: `docs/internals/selfhost-gaps.md` §H4.1)
  - ⬜ **H4.6. Array spread / concat in call position (worked around).** A small `appendAll()` loop
    helper covers bulk-append today; `xs.push(...ys)` lands with variadics (B6). (detail: `docs/internals/selfhost-gaps.md` §H4.6)
- ⬜ **H-M2. Wasm-native distribution (end-state).** The `vl` binary becomes a wasm runtime
  (wasmtime — full WasmGC since v27) + a small host shim. No V8, no binaryen, no Deno.
  **Engine choice re-validated (2026 survey):** wasmtime remains the only standards-track
  non-browser engine with complete, production WasmGC (27.0+; as of 46 a **copying** collector is
  the default alongside DRC and null, and the collector is a per-invocation tuning knob —
  `$VL_GC`, `memory-gc-design.md`). Wasmer gets GC mainly via its V8 backend (a JS
  engine again); WAMR/wazero are embedded/Go niches without GC. **System-API strategy:** WASI
  preview 1 is the whole OS surface `vl` needs (fd_read/fd_write/path_open/args_get/proc_exit),
  implemented natively by wasmtime — we write no OS code. The split: formatting + all compiler
  logic in VL; ONE emitter prerequisite — a linear memory + a GC-string→linear-memory copy
  (the `__store_string__` analog), since WASI's ptr/len ABI can't take GC refs (this also
  subsumes H4.5: emitted bytes leave via fd_write, killing the decimal-string handoff).
  Target WASI p1 — still the right target, but for a changed reason: wasmtime 46 **removed the
  `wasi-common` crate** and p1 now lives in `wasmtime-wasi`'s `p1` module reimplemented over p2,
  while **WASI 0.3.0 is on by default** as of 46. So p1 is a stable shim over a moving stack rather
  than its own implementation, and "p2/component-model still settling" no longer describes the
  landscape — GC↔component interop is the part that still does. Distribution: zero-code via
  `wasmtime run --dir . vl.cwasm` (AOT-compiled) behind a launcher script; a single static
  `vl` binary is an OPTIONAL thin Rust embedding of the wasmtime crate (engine setup +
  preopens only — no OS logic), deferrable until the flip.
  **Status (2026-06): the INTERIM Rust host shipped** (`scripts/vl-host` — `vl build/check/run`,
  brains in `build/vl-compiler.wasm`; the native stage3 == stage4 fixpoint holds via
  `scripts/native-fixpoint.sh`, ~6 s, no TS past the seed). **Killing the Rust host entirely is
  confirmed feasible** (no negatives beyond the VL-side work): (1) the emitter gains WASI p1
  imports + a linear memory + the GC-string↔memory copies above (UTF-8 encode/decode written in
  VL); (2) the driver becomes a WASI `_start` reading `args_get`/`fd_read`, writing bytes +
  diagnostics via `fd_write`; (3) `print` lowers to `fd_write` so EMITTED user programs also run
  under any stock engine. Then the only dependency is a prebuilt conforming engine binary (any
  GC+WASI engine — wasmtime today), same trust/distribution model as deno now, and
  `scripts/vl-host` is deleted. Low priority while the interim host is ~150 frozen lines.
- ⬜ **H5. Versioning — deferred; rustup/Volta model, not nvm** (→ `DECISIONS.md`). Make the H-M1
  install path version-stamped so a launcher can slot in later.

**Sequence:** kill-the-TS-host staging (LSP-on-wasm stages → tier deletion → `std:` Phase 2) →
real import/export for the `.vl` build (post module-revisit) → C5/H-M1 distribution (anytime,
decoupled) → H-M2 host swap (kill the interim Rust host once the WASI driver lands).

---

## Track J — Kill Deno (the destination behind the TS-host kill)
*The north star: remove Deno entirely — no `deno test`, no `deno run`, no `deno compile`, no
`deno.json`/`deno.lock`, no `setup-deno` in CI. End-state runtimes: wasmtime+WASI for the `vl`
brain (Track H, H-M2), Node for the JS-side tooling that outlives the TS compiler (LSP bundling,
the playground). Detailed inventory + staged plan: `docs/internals/deno-deprecation.md`.*

**This track is NOT a competing now-priority.** The active front is **killing the two compilers**
(see Next) — that is the top goal, and it is the road this leads down: it removes Deno's largest
role for free. Track J is the follow-through *behind* that front. Deno is NOT one dependency — it
fills six roles on different timelines, and most of the surface dies as a side effect of work
already in flight (the TS-host kill, `vl test`, H-M2); J is the genuinely Deno-specific residue
plus the final teardown, sequenced after the compilers are gone (the J4 bundling swap is the one
piece that can land early, fully decoupled).

- ✅ **J0 — the TS-oracle brain. DONE (Deno's biggest role, gone).** The `compiler/*.ts` core
  graph is DELETED — no more TS front end running under Deno, no V8-adjudicated corpus emit. Only
  the dependency-free type leaves (`coreTypes.ts`/`diagnostics.ts`) remain. `deno check`/`deno lint`
  now cover just those leaves + the JS-side tooling; the `.vl` compiler is checked by the native
  checker + `lint.vl` (`lint-self.sh`, `ci-native`).
- 🟡 **J1 — the V8 wasm executor.** Tests run emitted wasm via `runWasm` in Deno's V8; the native
  tier already runs the same bytes under wasmtime (`scripts/vl-host`, `ci-native`). REMAINING:
  finish folding the corpus RUN + CHECK verdicts onto the native/wasmtime tier (this is F-tiers +
  Next step 2) so no gate depends on Deno-as-an-engine. Then the only thing left for Deno is
  *orchestration*, not execution.
- ⬜ **J2 — the test harness (the hard core).** All 52 `tests/*.ts` are `Deno.test`. Split by what
  they test:
  - **Behavioral `.vl` corpus** (`cases_test`/`cases_wasm_test`, `selfhost_*`) → migrate to the
    native runner + `*.test.vl` under **`vl test`** (already designed/charted — see Next +
    `docs/internals/test-runner-design.md`). This is the bulk of the harness and the main forcing function.
  - **TS-infra tests** (LSP, playground, lint-TS, format, symbols, stringify, source-map) → these
    test TS that outlives the compiler; they move to a **Node** test runner (`node --test`) when
    their subsystem is ported, OR ride along under Deno until then. Decide the Node-runner cutover
    once `vl test` has absorbed the behavioral corpus.
- 🟡 **J3 — build/dev scripts.** Nearly done by attrition: `build-binary.ts`→`.sh`, and
  `smoke-binary`/`perf*`/`checker-parity-sweep`/`native-golden-check` are all deleted (retired with
  the TS compiler / as redundant). The ONLY remaining `scripts/*.ts` is **`gen-std.ts`** (embeds the
  `.vl` std into `std/embedded.ts`) — load-bearing; port to `.vl` (dogfood) once VL has the file I/O
  it needs, or move to Node. Audit for `Deno.*` globals when ported.
- ⬜ **J4 — bundling (independent; can land anytime).** The LSP (`cd lsp && deno task build`) and
  the playground (`playground/build.ts`) are esbuild-under-Deno; their deps are already
  node-resolvable (binaryen, vscode-languageserver*, monaco). Swap to esbuild-on-Node (`npm`
  scripts) — decoupled from all compiler work, the cleanest early win.
- ✅ **J5 — distribution. DONE.** The `deno compile cli.ts` binary is retired; `release.yml` builds
  the native Rust `vl` host with the seed embedded (`--features embed-seed`, via `build-binary.sh`)
  for all 5 targets per-OS. No V8/node/binaryen in the shipped artifact. (`compiler/cli.ts` +
  `build-binary.ts` + `smoke-binary.ts` deleted; DECISIONS C5 marked RETIRED. → `CHANGELOG.md`.)
- ⬜ **J6 — final teardown.** Once J0–J5 land: delete `deno.json` + `deno.lock`, drop
  `denoland/setup-deno` from `ci.yml`/`pages.yml` (replace the deno cache steps with node/wasmtime),
  rewrite the AGENTS.md command list off `deno task *`, and remove the dual-runtime `no unguarded
  Deno globals` rule (compiler core becomes Node+wasmtime only).

**Sequence:** J4 (anytime, independent) ‖ J0 rides the TS-host kill ‖ J1 finishes with F-tiers →
J2 behavioral corpus onto `vl test` → J3 load-bearing scripts → J2 TS-infra onto `node --test` →
J5 folds into H-M2 → J6 teardown. **Dependencies:** J2-behavioral needs `vl test` (Next); J5
needs H-M2 (Track H); the rest is unblocked. **Open decisions (maintainer):** Node `node --test`
vs another runner for the surviving JS-side tests (J2/J3); whether load-bearing scripts port to
`.vl` (dogfood) or to Node (faster).
