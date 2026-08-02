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
> disagreement over 319,945 comparisons**. #1129 measured away the prerequisite that was thought to
> gate it: the canon pass runs at the *end* of `checkProgram`, so it cannot reach a checker-time
> resolution (333,073 reads · 0 stale · 0 missing). `tsToTy` is the whole remaining cost.
> *(This line used to end "…and still completely unread — `typecheck.vl` does not contain the string
> `annTs`". **That is false and has been since #1288**: `annTs` occurs 9 times in `typecheck.vl` today,
> and the tree is read at five live sites — `annotResolve(name, annTsOf(ann))`, `isTypeTy`, the
> field-declaration resolve, `canonEmitNameTs`'s `TypeRef` arm (#1294) and `tsMapKeyNodeOf`. The bank
> is PARTLY read; what remains unconverted is `nameToTy`'s own descent, not the plumbing. Re-derive a
> claim of the form "file X does not contain string Y" before quoting it — `grep -c` is the whole
> cost.)*
>
> **THE EMIT-SIDE / CHECKER-SIDE FRONTIER IS TRACKED PER BUCKET IN THE PROGRAMME DOC**, with the
> populations re-derived on each slice's own base (they drift, and three consecutive slices found the
> filed *unit* wrong rather than the filed number). Four standing corrections that outlived the
> slices that made them:
> - **1c `unMemAtomTyIx` — a checker-side recorder is REFUTED, not merely unscheduled** (#1294 §8).
>   The checker and the emitter's bridge resolve the same union member and disagree on **444 of 761**
>   comparable atoms, because `canonEmitTypeNames` rewrites the spelling in between. A recorder at the
>   checker's union registration would ship green (it is write-only) and be wrong the moment anything
>   read it. The recorder has to be written by whoever performs the rewrite — canon — which is W9.
> - **1c `sTyIxOfName` — filed to the EMITTER by #1294, and the emitter route is 14 reaches, not
>   1,064** (#1297). All 1,064 resolutions do come from one function, `internInlineShape`; split by
>   that function's SIX callers, only the two variant-field-table sites hold the D5 column the filing
>   named. 1,046 arrive through `internShapeDeep`'s peeled leaf, `internFuncTypeShapes`, the nested-
>   field recursion and `internShapeFieldElems` — each of which CUT `nm` out of a larger spelling, so
>   no caller banks the cut. The 14 shipped; the rest waits on the mono-clone `nodeTyIx` item.
> - **1a `mvSlotOfValNameTyK` — 61% of the "largest routable population now standing" is two rows the
>   programme had ALREADY refuted** (#1301). #1297's bonus census is exact (4,677 reaches at one
>   FIND) and its availability claim is not: bucketed by CALLER, 2,042 are `letMapShapeOf` and 812
>   are `collectA`'s `TypeRef` walk — D-MAPNODETY §3a/§3b, both re-measured to the same entry here
>   (D3 = 128 · D2 = 2). Neither is a routing problem: the first needs the alias identity in the emit
>   spelling, the second needs the intern and the lookup split into two functions. *A bucket's SIZE
>   and its AVAILABILITY are independent facts; check a new census against the refutations already in
>   the document before filing it as work.*
> - **bucket 3 is `monoInferListElem` / `monoInferLocalScalar`, not `inferListElemName`** (#1294 §6) —
>   a function name that never existed in the tree, carried through four slices against a count that
>   was exact. Its producer `pinned` is built by string surgery in `emit_mono.monoInstanceFor`, so the
>   route is one commit spanning `typecheck.vl` + `emit_mono.vl`, not an emitter-only move.
> - **B2 is a strict SUBSET of B3, the G class is ZERO, and 80 of B3's 136 rows are not a
>   disagreement at all** (post-preserve P1, off `c7301d3a`). Joined PER RECORD rather than compared
>   as two class tables: `B2-only` = **0**, so B3 = B2's 39 + 97, and the 97 split into **80
>   PARAM-INST** (the annotation is a generic type PARAMETER — `nameToTy` cannot resolve it and
>   `nodeTyIxOf` returns the clone's instantiation; 49 of 49 files are `tests/cases/generics/*`) and
>   **17 SHADOW** (3 files, all named `generics/type-param-shadows-*.vl`). **G — "the generic
>   application the arena cannot spell", 114 rows at `8c22fa06` — is 0**: #1274's `genAppNameOfTy`
>   closed it, and the nine rows that still hold that PAIR of spellings have swapped sides (canon
>   expands, the renderer names) and are class T. So B2/B3's schedulable content is **TRANSP 19 ·
>   ~~LINSOFT 7~~ · UCOLL 4 (terminal by design) · UEXP 2 · ISECT 2 · TRANSP-INV 1**, and TRANSP is the
>   one with a measured emitter cost — **26 duplicate `uVariants` rows in 16 corpus programs**, one
>   layout under two names, each an extra entry in the base of all three tag bands. *Do not quote a
>   B3 total as a defect count; join it to B2 per record first.*
>
>   **LINSOFT IS CLOSED (2026-07-29, off `81f47aaf`) and B2's residue is 28.** Both renderers gained
>   the un-aliased inline litunion spelling (`litUnionInlineNameOfTy`, the arena twin of canon's
>   `litUnionPreserve` / `nulLitUnionPreserve` pair), so the class reads **0 on B2 and B3** — 11 rows
>   on the shipped corpus, 7 owned by the `ctxKeepsLitUnion` leg and 4 by the `| null` leg, an exact
>   partition proved by deleting each. The registration key that moved is the **STRUCT LAYOUT row**,
>   countable off the module: master interns 42 rec-group heap types for the grown fixture where the
>   head interns 41, and the one that vanishes is the string-field twin of an atom-field struct. Two
>   `vl check`-clean invalid-wasm shapes close with it (a lambda's inferred return, a closure-valued
>   map). *Its published direction column was wrong too — all 7 rows are `REND-ONLY`, not
>   `6 REND-ONLY, 1 BOTH`; the class totals only close with seven.*
>
>   **TRANSP IS HALF CLOSED (2026-07-29, off `8970dea6`) AND TWO OF THE LINES ABOVE ARE REFUTED.**
>   *(a)* The filing's "TRANSP needs W9's `renderEmit` plus the #1122 ruling" is wrong at the
>   ruling: #1122 says the transparent alias must render STRUCTURALLY *because* `collectU`
>   registers it as a one-variant union and pushes the member's name into `uVariants` — and under
>   that same ruling the alias is not a union, so the row was never owed. `collectU` skips it now
>   (`isTransparentObjAlias`) and the member renders as its declared NAME
>   (`transparentMemberEmitName`, read by canon AND the `is` rewriter). **B2 29 → 20, B3 127 → 120,
>   9 rows, and the two halves are inseparable — either alone is a cell DOWN.** Six positions of
>   `MyCat | i32` go from broken to running (2 silent INVALID WASM, 4 emit rejects), each landing on
>   its alias-free control's verdict. The remaining 10 TRANSP rows are the generic-APPLICATION and
>   map-value members; the application rung is BUILT and measured (B2 → 11) and blocked on ONE cell,
>   `fieldTypeCode`'s missing route for `type Holder = { c: Box<i32> }`, which is an emit reject on
>   master too. *(b)* **The "26 duplicate `uVariants` rows in 16 programs" is NOT TRANSP's cost.**
>   Joined on FILE against the B2 dump, TRANSP contributes **0 of the 26**: 17 are an INFERRED union
>   registered twice (the arena walk's structural spelling against the checker's reverse-mapped
>   `Cat|Dog` — a class the census structurally cannot see, since an inferred return has no
>   annotation), 7 are UCOLL or UCOLL-in-kind, 2 are UEXP. TRANSP's own duplicate row was in the
>   82-row "SAME spelling, by design" bucket the probe dismissed — `{MyCat}=(0:Cat)` beside
>   `{Cat|i32}=(1:Cat)`, two `Cat` rows where the first union does not exist. *Intersect the file
>   sets before inheriting a class attribution; two populations that read alike need not overlap.*
>
>   **THE INFERRED-UNION DUPLICATE IS CLOSED AND THE WIDENING SHIPPED (2026-07-29, off `8b7679c6`).**
>   The line above says the 26 duplicate rows are "17 inferred, 7 UCOLL, 2 UEXP". **The 17 is 11**,
>   and the correction comes from the producer itself: a ZZIRR probe (dump `inferRetTyAt` against
>   `reachRegisterName` at every inferred-return row) reads EMPTY on three of the eight programs the
>   17 was attributed to — they have no inferred return at all, and their 6 rows are the SOURCE
>   spelling one layout two ways (an inline-shape annotation beside a nominal `type` chain), the
>   UCOLL family one rung over. *An attribution by elimination is still an attribution; ask the
>   producer.* The 11 are gone (`inferRetArenaUnionIsDup`: where the arena walk's structural render
>   and the name fallback's nominal composite are two spellings of ONE union, the walk descends the
>   MEMBERS and the row is the name's) — **corpus TWO-spelling 26 → 15 over 5 files, 0 added, and
>   the 15 that remain are 4 UCOLL-in-kind + 3 UCOLL + 2 UEXP + those 6, every one terminal by
>   design or already filed.** The removal takes the inline-shape `is` spelling with it (the
>   duplicate's rows were what `is {meow: i32}` matched — the two-half trap, caught by an
>   `is`-spelling × union-PROVENANCE sweep, 3 cells DOWN), so the spelling is resolved at its
>   CONSUMER instead (`isVariantSpelling`, from the checker's banked `is` type through the same
>   reverse map that spelled the union's members). **That is 2 cells UP over master and it ends an
>   action at a distance**: on master `x is {meow: i32}` over a `Cat | Dog` binding compiled only
>   when the module happened to contain an unrelated inferred struct-union return. **S-WIDEN
>   SHIPPED**: the `TyObj` gate on the transparency skip is gone (`isTransparentAlias`), because an
>   EMPTY alias row still sets `uDeclared` and mints the union box — 37 corpus files, all smaller,
>   **−437 bytes**, 26 of them losing exactly that box; its widening-guard sweep is 19 member kinds
>   × 17 positions × {alias, control} = 608 cells with **0 run movement**, a 140-cell module-channel
>   reach, and an inverted control that reddens 11. **Filed, with a reproduction: an ARRAY LITERAL
>   of inferred-union elements still registers the structural spelling a second time** — a different
>   producer, identical on both compilers, and the next twin-row target.
>
>   **THE TWIN-ROW RESIDUE IS RE-DERIVED BY PRODUCER, AND THE FILED "ARRAY LITERAL" IS A BYSTANDER
>   (2026-07-29, off `187869b7`).** A site-attribution probe (ZZSITE — tag every registration walk
>   ROOT, log `(root, name)` at the funnel) says the second row comes from the `iru` loop, and the
>   smallest witness has NO ARRAY: any annotation that spells the union's nominal composite is
>   enough, because `inferRetArenaUnionIsDup` disqualified itself on `isUName(nm)`. That gate was
>   BACKWARDS — `isUName(nm)` TRUE means the row already exists, which is the strongest reason to
>   suppress the walk's structural second spelling, not to allow it. *A gate that asserts another
>   producer's behaviour must name the STATE it is asserting; these two readings differ only in
>   tense.* The gate is gone and `functions/inferred-union-one-row.vl` has its LIST and FIELD
>   positions back: **corpus TWO-spelling twins with those positions restored are 17 on master and
>   15 here.** The dedup exposed a **THIRD reader of the `is` spelling** (`monoStaticIsResult`'s
>   exclusion, which const-folded an inline-shape union test to FALSE once the duplicate row stopped
>   registering that spelling) — and applying #1309's rule there UNCONDITIONALLY costs **12 of 60
>   monomorphized-guard cells**, so it is scoped by `nodeTyIsUnion(receiver)`, the CHECKER's view
>   rather than the emitter's `exprUnion`. *A guard's blast radius is measured on the axis the guard
>   does not mention.* **THE RESIDUE IS NOW RULED, family by family**: 6 SOURCE-spells-it-twice + 3
>   UCOLL (the second row IS the union's second member) + 4 UCOLL-in-kind (per-union `uVariants`
>   slice entries) are TERMINAL BY DESIGN, and the 2 UEXP rows are **canon's, not the walk's** —
>   ZZLTN shows the arena renderer producing `AB|null` correctly and `canonEmitName` expanding it
>   structurally because `unionAliasMembers` renders through `tyToEmitName`, which makes
>   `types/nullable-union-alias.vl`'s own header stale. **Filed, not taken** (a canon union-arm
>   change in the twice-ruled Lsoft/PRESERVE region), together with a bigger one found by the grid:
>   **an UN-ANNOTATED array literal of union elements is silent INVALID WASM on master in every
>   shape measured** — root cause `arrLitIsRef` classifying by the SYNTAX of the first element, and
>   the checker's `nodeArrayElemName` having no `TyUnion` arm to read.

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
- ✅ **P1.1 Typed views over Buffer** (`buf.f32view(off, count)`, `.length`, `x[i]`, `x[i] = v`) —
  the kernel is structure-of-arrays; this was "the thing most worth absorbing into the language".
  The views are `std:buffer` with **zero compiler lines**; the BRACKET is B14's free index
  operators, which land it for every user type at once. `buffer-design.md` §L,
  `index-operator-design.md`.
- 🟡 **P1.2 `flat` record layouts (AoS)** — declared field order = layout, fixed sizes, no reordering,
  scalars and nested `flat` only. The C-struct tier **WasmGC structurally cannot provide**. Forcing
  customer is a Lua 5.3 VM needing bit-exact `pairs()` order. The DECLARATION half ships:
  `flat type TValue = { value: i64, tt: i32, pad: i32 }` is validated (scalars, newtypes over
  scalars, nested `flat`) and MEASURED, and the layout is readable as `TValue.size` /
  `TValue.tt` — checker-folded constants, so **no emitter file changed** and a `flat` declaration
  emits byte-identically to the same one without it. **No implicit padding**: offsets are the
  running sum of declared widths (the spec's own explicit `pad` field is the argument, and
  unaligned access is legal in wasm). **THE FUSION HALF IS DONE (#1317) — and it needed ZERO
  compiler lines**: `"[]"` returns a row ADDRESS (a newtype over `i32`) rather than a row, so there
  is no row to fuse away and `.tt()` is an offset load off an integer. `st[i].tt()` is `cmp`-identical
  to the hand-written `tt(slotAt(st, i))` at both `-O0` and `-O3 --closed-world`, where both
  accessors inline away entirely. The doc's "the bracket deletes two accessors per field" was
  corrected by building it: it deletes none — it deletes the CONTAINER axis (N×M → N+M).
  REMAINING: `buf.rows<T>(off, count)` only — it needs `T.size` for a type PARAMETER (hence generic
  `flat` types and a post-mono fold) and a generic row brand `Addr<T>`, without which it gives up the
  only safety the fused pattern has over raw addresses. `docs/internals/flat-records-design.md`.
- 🟡 **P1.3 Optimization defaults** — the PROFILE ships (#1318): `vl build -O3` runs
  `wasm-opt --closed-world -O3 --gufa -O3`, `-O` is unchanged, and a missing `wasm-opt` stays a soft
  no-op. Two measured findings invert the ask. **(a) Heap2Local is the wrong lever** — `-O3`
  open-world leaves all four allocations of the canonical union box and naming `--heap2local`
  explicitly changes nothing at any rung, while `--closed-world -O` melts all four; the box melts by
  closed-world type refinement + DCE, not escape analysis. `--gufa` is measurably INERT on VL output
  (0 allocations and 0 `ref.cast`s removed, on the fixtures and on the 1.1 MB compiler alike) and is
  shipped only because P1.3 names it. **(b) REMAINING, and it is the half that matters:** the union
  box does NOT melt once the narrowed value is READ. The 4→0 row is measured on allocate-tag-test-
  discard; `if e is Unit { e.hp }` — what a sim writes — is 4→4 at every rung, and a struct union is
  4→2 even tag-only. The `{backing,len,cap}` wrapper half IS delivered (melts completely). Pinned at
  4/4/4 by `opt-melt/union-box-payload-read`. `docs/internals/opt-profile-design.md`.
  **#1320 CORRECTS THE RULE AND CHEAPENS THE FIX.** The discriminator is allocation SITES, not
  consumption: at ONE site the box melts whatever is done with it (2→0 read or unread); only at ≥2
  sites does a payload read keep it alive. VL emits one site per union ARM, so a two-armed helper is
  two sites — which is the whole reason the rows above read as they do. **An unboxed rep is REFUSED
  by measurement** (16 hand-written WAT modules: `ref.i31`, a payload-typed box and a tagless
  `ref.test` box each halve 4→2 and then stop), and so is a documented source pattern — no VL
  spelling reaches one site (`if`-expression and let-on-two-branches both stay 4→4, verified
  independently). **The fix is an emitter-side RETURN-PATH BOX-SINK** — 309 corpus sites, two locals
  and one exit block per union-returning function, touching no field-0 read, no tag band, no sig
  token, no boundary and no checker; measured 2.0–2.2× on WAT. A16 remains irrelevant to this row.
  `docs/internals/unboxed-union-rep-design.md` is the design record; **this is the next perf slice**.
- ⬜ **P1.4 Bounds-check ergonomics** — not asking for unsafe access; asking that the canonical
  view loop either hoists the bound or relies on the memory trap, **and that this is stated** so
  kernel code can be written to the fast pattern deliberately.
- ✅ **P1.5 Nominal/opaque types (= our A14)** — `type EntityId = new i32` mints an identity a
  structural checker cannot; `new` is a contextual keyword, the type is erased before emit, and
  `std:buffer`'s two views are now `new { base, length }` (the `f32base`/`i32base` hack deleted,
  and the module 12 bytes SMALLER because the two shapes collapse to one heap type).
- ✅ **P1.6 `vl test`** — SHIPPED. `vl test [path]` discovers `*.test.vl`, compiles each module-aware,
  and runs them one wasm instance per file across a host thread pool. Trap isolation is real (a
  trapping test fails alone; the host re-instantiates and the file keeps going), a non-compiling test
  file is one failing entry with the compiler's own diagnostics, failure messages are read back
  structurally off the instance (`expected 7 to equal 8`, not `wasm trap: unreachable`), and four
  CPU-bound files measured 1.11 s serial → 0.31 s at `--jobs 4`. `std:test` grew the registration
  half (`describe`/`it`/`itSkip`/`beforeEach`/`afterEach`) beside the matchers.
  Shipped shape + the three divergences from the charter: `docs/internals/vl-test-design.md`.

**P2 — wanted, not gating:** ~~i32-keyed Map/Set + `for k in map` (B6a)~~ **DONE** for every value
type the string-keyed rep lowers and every position but a union member (B6b extended the mv slot's
identity from the VALUE to the (KEY, VALUE) pair, then gave the struct/variant FIELD row the same
key column); ~~contextual f32 literals~~ **DONE**; ~~`match` phase 2 — variant payload
binding~~ **DONE** (`match cmd { Move{x, y} => … }`, punned fields; renaming + nested destructuring
measured and deferred — B21 item 1); literal-union compact representation (A16) — **DESIGNED
AND FILED**, its allocation rationale refuted by measurement and its correctness half (81 of 244
cells) blocked on three owner rulings; readonly
fields / A9 variance; default params (B15a); SIMD over Buffer (unlocked by P0, not requested yet);
keep emitting a names section on non-`-O` builds.

**Non-asks, deliberate — do not build these for them:** exceptions/async (our `T|E` + trap model is
*preferred*), separate compilation / wasm linking, UTF-8 strings (B7), WASI, a std math/trig library,
in-language GC knobs.

- ✅ **PROMOTE `vl test` ahead of the std expansion — DONE, and two of this note's premises were
  wrong.** Recorded because both were load-bearing for the sequencing argument:
  1. **`std:fs` was NOT the gate.** This note calls the failable-IO story "the critical-path item":
     the VL walk needs fs primitives, `std:fs` needs `T | E`, so `vl test` waits on the
     error-handling review. That reasoning assumed the runner would be a standalone VL PROGRAM.
     It is not — the brain landed in `compiler/cli.vl`, which already walks directories for
     `vl check`/`vl fmt` over `CMD_LIST_DIR`, with the skip-list and glob matching already in VL.
     Zero `std:fs`, zero error-handling dependency. The error-handling review is still worth doing;
     it was never blocking this.
  2. **"The linker stays EMPTY — no host-function imports at all" is false**, and was already false
     before this work: every VL program that prints imports `imports.__print_*__`, so a test module
     does too. The browser-execution property survives — a browser driver supplies exactly the seven
     print imports `playground/src/runtime.ts` already supplies — but it is "the same small shim the
     playground already has", not "nothing to shim".
  Original note follows.
  (Owner's ordering: *"before we expand the std
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
  invalid-wasm; `splitUnionAtoms` paren-depth was the same class; and REVERSING that softening
  cost another, because a name-keyed consumer compared the stored spelling against a CLOSED atom
  vocabulary that a user's alias name can never be in — the string layer makes both directions of
  a spelling change unsafe) — subsumed by the `repOf(type)→descriptor` rewrite (item 3, which
  already derives from the `Ty` arena).

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
  - The `.vl` compiler is now the spec, so the parked soundness xfails (arith-hole-operand — A13)
    are fixable bugs, not parity constraints. (array-element-recursion was one until B6a's i32-keyed
    `Map` retired its premise that `{[i32]: T}` spells `T[]`; it is now a passing case.)
- ✅ **`vl test`.** SHIPPED — see `docs/internals/vl-test-design.md` for the built protocol and the
  three divergences from the charter (brain in `compiler/cli.vl` not `std/test/runner.vl`;
  compilation stays VL-side and only EXECUTION crosses; `.only` is not spellable in VL, so
  runner-side `-t` + `itSkip` are the selection story). Chartered follow-ups below still stand,
  plus: void-return covariance on function values (the `done()` wart), f64 failure rendering,
  per-test timings/timeouts, `--no-capture`, `dot`/`json` reporters.
  Original charter entry: `docs/internals/test-runner-design.md` (jest-shaped `describe`/`it`/`expect`
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
- ✅ **Explicit numeric conversion syntax — SHIPPED; this entry was STALE.** The lossless-only
  implicit-widening rule (#298) makes the lossy edges expressible only via a cast, and that cast
  **exists**: `as` covers every edge this item named — `i32 as f32`, `i64 as f64`, and the
  narrowings (`i64 as i32`, `f64 as i32`, which truncates: `5.7 as i32` is `5`). The implicit form
  gives a diagnostic that names the remedy (``i64 doesn't fit in f64 — the conversion is lossy and
  must be made explicit with `as` (write `x as f64`)``), and mixed-width arithmetic rejects with
  ``operator '+' mixes f64 and i64``. Verified 2026-08-02 on all four edges. **REMAINING is a
  SEMANTICS + DIAGNOSTIC item, not a syntax one**, and it is sharper than the original entry:
  - **`f64 as i32` out of range TRAPS, with a raw wasm backtrace and no diagnostic.** Measured:
    `100000000000.0 as i32` → `error while executing at wasm backtrace: vl!<wasm function 5>`;
    `(0.0/0.0) as i32` traps the same way. VL emits the trapping `i32.trunc_f64_s`; wasm also has
    `i32.trunc_sat_f64_s`. The neighbours diverge — **Rust saturates** (`2147483647`), **JS wraps**
    (`1215752192`) — so this is a real three-way design choice that VL has made by accident and
    documented nowhere. Trapping is defensible under the "traps are for bugs" model, but it must be
    a stated ruling with a diagnostic, not a bare backtrace.
  - In-range truncation is toward zero (`5.7 as i32` → `5`); write it down and pin it.
  - **Scientific-notation literals do not parse**: `1e30` is `undeclared identifier 'e30'`. Small
    lexer gap, found while probing the above.
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
- 🟡 **A14. Named/opaque types.** Zero-cost nominal NEWTYPES ship: `type EntityId = new i32` /
  `type F32View = new { base: i32, length: i32 }`. Distinct in the checker in every position,
  ERASED before the emitter (no emitter file changed), literals brand-polymorphic, `as` for both
  construction and unwrap. `docs/internals/newtype-design.md`. REMAINING: generic newtypes
  (`type Handle<T> = new …`), an OPAQUE type with runtime identity (`x is EntityId` — a newtype
  has no tag by construction), and a newtype as a MAP KEY (a pre-existing map-key-grammar gap a
  plain alias hits too).
- 🟡 **A15. Equality.** REMAINING: a referential-identity operator (`===` / `identical`, O(1) `ref.eq`);
  `boolean`→i32 coercion when storing a comparison result; SELF-HOST struct/function-value equality
  (guarded loudly today — and note the `call_ref`-ABI wrinkle: funcrefs admit no `ref.eq`, so
  function-identity compare needs an identity token on the closure struct).
- 🟡 **A16. Literal-union types.** REMAINING: the **enum representation** (i32 tag for a closed
  literal union — see `docs/guide/unions.md`); a literal union read *inside* a body softens to base
  (coarser member-narrowing there than at the call boundary).
  > **The MIXED-UNION half is DESIGNED AND FILED, not shipped** — `docs/internals/litunion-compact-rep-design.md`.
  > A standalone litunion and the four `ctxKeepsLitUnion` positions ALREADY rep as the interned
  > i32 atom; what does not is the member of a mixed box (`K | f64`), which stores a string ref.
  > **The rationale that justified building it is refuted by measurement**: the store already
  > costs exactly ONE `struct.new`, because the member string is a pooled immutable global
  > (`collectStrPool`) and the payload is a `global.get` — so no rep can allocate less, and the
  > `$vbI32` variant of the compact rep would allocate MORE. The surviving wins are equality (a
  > `ref.cast` + an O(len) `__str_eq__` CALL becomes one `i32.eq`) and correctness.
  >
  > **The correctness population is 81 of 244 grid cells — 42 of them SILENT wrong answers, 34
  > invalid wasm, all `vl check` rc 0** — and it has ONE root cause: `valueAtomKind` has no code
  > for a literal-union member (it returns `-1`), so the box's kind vocabulary cannot name the
  > arm. **35 of its 42 call sites have no compensating litunion leg**; the four defect families
  > are exactly the gates nobody visited. Storing an atom-typed VALUE into `K | f64` emits
  > `f64.convert_i32_s` on the atom ID and tags it f64; reading a narrowed arm back into a
  > `K`-typed position is invalid wasm in 9 of 9 spellings; `K | string` puts a real string on
  > the litunion arm's tag (`x is K` is TRUE for `"zz"`, six lines); `K | K2` reps as a bare
  > string with `is K` const-folded to `i32.const 0`.
  >
  > **A loud reject is NOT available for the collision shapes** — measured: rejecting
  > `K | string` moves 12 `RUN-OK` cells DOWN and `K | K2` moves 4, so they are BLOCKED on the
  > rep rather than independently fixable. Three owner rulings gate the build: the tag scheme (a
  > 14th value-atom kind re-bases both slot bands by a constant; a per-set slot band re-bases
  > them wholesale, renumbering every union box tag in every program), whether `ref.i31` enters
  > the emitted vocabulary (measured available in wasm-tools' shipped set, V8 and wasmtime 47 —
  > and the only encoding that does not regress allocations; the emitter has zero i31 today), and
  > what `K | K2` should MEAN — **and that last one needed no ruling and SHIPPED as slice C
  > (→ `CHANGELOG.md`)**: a union all of whose members are literal unions IS one. The filing's
  > *"only the checker's render has to move"* is REFUTED by measurement (render-only is 2 cells
  > UP and **12 DOWN**) — `tsToTyReal`'s annotation-union arm never flattened a union MEMBER, so
  > `K | K2` interned as a `TyUnion` OF UNIONS, `tyIsLitUnion` answered no, and `anyLitUnionUsed`
  > left `gLitUnionUsed` at 0, switching off every atom classifier in the module. With the arena
  > arm + a canon mirror: **54 cells UP and 0 DOWN over 420** (46 of them silent-wrong → correct), and `K | K2` lands on the exact
  > ten-cell RUN-OK set of the hand-written spelling of its flattened members (19 of 20 when a
  > declared alias for that set exists). The RUN-MERGE variant is ruled OUT with numbers — master
  > already performs it when the flattened alias is declared, and there it is 0 UP / 2 DOWN.
  > TWO follow-on slices remain (A: the atom→box STORE; B: the box→atom READ, which should wait
  > for the rep rulings); the working cells are pinned by
  > `tests/cases/literal-unions/mixed-union-litunion-arm-floor.vl` and the flatten by
  > `tests/cases/literal-unions/union-of-litunions-flatten.vl`.
  > *Also measured: the fuzzer DOES reach litunion-in-mixed-union (26 and 14 of 800 cases on two
  > seeds) and is VACUOUS on every defect family — it only ever stores a member LITERAL.*
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
- 🟡 **B6a. `Map` + `Set`.** The **struct/variant FIELD position is DONE** — `{[i32]: V}` now ships
  in every position the string-keyed rep occupies except a UNION MEMBER, for every value type it
  lowers (`string`, a struct, `i32[]`, `string[]`, `f64`, `i64`, `f32`, `V | null`, a union, a
  closure, a nested map): a binding / parameter / return / `| null` / an ARRAY ELEMENT / a closure
  RESULT / a map VALUE / a STRUCT or VARIANT FIELD. The field's mechanism was the filed one: a
  field ROW recorded the map's VALUE name and VALUE type with the KEY ERASED (`sFieldElemName` /
  `sFieldElemTyIx`) while an mv slot's identity is the (KEY, VALUE) pair (B6b), so both field
  tables grew a key column (`sFieldElemKeyI32` / `uFieldElemKeyI32`, written by the ONE row
  recorder and read at the ONE shape home `sFieldMapShape` / `uFieldMapShape`). REMAINING, all
  loud rejects with pinned fixtures: **a UNION MEMBER** (`{[i32]: V} | i32` — the box carries no
  map shape, `maps/error-i32-keyed-position-union-member.vl`); **a list of LISTS of maps**
  (`{[i32]: V}[][]`, one `[]` deeper than the peel, on both the bare and the field spelling —
  `maps/error-i32-keyed-position-array.vl`); and an ARRAY OF CLOSURES returning one
  (`(() => {[i32]: V})[]`). Also filed, on both key reps: a struct that is a MEMBER of a declared
  union cannot be a map VALUE (`mvValKindOfName`'s last arm asks `structIndexByValName`, which a
  variant is not in — `tests/cases/maps/error-map-value-struct-in-union.vl`).
  (The filed "a SET-typed FIELD has no `.add`" row is STALE — `.add` gates on the VALUE TYPE as
  of `sets/add-through-every-position.vl`, and `{seen: {[i32]: boolean}}` + `s.seen.add(5)` runs.)
  **The `m.get(k) ?? d` METHOD spelling is DONE** — it was taught HALF the fused-read set (every
  `??` rule asked `binLeft is Index`), so it printed the RAW ATOM ID over an atom-valued map and
  turned the non-member default into a LATE emit error; both now resolve the receiver through the
  ONE shape home `fusedMapReadRecvIx`. The **BARE mono-map read's MISS is null** for a
  niche-bearing value too (`{[K]: K}` / `{[K]: boolean}`, not just the `| null` spellings) — `0`
  was a real value there (atom id 0 is the first-interned member, boolean 0 is `false`), so
  `m[missing] == <that member>` read TRUE and the `!= null` narrow saw a miss as present.
  REMAINING on that axis, both loud: a **plain-`i32`-valued** map's narrowed bare read
  (`const g = m[k]; if g != null`) is `emitProgram: bare null needs a struct-typed context` — every
  i32 is a legal value so there is no spare sentinel, and `m[k] ?? d` is the spelling; and a
  **BARE `m.get(k)` with no `??`** is `emitProgram: callee is not a function name` in every
  position, on both key reps and for every value rep (only the FUSED `m.get(k) ?? d` lowers —
  routing the bare method spelling would need the `.get` twin at every `expr*` Index arm, not just
  the `??` ones). Also:
  `map`/`filter` over Map/Set (A10); clean diagnostic polish for unannotated/used `Map()`.
  (Self-host native parity: string-keyed maps, delete, `Set`/`.add`/`.get`, and ref-valued maps
  (string/struct values, #319) landed; map-typed params are the remaining native map gap.)
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
  `"[]"`/`"[]="` + flat-backed `Matrix`/`Grid` type. Nested `m[i][j]` already composes today —
  including over B14's free index operators, where the outer receiver is the inner operator's return
  type (`tests/cases/index/operator-overload-by-receiver.vl`).
- 🟡 **B14. Methods via explicit `self` + UFCS.** Free INDEX OPERATORS ship — `function "[]"(self: T,
  i: I)` / `function "[]="(self: T, i: I, v: V)` make `x[i]` / `x[i] = v` a direct call, dispatched
  by the receiver's TYPE (so two receivers with the identical structure dispatch apart on their
  nominal brands), overloadable per receiver, and merge-safe across modules.
  `docs/internals/index-operator-design.md`. REMAINING: route the ARITHMETIC/comparison operator
  dispatch (B13) through the same registry — a free `function +(self, b)` works single-file but is
  NOT found across the module merge (`lookup(op)` uses the raw name; measured); `c.area` (no `()`)
  as a bound value; mutation/variance (A9).
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
  - **Bulk host I/O — BOTH halves shipped** (`perf-program.md` §6 in, §7 out). The driver exports
    `srcLoad` / `modKeyLoad` / `modSrcLoad` / `cliResultLoad`; a `__load_i32__` in those loops sets
    `memUsed`, which materialises the memory the host stages through (exported as `memory` per P0.2
    — no `.vl` file can name an export `ioMem`, so `StrIn::probe` gained one line and now probes
    `ioMem` then `memory`). **4,565,054 host calls per self-compile became 279; the host's
    `stage_program` phase went 192 → 135 ms, `vl fmt --check compiler` 577 → 518 ms**, peak RSS
    unchanged. No `Reserve` (VL has no list-capacity primitive) and no seed split (the published
    seed compiles it).
    **The OUT direction is the mirror and also shipped** (`perf-program.md` §7): the GUEST writes the
    same window and the host copies out. `rbyteStore(off, count)` packs emitted BYTES four per i32
    word — chunk = the whole 65,536-byte page — and `cliCmdDataStore(off, count)` writes CLI payload
    code points one per word. **A self-compile's read-back went 1,112,716 host calls → 17 and
    `[profile] readback` 17 → 1 ms; `vl fmt compiler` went 4,520,527 calls → 290 and 545 → 486 ms.**
    Same presence probe, same 2×2 fallback, still no seed split. The channels left per-call were
    MEASURED small first: 300 diagnostics are 9,790 calls / 0 ms, `cliCmdPath` is one path, and a JS
    consumer pays ~3–5 ns a call (the LSP's `fmtByteAt` over the repo's largest file is 4.93 ms).
    **Still to weigh, and now only for a future B7:** wasmtime 47's `ArrayRef::new_from_i8_slice`
    builds a GC array from a host byte slice in ONE memcpy — no linear memory, no data section, and
    it would remove the element loop that survives on BOTH sides here. It is **i8-only**, so it lands
    free the moment strings are `(array i8)` (B7) and not before. Sequencing question, not a fork.
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
  **MEASURED 2026-07-29** (`docs/internals/perf-program.md` §2.1): a self-compile peaks at
  **511 MB** of never-reclaimed GC heap for `compiler/*.vl` (100,238 lines / 4.56 MB — ~112 bytes
  of heap per source BYTE) under the null collector,
  and the static census says why — `string` is `(array (mut i32))`, so every one of the binary's
  2,573 string literals is an i32-per-code-point array. The same document rules that **`flat`
  records are NOT this lever** (P1.2 is a declaration feature with zero emitter lines; the
  flat-able i32 sidecars are ~10% of self-time against the string layer's 33.6%) and names the
  adjacent one that IS: bulk host↔guest staging over the now-host-visible linear memory, whose
  host half is already written and waiting on `ioMem` + `srcLoad` exports. **That staging item has
  since shipped** (§6) — and it moved TIME, not memory: peak RSS read 511.2 → 511.3 MB, because the
  GC-side accumulator is unchanged and only the host CALL was removed. Allocation is still this
  bullet's problem.
- 🟡 **B-sym. Identifier interning** (`docs/internals/identifier-interning-design.md`;
  `perf-program.md` §3 item 2, §8 and **§9**). **THE TABLE AND PHASE 3 SHIPPED.**
  `compiler/symbols.vl` holds one intern table with a whole-program id space, an ARENA-NODE
  side table as the carrier, and the eight in-place name writers notifying it; the three
  whole-program name→index maps (`globalNameMap`, `fnNameMap`, `parentLetOf`'s per-block map,
  plus `nestedNameSet` and the `startBlockLetOf` memo) are sym-indexed dense arrays, and ~70
  call sites feed them `sidOfNode(<the index they already held>)`. **The re-baseline CONFIRMED
  the phase table it was required to re-derive** — phase 3 6.32% against 6.2 predicted, phase 4
  4.73% against 4.4, phase 5 1.63% against 1.6 — so this is the rare case where the plan
  survived contact. Phase 3 is worth **−4.5% of a self-compile** (interleaved profile A/B, 14
  runs per leg; min-of-41 wall clock −4.2%/−5.6% against a ±1.1%/±2.2% control band) and
  **2,466,975 → 479,079 string-keyed probes per self-compile, with ZERO divergences over
  2,371,115 both-implementation comparisons**. −1,383 compiler bytes.
  **Three findings worth carrying.** (1) **R3 was confirmed by a dead-exact WASH**: the
  intermediate build that converted the maps but left every caller passing a string read
  `sidOf` + `sidLookup` = 6.33% against the 6.32% it replaced — *interning at the point of use
  has already paid the probe it was meant to save*, and the entire win came from the carrier.
  The carrier is read **20.5× per intern (95.1% hit rate)**. (2) **A SID-keyed table aliases
  across programs where its NAME-keyed predecessor did not** — sid 3 exists in every program,
  the spelling `foo` does not — so every sid-keyed table must be dropped where the id space is;
  missing that failed **18 wasm-harness cases that each pass in isolation**. (3) **The fixpoint
  ladder is BLIND to all eight name-writer poisons; the suite and the corpus are the
  witnesses** — the filed "six poisons redden ONLY the ladder" reading did not reproduce at
  the merge gate and `perf-program.md` §9.6.1 retracts it with the re-measurements. Writers
  1–3 (the driver merge) are provably inert today because the carrier is empty before emit,
  and they are kept as defence, not as covered code. **Phases 4 and 5 remain**: `lookup` is now
  the largest single string consumer (2.83%) and the undo-log rewrite is small — but
  `perf-program.md` §9.7 records the blocker, that `T.scopes[top][name] = v` and
  `T.scopes.pop()` are the self-compile's only exercisers of two emitter arms. Historical
  context follows.
  The largest compiler-side perf item, and the re-baseline
  it required **re-ordered it**. The SYMBOL/IDENTIFIER consumer class is **19.59% of a
  self-compile** (12 warm guest runs, 20,985 samples) — but it has no hotspot (largest member
  3.07%, top five 10.31%), and four of its biggest measurable costs were not about identity at
  all: a full capture re-WALK per returned identifier (4.35%, one call site), four un-hoisted
  `fnStmtsPosOf` calls in one frame (4.34%), a whole-arena rescan per `nameNamesFunction` query
  (2.64%), and `parentLetOf`'s double map probe (1.64%). **Those four plus `keywordKind`'s
  19-way chain shipped and are worth −11.1% of a self-compile** (interleaved min-of-21;
  `vl check`/`vl fmt` structurally flat as controls at −0.1%/−0.9%), with no intern table and
  no new ID space. The design holds the rulings for what remains: ONE table in a new leaf
  `compiler/symbols.vl`, a WHOLE-PROGRAM id space (per-module would have to be remapped at the
  merge, and `modRenamed` is itself a top consumer), an **arena-node side table as the carrier**
  (interning at the point of use is not a win — a `sidOf(name)` call has already paid the probe
  it was meant to save), the eight in-place name writers that must notify, and R6: a name→index
  map becomes a **sym-indexed dense ARRAY**, not an i32-keyed map, because the id space is dense
  and "a later id is a different string" makes `sid >= len ⇒ absent` exact. Phases 3-5 are the
  three whole-program name→index maps (6.2%), the checker's scope chain (4.4%) and the merge
  rename table (1.6%). **Also ruled: `keywordKind` on interned ids is a NO** — a closed
  vocabulary needs an enumeration, not a table — and the same applies to the whole TOKKIND class
  (2.47%, a class neither earlier split had). **The sabotage worth remembering: a COLLISION in an
  identity table is invisible to the fixpoint ladder, to the six-channel corpus A/B over 1,713
  files, and to all 3,610 tests** (§8.4); `tests/cases/objects/anon-field-value-name-not-a-function.vl`
  is the gate that now names it.
- 🟡 **B-ci. CI wall clock** (`docs/internals/perf-program.md` §1). `ci-native` crept 74 s → 89 s
  p50 / 106 s p90 by 07-29; the forensics over all 1,317 master-push runs say the creep is
  **not** compiler speed (the self-compile step is 9 s of 89) but three step-level costs: the
  native-align suite's ~1,618 SERIAL `vl check` spawns (27 s), a 1.2 GB cargo-target restore
  (17 s) and a per-push `--features embed-seed` cargo build (15 s). SHIPPED: the embed-seed build
  is now the parallel `ci-embed-seed` job, the target-dir restore is gated on the `vl-bin` cache
  missing (97.9% hit rate), and the align spawns are pooled (13.1 s → 4.6 s locally, interleaved
  min-of-3, same 1,797/0). **MEASURED ON THE RUNNER over two runs: `ci-native` 89 s p50 → 42–50 s**
  — the align step 27 → 19/20 s (four cores cap what 2.8× local predicted), the 17 s restore
  skipped, the 15 s embed build gone; workflow wall clock 89 → ~50 s. REMAINING: a
  `vl check --batch` mode would take the last ~1,600 spawns to a handful (§3 item 5), and
  `build.rs`'s `VL_SEED_KEY` forces a full crate recompile of the embed job every push (§3 item 8,
  ~16 s on a job that is not the critical path — the 48 s first reading was runner variance, and
  §1.5.1 records that correction as the method point it is).
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
  exhaustiveness-by-default — a missing arm is a hard error, à la Rust/Swift), **phase 2a
  (VALUE-union scrutinees)** and **phase 2b (PAYLOAD BINDING)** have shipped (→ `CHANGELOG.md`;
  `tests/cases/match/*`). Phase 2a is the
  discrimination half: an arm pattern is a member TYPE (`C =>`, `i32 =>`, `null =>`, `A | B =>`),
  parsed into a real `IsExpr` over the scrutinee, so compiler-enforced completeness now covers
  structural/tagged-union discrimination — the complement to the if-chain coverage check
  (A-exhaust), which cannot demand completeness at all. Every arm binds the narrowed member.
  Phase 2b is the binding half: `Move{x, y} => x + y` binds one arm-local `const` per punned field,
  desugaring to the `const x = scrut.x` prepend the plan called for — byte-identical to the
  hand-written if-chain twin across 18 measured cells.
  REMAINING:
  1. **Payload binding: the two richer clause forms.** ~~Flat punned binding~~ **DONE (phase 2b).**
     Still open, both measured as one-branch extensions in `docs/internals/match-design.md`:
     **renaming** (`Move{x: a}` — the formatter already reads the binding name off the `LetDecl`,
     so it is a parser branch plus a `field: name` print) and **nested destructuring**
     (`Move{p: {x, y}}` — needs a `Member` CHAIN initializer and narrowing through it).
     Also open and NOT phase-2b-specific: a binding arm cannot be a `const` INITIALIZER
     (`const r = match u { A{a} => a … }`) because a multi-statement if-expression arm hits the
     pre-existing `emitProgram: if-expression arm is not a single value` — the hand-written twin
     fails identically, and the same match without a clause lowers fine. Fixing that emitter gap
     (an if-expression arm whose block has statements before its tail value) unblocks the whole
     let-init context, `match` and `if` alike.
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
