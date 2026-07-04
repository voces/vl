# Rep-composition fuzz findings

The VL-native rep-composition fuzzer (`scripts/fuzzgen.vl` + `scripts/fuzz-vl.sh`) buries a literal
payload inside a randomly-nested rep (struct field / list element / nullable) and reads it back; the
round-trip is the oracle. Run it: `scripts/fuzz-vl.sh --seed 1 --count 400 --depth 4`.

**Depth 1 (single wrapper over a scalar) is fully green** — `{f: K}`, `K[]`, `K | null` all round-trip.
So do several depth-2 shapes (`{f:{f:i32}}`, `{f:i32}[]`, `i32[][]` standalone). The failures are
specific DEEPER COMBINATIONS — the nuanced boundaries a hand-written corpus misses. ~19/400 cases at
depth 4 fail, in these families (example signature → error):

## ✅ MILESTONE (2026-07-03): zero unsound outputs at the CI seeds
**Every soundness class — INVALID-WASM, TRAP, MISMATCH — is now 0** at the pinned seeds
(101/202/303, depths 2/3/4). The residual is **33 shapes, ALL fail-loud REJECT**: the compiler
refuses each with a clear emit/type diagnostic — never silently-wrong bytes, never invalid wasm.
The rep-fuzzer's original purpose (surface silent miscompiles from rep composition) is discharged;
what remains is a coverage backlog of unsupported-but-cleanly-rejected shapes, pinned in the
baseline.

The soundness holes below were driven to zero across these waves: structural heap-type dedup
(#833/#834/#835), value-union box read (#855), map-as-closure-return heap-type identity (#860),
scalar-union-arm boxing in composite position + function-type-as-REF-atom (#861), and a real rep
for a union whose member is an array (#863). The original example holes (`{f: f64[][]}`,
`{f: f64[]}[]`, `{f: {f: (i32|null)[]}}`) all compile + round-trip now and are pinned as
`tests/cases/` regressions.

### The check is now EXACT (`scripts/rep-fuzz-check.sh`)
The baseline is a precise mirror of the current fail-loud rejects, enforced bidirectionally: a
soundness class is NEVER baselineable (always a finding); a NEW reject fails CI (coverage
regression); a STALE baseline entry that no longer fails ALSO fails CI (graduate it). So the
fuzzer never reports "a finding that doesn't trigger an issue," and the baseline can never drift.

### Remaining fail-loud REJECT families (the 33-shape residual — coverage, not soundness)
- **Union with a MAP member** (~16 shapes): `{[string]: V} | X`, `{f: {[string]: …} | string}` —
  `a union with a map member is type-valid but not yet supported by codegen`. Largest family.
- **Array of a UNION element** (`(string | {w: i32})[]`, `(i32) => (string | {w})[]`): distinct from
  the now-shipped union-with-array-member (#863) — here the ARRAY's element is a union. `splitUnionAtoms`
  splits the `|` inside `(C | D)` because it tracks brace/bracket but not paren depth; never unsound
  (construction may compile, a read errors loudly at `is`). The bounded remainder of #863.
- **Map READER path** (`(i32) => {[string]: f32}` p2r, `() => {[string]: string}` p2r): the
  construct-and-return path is fixed (#860); reading a returned map back through the value-call ABI
  still rejects fail-loud.
- **Nullable-scalar lists** (`(boolean | null)[]`, `(f64 | null)[]`, `(() => K0 | null)[]`): a niche
  nullable element has no box rep; `collectA` rejects cleanly. Accepted long-tail (see below).

## Historical: the original soundness holes (all RESOLVED)
A valid program that compiled to bytes failing wasm validation / trapping, not a clean reject:
- `{f: f64[][]}` — struct field that is a 2-D f64 array → wasm validation error. **FIXED.**
- `{f: f64[]}[]` — list of structs whose field is an f64 list → `failed to compile`. **FIXED.**
- `{f: {f: (i32 | null)[]}}` — struct→struct→nullable-i32 list → wasm runtime error. **FIXED.**

## Clean rejects (compile errors — real gaps, fail loudly)
- **Nested arrays in composition** ("nested arrays are not supported"): `(i32[] | null)[]`,
  `{f: {f: i32}[][]}`, `(i32[][] | null)[]`. (Plain `i32[][]` works; the gap is array-of-array nested
  under a nullable/struct/another array.)
- **Nullable lists** ("bare null needs a struct-typed context"): `{f: i32[] | null}`,
  `{f: (i32 | null)[] | null}`. The known nullable-list-locals family — a nullable list has no rep in a
  struct field / binding. (See `vl-type-support-landscape` memory.)
- **Struct inside list / nullable-list** ("field access receiver is not a struct"):
  `({f: f64} | null)[]`, `{f: {f: f64}[]}`, `{f: {f: {f: i32}[]}}`. The field-access classifier loses the
  struct through a list element or a nullable-list element.
## FIXED
- **Same-field-name nested inline struct** (#668): `{f: {f: {f: i32}}}` failed while `{f: {g: {h: i32}}}`
  worked — the structural shape dedup (`annShapeIndexOf`) keyed each field on NAME + type CODE only, so a
  same-name recursion produced an identical `(f, code 15)` signature at every level and the outer shape
  collapsed onto the middle one. Fix: the dedup also compares each ref field's ELEMENT type. A clean LOGIC
  bug (not a rep gap), which is why it was cleanly fixable. Closed the "nested struct fields" family 7→1.
  #665's `Deep = {a:{b:{c}}}` used distinct names, so it never exercised same-name nesting.

## Why the rest resist patching (evidence from attempted fixes)
The fuzzer's nullable ctor emits the child VALUE, never a bare `null` — so every remaining failure is a
genuine DEEP-COMPOSITION rep gap (3–4 nested wrappers). Shared root (3 independent diagnoses agreed):
**rep resolution + interning don't recurse through composition boundaries.**

Attempts to convert the invalid-wasm holes into clean rejects (tightening `fieldTypeCode` /
`nameFieldCode`, rejecting un-internable shapes in `collectAnnShapes`) all OVER-REJECTED — the support
matrix is irregular and any blanket rule catches valid programs:
- `i32[][]` as a struct field WORKS (`lists/struct-field-pop-statement.vl`); `f64[][]` does NOT — the leaf
  scalar type matters, so "reject nested-array fields" breaks the working i32 case.
- generic shapes `{first: B, second: A}` (`generics/swap.vl`) and union-of-shapes `{x:i32}|{y:i32}`
  (`types/ref-union.vl`) fail `internInlineShape` but are valid (monomorphization / union box).

So: **don't patch these piecemeal** — each patch needs more special-casing and has wide blast radius. They
are the strangler-fig REP REWRITE (emitter resolves type→rep RECURSIVELY + structurally), with THIS fuzzer
as the differential tester. The i32-only self-compile fixpoint is blind to the entire rep layer.

## Notes
- These are CANDIDATES for freezing into `tests/cases/` once fixed (each case is already a valid
  self-describing `.vl` with a `// @log`). The fuzzer emits exactly that form.

---

# Matrix expansion (leaves × containers × positions)

The generator now covers the full rep matrix: leaves i32 · i64 (full 64-bit range) · f64 · string ·
f32 · boolean · literal-union atom; containers `{f:T}` · `T[]` · `T|null` · multi-field struct
`{a,f,z}` (mixed-rep decoy siblings) · map `{[string]:T}` (read via `?? <same-shape dummy>`) ·
union `T | decoy` (read via `is`, sometimes carrying the decoy) · closures `()=>T` / `(i32)=>T`;
positions local / param / return / global; READ + CONSTRUCT-ONLY variants of each. Each case carries
a stable `// @shape p<pos><r|c> <type>` signature; `scripts/rep-fuzz-baseline.txt` pins the
known-failure shapes at the CI seeds and `fuzz-vl.sh --baseline` fails only on a shape NOT in it (a
regression or a fix — either way, look). Classes: REJECT (clean fail-loudly — the expected long
tail) · INVALID-WASM / TRAP / MISMATCH (bugs).

Sweep: 14,000 programs (seeds 11–88, depths 2–5) → ~25% findings at depth ≥3, clustering into the
families below. Oracle-ambiguity classes were excluded from the generator after triage (a union
decoy that could ADMIT the carrier literal — `i64 | i32` with a small literal, `K0 | string` with a
member word — makes the checker's variant pick legitimate either way).

## Soundness holes — INVALID WASM at depth 1–2 (minimal repros)
- **Lambda returning a struct with an i64 field**: `const v: () => {f: i64} = () => ({f: 6000000000})`
  → invalid wasm in the lambda body (`expected i32, found i64`); block-bodied variant breaks at the
  CALL side instead (`v().f` reads i32). A NAMED function value (`const v: () => {f: i64} = mk`) works.
- **Small literal into an i64-returning lambda**: `const v: () => i64 = () => (5)` → `expected i64,
  found i32` (no widening at the lambda return; `() => (6000000000)` works).
- **Returning a non-{i32,string,struct}-valued map**: `function mk(): {[string]: i64}` (also f64,
  f32, K0, closure-valued; nested `{[string]: …}[]`, map-in-map) → invalid wasm at the return.
  Locals + params of the same types work (params of some shapes are clean rejects).
- **Union PARAM carrying an i64 literal**: `useIt(5000000077)` into `useIt(p: f64 | i64)` → invalid
  wasm in the callee (the local binding works).
- **GLOBAL initializers of composite shapes** — `const g: {f: K0[]} = {f: ["aa"]}` → the emitted
  MODULE fails to parse (invalid global init, `failed to parse WebAssembly module`); many p3 shapes
  in the baseline (`{a,f,z}` with union/atom-list/f32 fields, `() => i64 | boolean`, lists of
  multi-field structs). Bare `K0[]` / `{f: i64}` / `i64[]` globals work.

## Silent wrong results — MISMATCH
- **`is` mis-tags an i64 list built from small literals**: `const v: i64[] | boolean = [670563]`
  → `is i64[]` is FALSE (prints OTHER); `[6000000000]` works. The literal is element-typed i32,
  boxed with a non-i64[] tag, and the checker accepts the widening — checker/emitter disagreement.
  Also seen: `({[string]: i32} | boolean)[]` loses the map variant's tag (depth-1 map-in-union is a
  clean reject; the list wrapper turns it into a silent mis-tag).
## FIXED (nullable/union rep seams + the boolean print classifier)
- **`const v: f64 | null = null` → invalid wasm**: `scanPrintUse` matched f64 annotations with an
  EXACT `== "f64"` compare (i64/f32 use a contains match), so a program whose only f64 mention is
  the `f64 | null` annotation (a null carrier has no float literal) never imported `__print_f64__`
  and the narrowed `print` called import 0 with an f64 on the stack. Fix: the same contains match
  the i64/f32 forms use. Fixture: `unions/nullable-f64-local.vl`.
- **`(f64 | null)[]` / `(i64 | null)[]` construct → invalid wasm**: two seams. The scalar-list
  `let` classifiers' INIT fallback (`letIsF64Array` & siblings) claimed a binding whose ANNOTATION
  is a ref array — the slot became a scalar f64/i64 list while the literal built the kind-2
  union-box list. And `emitArr`'s kind-2 override cleared the f64/string literal claims but not
  the i64 one. Fix: a ref-array annotation is authoritative (the fallback is skipped), and kind 2
  clears `isI64Lit`. Fixture: `lists/nullable-scalar-elem-list.vl`.
- **`(boolean | null)[]` / `(string | null)[]` construct → invalid wasm**: the element is a NICHE
  nullable (one non-null member + null — deliberately not a value union, no box rep), and the
  kind-2 lowering emitted its raw value. No list rep exists for these elements; `collectA` now
  rejects cleanly ("a nullable-boolean list element has no rep") — pinned in the fuzz baseline as
  REJECT shapes (the corpus harness cannot assert emit-time errors, so no `@error` fixture).
- **Union variant with a scalar-list field (`{a: i32, f: i64[]} | i32`) construct → invalid
  wasm/clean fail**: the variant-field collectors never forced the scalar-list backing/wrapper
  types (`forceScalarListField`, which struct fields already call), and `emitVariantStruct`
  threaded the element-kind context only for ref/string list fields — an i64[] field's
  small-literal elements built an i32 list into the i64-list slot. Fixture:
  `unions/variant-scalar-list-field.vl`. (The field READ back out of the variant is a separate,
  still-open composition gap — it fails loudly.)
- **boolean prints 0/1 instead of true/false** through a struct FIELD read (`{f: boolean}` — depth
  1!), a map `??` result, a closure-call result, and a `boolean[]` PARAM element: boolean shares
  the i32 rep everywhere and the syntactic print-routing lost the tag on exactly the read paths
  with no boolean-carrying table. Fix: `exprIsBool` consults the checker's recorded node type
  first (`nodeTyWidenedRepName` — the same typed-IR fast path `exprIsF64` has), which covers all
  four paths at once; 5 existing fixtures that had frozen the 0/1 rendering were updated to
  true/false, and 14 baseline shapes graduated. Fixture: `functions/boolean-print-paths.vl`.

## Clean-reject families (fail-loudly long tail — NOT bugs, for the record)
Map params (`only i32, i64, f64, f32, boolean, struct, union, array, or string parameters`) · map
values beyond the supported set in some compositions (`unsupported map value type`) · bare map get
of a scalar value binding (`bare null needs a struct-typed context`) · lambda param inference in
deep contextual positions (`cannot infer a type for parameter q0`) · float literals into f32
contexts through a wrapper (`cannot assign {f: f64} to {f: f32}?` / `(i32) -> f64` vs `(i32) -> f32`)
· string literals into literal-union members through a nullable (`expected {f: "a"|"b"}?, got
{f: string}`) · `is` over some deep structural types (`is names a type that is not a union
variant`) · plus the pre-expansion families above (nested arrays in composition, nullable lists in
fields, struct through list/nullable-list).

## FIXED — the i64 widening-seam families (small-literal rep vs an i64-demanding context)
Three families shared one root: a small int literal's rep is decided by the LITERAL (i32) where the
CONTEXT demands i64/f64, and the seam-owner missed the widen. Each fixed at its seam, corpus-frozen:
- **Small literal at a lambda return** (`const v: () => i64 = () => (5)`, all positions): the checker
  seeded only the lambda's expected PARAMS; the body inferred `() => i32` and function-type
  assignability covariantly widened the return — a rep change no function VALUE can adapt to (the
  call site trusted the annotation's i64 result; the lambda's functype said i32). Fix: `seedExpected`
  also records the expected RETURN and the lambda ADOPTS it when the body's numeric widens into it
  (the literal then widens INSIDE the body at the return seam, `emitReturnValue`); numeric prims are
  now INVARIANT inside function types (`fnSlotAssignable`), so the named-function-value spelling is a
  clean reject. Also: the print-import scan matched only an EXACT `f64` annotation (i64/f32 used
  substring match), so `() => f64`'s print routed to a non-existent import — now substring, which
  incidentally fixed `p2r f64 | null`. Frozen: `closures/lambda-return-widens-{i64,f64}.vl`,
  `types/fn-value-numeric-return-invariant.vl`. Graduated: `p1r () => i64`, `p3r () => i64`,
  `p3r (() => i64)[]`, `p2r f64 | null`.
- **Small literal in a union-VARIANT struct field** (`{f: 5}` into `{f: i64} | i32` — the live remnant
  of the union-param family): `emitVariantStruct` threaded ref/string list kinds but not the scalar
  f64/i64/f32 field coercions (codes 17/23/24) or the scalar-list element kinds (25/26/27) the plain
  struct-literal path has. Fix: mirror that dispatch. Frozen: `unions/variant-field-scalar-widens.vl`.
  (The original `useIt(5000000077)` into `p: f64 | i64` spelling already lowered correctly — the
  scalar atom ladder in `emitUnionCoerce` widens; only the variant-struct boundary missed.)
- **`is` mis-tags an i64 list built from small literals** (`i64[] | boolean = [670563]` — silent
  wrong result): the checker types the member `i64[]`; `emitUnionCoerce` classified the literal's own
  rep (`i32[]`) and tagged the box with it. The emitter was wrong — fix: an int-element list adopts
  the union's `i64[]`/`f64[]` atom when `i32[]` is not a member, seeding `pendingListKind` so the
  backing builds wide (elements widen at the store). Frozen: `unions/i64-list-union-is-tag.vl`
  (behavioral `print`s prove `is` now matches). The f64[] READ side (`t[0]` on the narrowed atom)
  stays a pre-existing clean reject ("index access but list type not collected").
- **Int-element list under an `f64[]` annotation** (`const xs: f64[] = [2]` — handed over from the
  nullable/union-rep triage): `emitArr` honored `pendingListKind` 4 only for an EMPTY literal (kinds
  6/7 were already authoritative for non-empty ones), so the literal built the i32-backed wrapper
  against the f64-list slot. Fix: kind 4 is authoritative too; a bare int element re-encodes directly
  as `f64.const` (exact, and it keeps a const-global init a valid constexpr — `emitExprAsF64` used a
  non-constant convert), and the START-FN global-init path now threads the annotation's list kind for
  scalar lists like the const path does. Frozen: `lists/f64-list-int-elements.vl`. Pre-existing and
  NOT covered (globals family, fails identically on master): a NON-const scalar-list global whose
  CELL kind mis-classifies (`const xs: i64[] = [-2]`, `const xs: f32[] = [-1.5]` — the cell emits as
  `(mut i32)`); `f64[] = [6000000000]` is a correct checker reject (i64→f64 is lossy).
  - **RESOLVED — the i64-list / f32-list global CELL** (`const xs: i64[] = [-2]`, `let xs: f32[] = [-1.5]`,
    both `const` and `let`, annotated and inferred): a NEGATIVE element is a unary `-x` (not a NumLit),
    so `isConstInit` classified the init non-const and the global routed through the synthetic start
    function. The non-const CELL emitters `fbValtypeNullable` / `fbRefNullForKind` carried a `f64list`
    arm but no `i64list` / `f32list` arm, so the cell fell through to a bare `(mut i32)` while the
    start-fn `global.set` stored the wide-list ref — invalid module (`expected i32, found (ref null
    $type)`). Fix: the two missing arms, mirroring `f64list` (route through `il64TypeIdx` / `fl32TypeIdx`,
    the same wrappers the const-path `fbValtype` already selected). The start-fn init path already
    threaded the scalar-list kind (the f64 wave), so only the cell valtype was wrong. A large-magnitude
    element (`6000000000`) stayed on the const path and worked already; a small POSITIVE one (`[2]`) is a
    NumLit that `isConstInit` accepts. Also covered the UN-ANNOTATED global cell (`globalKind` gained
    `exprI64Array`/`exprF32Array` for a call-returned list and `arrLitIsI64` for a bare i64-literal
    init) — this closes the #841 deferral (a captured-var i64/f32-list closure result into an
    un-annotated module global, `const g = v()`, now lowers). Frozen:
    `tests/cases/globals/i64-list-global-cell.vl`. Fuzz-neutral (the shape is not generated at the
    pinned or wide seeds — 0 new / 0 fixed at 4242/7777 d3–4 and 101/202/303; native-fixpoint holds;
    986 tests pass). Pre-existing and still OUT of scope (a SEPARATE gap, fails identically as a LOCAL):
    an INLINE-literal-bodied scalar-list lambda whose element is a small int (`() => ([-2])`, value-call
    → `function-value call arity has no interned signature`) and an un-annotated `f32[]` list READ from a
    named-function result (`index access but array type not collected`); the still-deferred `i64[] | null`
    / `f32[] | null` nullable-list globals (R5, distinct-backing niche) also remain baselined.
- **Map member in a union** (`({[string]: i32} | boolean)[]` — the related silent mis-tag): a map is
  neither a struct variant nor a value atom, so `registerInlineUnion` silently SKIPPED the union
  (`nameIsMap` even prefix-matched the union name and swallowed it down the map-value recursion) —
  deeper seams then mis-tagged and every `is` missed. Fixed the wrong (emitter) side by failing
  loudly, plus the checker capability floor (`tyHasMapUnion`, unsupported-lowering channel) so the
  reject is positioned at the annotation. Frozen: `unions/map-union-member-reject.vl`. This turns the
  construct-only `p2c (i32) => {[string]: f32} | {w: i32}` (previously passed unused) into a pinned
  clean reject.

## Notes
- The union `is`-oracle needs the decoy to NOT admit the carrier literal (see `pickAlt`); when
  adding decoy types, keep that invariant or the round-trip claims a bug the spec doesn't make.
- The i32-only leaves of the OLD generator hid every family above — all of them involve i64/f32/
  boolean/atom leaves, maps, closures, or the param/return/global positions.
- FIXED — a PARENTHESIZED `is` condition defeated the emitter's narrow rewrite: `if (x is i64)
  { print(x) }` over a value union emitted the BOXED read (invalid wasm, `expected i64, found
  (ref $type)`) while the bare spelling lowered fine. The checker's narrowing collectors peel
  `Paren`; the emitter's condition matchers (`setNarrowFromCond`/`setNarrowFromCondElse` — the
  single seam every if/else/guard/`&&`-conjunct narrow routes through) matched the raw condition
  node, so checker and emitter disagreed on exactly the paren spelling. Same blindness in the
  checker's own chain classifiers (`ifChainExhausts`/`ifCondIsDiscriminating`), which
  spurious-flagged a parenthesized exhaustive `is`-chain as missing-return. Fix: peel parens at
  those seams. Fixtures: `unions/paren-is-narrow.vl` (if/else-if/else/guard/`&&`/nested-paren/
  `!= null`/member-field/struct/while, each beside its bare control), `unions/paren-is-chain-exhausts.vl`.
  A parenthesized RECEIVER (`(x) is i64`) is unchanged: neither side narrows it (`placeKeyOf`
  keys "" for a non-place), a consistent loud reject — not part of this class.
- Still failing (other agents' families, seen in the re-sweeps): `() => {f: i64}` closure-struct
  sigs, `{[string]: {f: i64}}` map values, `i64[] | null` GLOBAL initializers.

## RESOLVED

- **An object literal did not coerce field-wise through a `| null` wrapper** (`{a, f, z: f32} | null`,
  and the same struct as a `V?` map value): a float-literal `f32` field (`z: 3.5`) failed the CHECKER
  against a nullable-struct target (`expected {…, z: f32}?, got {…, z: f64}`) even though the NON-null
  target coerces it. Root: `assignableExpr`'s `ObjLit` field-wise-coercion arm required `dstTy` itself
  to be a `TyObj`, but a nullable target is a `TyNullable` wrapping the struct, so the arm was skipped
  and the literal kept its un-coerced f64 field. The sibling `ArrayLit` arm already peeled the nullable
  (`dN is TyNullable { dtix = dN.nInner }`); the fix gives `ObjLit` the same peel. Graduated (seeds
  101/202/303): `p1c`/`p1r {a: string, f: i32, z: f32} | null`, `p1c`/`p1r {a: i32, f: {[string]:
  string}, z: f32} | null`, plus map-value structs with an f32 field (`{[string]: {f: f32}}`,
  `{[string]: {a: f32, f: string, z: i32}}[]`, `{[string]: {a: f64, f: K0, z: i32}}`) — map VALUES are
  nullable `V?` slots, so the same peel coerces their struct literals. 0 regressions. Frozen:
  `tests/cases/objects/obj-literal-coerce-through-nullable.vl`.
- **R2/closures — `string | null` closure RESULT via a lambda** (`(i32) => string | null`): a REJECT
  (`function-value call arity has no interned signature`). The niche rep already lowers — a
  named-function VALUE (`const v: (i32) => string | null = mk`) round-trips — only the inline lambda's
  contextual RETURN adoption was missing: a `"hey"` body infers the softened `string` member, so the
  lambda's functype result stayed `string` (`>S`) while the value call keyed the `string | null` niche
  (`>N`), and the sig never interned. Fix: a nullable-string return-adoption arm — a body tail that
  `assignableExpr` proves assignable to the expected `string | null` adopts the nullable, so the
  functype result is the `ref.null` string niche; the existing `nullableRetName` recording arm +
  `synthRetAnnots` pin it and `emitReturnValue` niches the value (the exact machinery the named-fn
  value already uses). RESTRICTED to the string niche (checked as `TyNullable`-inner-`string`, before
  `valueUnionRetName` which also claims `T | null`): a nullable SCALAR (`i32 | null`) and a VALUE-UNION
  result (`string | i32`, `i64 | boolean`) lower STANDALONE but their box/niche READ does NOT yet
  compose through a nullable-closure PARAM or a MAP VALUE — verified the named-function VALUE spelling
  cleanly REJECTS those composed positions (no interned sig), so adopting the lambda there would EXPOSE
  invalid wasm (a REJECT→INVALID regression the full-seed invalid-wasm diff caught); they stay LOUD
  rejects until the sibling value-union / nullable COMPOSITION reps land (C2/C3). No new `$fnsig` token.
  native-fixpoint holds; 990 tests pass. Graduated (seeds 101/202/303): `p0r (i32) => string | null`;
  the 4242/7777 d3–4 invalid-wasm diff confirmed 0 new invalid-wasm and 0 new findings. Frozen:
  `tests/cases/closures/lambda-nullable-string-result.vl`. Cross-dependency (left baselined, the
  closure side is right): `() => boolean | null` fails even as a NAMED-fn value (the `boolean | null`
  niche has no closure-result rep — a genuine missing rep, not an adoption gap); the value-union closure
  results (`() => string | i32`, `() => i64 | boolean`) and nullable-scalar (`(i32) => i32 | null`) need
  their box/niche READ to compose (C2/C3) before the lambda can safely adopt them.

- **A value-union struct VARIANT with a niche-nullable FIELD = null** (`{f: string | null} | {w: i32}`
  built as `{f: null}`): emit rejected with `bare null needs a struct-typed context`.
  `emitVariantStruct` (the union-box variant-payload builder) threaded the scalar-widen field codes
  (17/23/24) and the list codes (5/6/25/26/27) but NOT the niche-nullable field codes 20 (`string |
  null`), 21 (`boolean | null`), 22 (`closure | null`) — so a `null` field value reached the bare-null
  path with no seed. Fix: mirror the plain struct-literal path's three arms (`pendingNulString` /
  `pendingNulBool` / `pendingNulClosure`) in `emitVariantStruct`. A non-null field value passes through
  unchanged. Graduated (seeds 101/202/303): `p3c`/`p3r {f: string | null} | {w: i32}`, 0 regressions.
  Frozen: `tests/cases/unions/union-variant-nullable-field.vl`.

- **A value union with a `string` MEMBER but no constructed string → invalid wasm** (`string | i32 =
  42`, `string | f64 = 1.5`, `string | boolean = true`): the `is string` arm's narrowed read emits a
  `ref.cast $aTypeIdx` (dead when the box holds the OTHER member, but it must still VALIDATE), and
  `markValueUnionAtoms` forced the box/list types for every atom kind EXCEPT the string atom (k==2) —
  so a program that never CONSTRUCTS a string left `$aTypeIdx` unallocated and the cast pointed at a
  bogus heap index (`expected funcref, found anyref`). Fix: a `string` member forces `aUsed`, exactly
  as the list-member arms force their wrapper types. A one-line collect-classifier add; the box read
  and narrowing were already correct. This is the load-bearing string-member composition unlock (it
  also unblocks value-union results that carry a string arm). Frozen:
  `tests/cases/unions/value-union-string-member-no-string.vl`. Fuzz-neutral at the pinned/wide seeds
  (the generator always constructs the string carrier, so the dead-arm case is hand-found) — 0
  graduations, 0 regressions; native-fixpoint holds; 989 tests pass.

- **Extracting a narrowed value-union member into a fresh EXPLICITLY-TYPED local → invalid wasm**
  (`const x: i32 = r` / `const b: boolean = r` where `r: i32 | boolean` / `string | i32` is narrowed):
  `letIsUnion` consulted the INIT's union-ness (`exprUnion(d.letInit)`) even when an explicit NON-union
  annotation pinned the cell — so `x` was classified a union BOX and the unboxed scalar was stored into
  a `(ref $box)` slot (`expected (ref …), found i32`). The comment already said the init check "applies
  when no annotation pinned the cell", but the code did not enforce it; the fix gates the init-union
  check on `d.letType < 0`. An explicit annotation now makes the binding that concrete type and the init
  UNBOXES the narrowed atom into it. 0 regressions (pinned + 4242/7777); native-fixpoint holds; 990
  tests pass. Frozen: `tests/cases/unions/value-union-narrowed-extract.vl`. Fuzz-neutral at the pinned/
  wide seeds (the generator's value-union arms print a literal, never re-extract) — hand-found, and the
  composition unlock the closures workstream needs for value-union results.

- **R3 (partial) — a literal-union ALIAS member of a VALUE union, positive `is K0` test**
  (`K0 | boolean`, `K0 | i32`, `K0 | f64`, `K0 | {w:i32}`, and the struct-field carrier
  `{a, f: K0 | i64, z}`): `is K0` rejected at emit (`` `is` names a type that is not a union
  variant ``) even though the box already CONSTRUCTED, NARROWED-TO-OTHER-MEMBER, and printed a
  litunion member correctly. Root: `emitUnionCoerce` boxes a litunion member as a STRING ref (its
  members are string literals, so `exprString` claims them), tagged `scalarTagOf("string")` — but
  the `is`-narrow (`emitIs`) and the narrowed read (`narrowedValueAtomOf`) both keyed on
  `valueAtomKind`, which returns -1 for a litunion ALIAS name, so `is K0` fell through to the
  struct-variant path and the then-branch read had no atom to unbox. Fix: both seams resolve a
  litunion-alias variant to its boxed atom `"string"` (`nameIsLitUnionType`-gated) — `emitIs`
  tag-compares against the string tag, `narrowedValueAtomOf` unboxes the string ref. Sound because
  a real `string` member cannot coexist (`K0 | string` collapses to plain `string`), so the string
  tag never collides. Graduated (seeds 101/202/303): `p0r K0 | boolean`, `p0r K0 | i32`,
  `p0r K0 | f64`, `p3r K0 | {w:i32}`, `p1r {a: f64, f: K0 | i64, z: i64}`; the 4242/7777 sweep
  additionally fixed 7 shapes (`K0 | i64`, `K0 | i64 | null`, `{[string]: K0 | i64 | null}`,
  `{f: {[string]: K0 | {w:i32}}}`), 0 new. Frozen: `tests/cases/unions/litunion-value-union-is.vl`.
  Pre-existing and OUT of scope (a SEPARATE value-union gap, fails IDENTICALLY for a plain-atom
  union `string | boolean` / `string | {w:i32}`): an ELSE-branch complement read of the OTHER
  member (`else { print(v) }` / `else { print(t.w) }`) — invalid wasm / emit error; the fuzzer's
  else prints a literal, so the graduated shapes exercise only the positive branch. Also OUT of
  scope (a distinct member-path seam, not the ident path the fuzzer binds): a DIRECT narrowed
  member read `o.f is K0 { print(o.f) }` without the `const t0 = o.f` binding.

- **R2/closures — f32 closure RESULT via a float-literal-bodied lambda** (`(i32) => f32`, and the
  composite `(i32) => {a: f32, f: f64, z: i32}`): a CHECKER reject (`cannot assign (i32) -> f64 to
  … (i32) -> f32`), the "float literal into an f32 context through a wrapper" clean-reject family the
  landscape flagged — but it is an ADOPTION gap, not a genuine reject. The f32 result REP already
  lowers: a named-function-VALUE spelling (`const v: (i32) => f32 = mk`) round-trips today. Only the
  inline lambda's contextual RETURN adoption was missing. Root: a float-literal-bodied lambda infers
  f64 (a `.` literal's default); the return-adoption block (`checkFuncDeclNode`) widened only via
  `numWidens` (i32→i64/f64, f32→f64) and `objRetWidenAdopt`'s int-literal fields — neither covers the
  f64-literal→f32 exact re-encode the direct `const v: f32 = 5.5` binding grants (`isFloatLitExpr` /
  `assignableExpr`). Fix, three surgical seams:
  - the scalar arm: a float-literal body tail against an f32 expected return adopts f32
    (`isFloatLitExpr(lambdaBodyTail)` + `primNameOf(expRet) == "f32"`), so the lambda's functype
    result is f32 and `emitReturnValue` encodes the literal at f32 (the `retF32` path was already
    there for a bare f32 body).
  - the FIELD arm (`objRetWidenAdopt`): an f32 field whose value is a float literal is recorded like
    the numeric-widen fields — `nodeTyIx[value] = f32` — and `anonFieldCode` codes the f32 slot (24)
    for a recorded-f32 float literal (it else codes a `.` literal f64/17). The literal-shape interner
    then interns the f32 field slot, structurally deduping with the annotation's shape.
  - the emit seam it exposed (`emitExprAsF32`): the fast-path `if exprIsF32 { return emitExpr }` fired
    for the newly-recorded-f32 literal and delegated to `emitExpr`, which lowers a bare `.` literal at
    f64 — an `f64.const` into an f32 field, invalid wasm at `struct.new`. Fix: handle a bare
    (possibly negated) numeric literal DIRECTLY as `f32.const` BEFORE the `exprIsF32` delegation (the
    delegation now serves only genuine f32 VALUE exprs — a variable / arithmetic / call result).
  All three are scoped to lambda-return f32 adoption (the field arm runs only from the lambda-return
  block; the emit reorder changes behavior only for a recorded-f32 float literal, which only this
  adoption creates) — non-lambda f32 paths are byte-identical, native-fixpoint holds, 987 tests pass.
  Graduated (seeds 101/202/303): `p0c/p0r/p2c/p2r (i32) => f32`, `p0c/p0r (i32) => {a: f32, f: f64,
  z: i32}`; the wider 4242/7777 d3–4 sweep additionally graduated 11 more f32-result shapes (nested
  `{f: (i32) => f32}`, arrays `((i32) => f32)[]`, nullable `(() => ((i32) => f32)) | null`, f32/i64
  mixed-field structs) — the finding-set strictly SHRANK (0 new). Frozen:
  `tests/cases/closures/lambda-f32-result.vl`. NOT part of this slice (fails identically for a named
  function value — a genuine reject, not an adoption gap): an ARBITRARY f64 VALUE into an f32 return
  (`(i32) => f32 = (x) => someF64Var`) stays a lossy-demote reject.

- **R2/closures — litunion RESULT via a lambda, + the value-call-result print widening**
  (`(i32) => K`, and the nested `{a: i64, f: {f: (i32) => K}, z: boolean}`): TWO seams, one CHECKER
  + one EMITTER, both required for the shape to round-trip.
  - **Emitter (a MISMATCH, `(i32) => K = mk` printed the raw atom id).** A NAMED-function VALUE call
    `v(0)` whose result is an aliased litunion holds an i32 atom (its functype result reps i32, #843),
    but `exprIsLitAtom`'s `Call` arm only handled a NAMED-function callee (`fnIndexOf(name)`), so a
    closure VALUE call — and a struct-field / indexed closure call — fell through and `print(v(0))`
    emitted the raw id (0/1/2). Fix: any `Call` whose CHECKED result type is an aliased litunion
    (`nodeTyIsLitUnionAlias(callNode)`) widens at print — the value-call dual of the named-call arm.
    Alias-only (`nodeTyIsLitUnionAlias`), so an INLINE-litunion-returning call (string rep) is
    correctly excluded, and a Member/Index callee (`s.f.f(0)`) is reached (the arm keys the call
    node, not the callee shape).
  - **Checker (a REJECT, the lambda spelling `(x) => "b"` was un-adopted).** A litunion-member string
    literal body infers the softened `string`; the return-adoption block widened only via
    `numWidens` / `objRetWidenAdopt`, so `cannot assign (i32) -> string to … (i32) -> K`. Fix: a
    litunion adoption arm — a bare string-literal body that `assignableExpr` proves a member of the
    expected litunion adopts it. For the lambda to LOWER, its `$fnsig` result must key the i32 atom
    (`>i`) to match the value call and `emitReturnValue` must encode the member as its atom id, so the
    anonymous lambda's adopted return is recorded as the litunion ALIAS name and `synthRetAnnots` pins
    `fnRet` to it (the alias reps as an i32 atom; an inline member spelling reps as a string, so the
    alias name is required — a new `litUnionAliasNameOfTy` reverse-lookup off a parallel
    `cUnionNames`/`cUnionTyIxs`). Once pinned, the existing annotated litunion machinery
    (`vtKindOfType` → `>i`, `retLitUnion`) lowers it — no new `$fnsig` token: the ABI vocabulary is
    unchanged (a litunion result IS the i32 token, `repSigTokOfKind`/`repKindOfSigTok` untouched).
  native-fixpoint holds; 987 tests pass. Graduated (seeds 101/202/303): `p0c/p0r/p2c/p2r (i32) => K0`,
  `p0c/p0r {a: i64, f: {f: (i32) => K0}, z: boolean}` (6 baseline lines); the 4242/7777 d3–4 sweep
  additionally graduated 13 more litunion-result shapes (arrays `((i32) => K0)[]`, nullable
  `((i32) => K0) | null`, struct-field `{f: (i32) => K0}` and its nullable), finding-set strictly
  SHRANK (0 new). Frozen: `tests/cases/closures/lambda-litunion-result.vl`. NOT part of this slice
  (a value-union / nullable box a sibling owns, not a bare litunion result): `K0 | i32` / `K0 | f64` /
  `K0 | {w:i32}` value unions, `(() => K0 | null)[]`, `(i32) => ((i32) => K0) | null` (nullable of a
  nested closure) all remain baselined — the closure side is right; they need the value-union/nullable
  rep first.

- **Inline value-union struct FIELD not registered like the named-alias one** (`{f: f32 | {w:i32}}`,
  every member type — i32/i64/f32/f64/string/boolean/struct): the inline spelling rejected on a
  scalar-arm read (`field access receiver is not a struct`) — or emitted invalid wasm on the box read
  — while the named-alias `type U = f32 | {w:i32}; {f: U}` round-tripped. Root: a struct field's union
  is carried in its FIELD, not at the annotation's top level. A named `type T = {f: A|B}` registers each
  field union in `collectInlineUnionsIn`'s TypeDecl branch (iterating `tdFields`), but an INLINE shape
  annotation reached `registerInlineUnion` as one whole-shape name, which had array / map / function-
  return / value-union / variant-box arms but no arm that DESCENDED into a struct shape's fields — so a
  field union `f32|{w:i32}` was only later half-registered by `internInlineShape`'s `registerValueUnionName`
  (the value-box reps, NOT the struct VARIANT), and negative (`else`-branch) narrowing to the struct
  member had no variant to recover. Fix: `registerInlineUnion` gains a single-shape arm
  (`nameIsSingleShape` gates out a union-of-shapes `{x}|{y}` and a map `{[…]}`) that splits the shape
  body at depth 0 and recurses on each field type (`registerShapeFieldUnions`) — the inline dual of the
  named-`TypeDecl` field loop, running in `collectU` BEFORE `collectS`/`internInlineShape` so the full
  variant-box registration wins. A CLOSURE field (`f: (i32) => i32 | {w:i32}`) is skipped (top-level
  arrow): its union sits in the composite closure RESULT, an R2-adjacent family whose shape may not
  lower — registering it would over-reach a field the named spelling only reaches through the same
  still-irregular closure-result path. Graduated (seeds 101/202/303): `p1c`/`p1r
  {a: boolean, f: boolean | {w: i32}, z: i32}`, `p3r {a: boolean, f: {a,f:f64,z} | {w: i32}, z}`; the
  wider 4242/7777 sweep additionally fixed 9 field-union shapes (0 new findings). Frozen:
  `tests/cases/unions/inline-union-field.vl`. Pre-existing and OUT of scope (fails IDENTICALLY for the
  named alias, a separate field-union READ gap, not a collection difference): a `string | {struct}`
  field read against a struct VALUE (`narrowed string union field read but array type not collected`),
  and an `else`-branch narrow to a struct member of a two-struct-member field union (`{v}|{w}` — read
  via the carrier's positive `is` arm instead).

- **Aliased literal-union VALUE returned from a call, straight into print / another call**
  (`print(pick(ks))` / `useK(pick(ks))` where `pick(p: K[]): K`, `type K = "a" | "b" | "c"` — the
  1-D litunion-call-result seam the R4 note flagged as separate): INVALID-WASM
  (`expected (ref $type), found i32`). Indexing the result first (`print(mk()[0])`) lowered.
  Root: an ALIASED litunion reps as an i32 ATOM (its functype result is i32, via `vtKindOfType` /
  `nodeTyIsLitUnionAlias`), but `retStrFlag` flagged the return `fRetStr` — because
  `nodeTyWidenedRepName` renders EVERY litunion "string" (the print-widening name). So the
  functype declared i32 while every call-result CONSUMER (`fnRetString` → `exprString`, the
  inferred-return chain) treated the returned atom as a STRING REF and routed it to the string-ref
  path. Fix: `retStrFlag` returns 0 for an aliased litunion return (its `fRetStr` now agrees with
  the i32-atom functype); the atom widens to its member string at the print seam (`exprIsLitAtom`),
  not by claiming a string RETURN. An INLINE litunion (`"a" | "b"` at the annotation) reps as the
  string ref (its functype result IS the `retStrFlag` fallthrough), so the guard is ALIAS-ONLY —
  matching `vtKindOfType` — leaving inline litunions byte-identical. Also closed the sibling that the
  root-fix EXPOSED (an un-annotated GLOBAL binding off an atom init — `const r = pick(ks)` /
  `const r = ks[0]` — printed the raw atom id, a pre-existing mismatch): `exprIsLitAtom`'s global
  arm now consults `letInitIsLitAtom`, the global dual of the `localLitUnion` init classification a
  function-body binding already had. Frozen: `tests/cases/literal-unions/atom-call-result-print.vl`.
  Fuzz-neutral (the seam is hand-found, not generator-produced — 0 new / 0 fixed at seeds
  4242/7777, 0 regressions at pinned 101/202/303); native-fixpoint holds; 982 tests pass.
- **R4 — a 2-D array of an i32-backed scalar list** (`K[][]` literal-union, `boolean[][]`): rejected
  at emit (`only i32[] arrays and struct/union element arrays are supported`), the last live remnant
  of the "nested arrays" family — `i32[][]` / `f64[][]` / `i64[][]` / `f32[][]` / `string[][]` and any
  ref-leaf `S[][]…` already lowered (recent scalar-2D + ref-recursion arms), and `{f: i32[]|null}` /
  the struct-through-list R6 shapes (`({f:f64}|null)[]`, `{f:{f:f64}[]}`, `{f:{f:{f:i32}[]}}`) were
  already green by the time of the re-sweep (R6 fixed by the #833–835 structural-slot-dedup work).
  Root: the THREE ref-array classifiers (`nameIsRefArray` / `refArrElemKind` / `refArrElemName`) each
  special-cased only the literal name `"i32[][]"` — a fourth parallel enumeration of the same fact —
  so the atom/boolean leaf was unreachable even though `i32[]`, `boolean[]` and a litunion `K[]` share
  ONE i32[] backing (`nameIsI32Array`) and hence the identical `i32[][]` rep (element kind 4, the
  `lTypeIdx` i32-list wrapper). Fix: one shared predicate `nameIsI32ListArray(name)` = "a 2-D array
  whose element is `nameIsI32Array`", routed through all three (replacing each `== "i32[][]"` arm) —
  no new rep, no new element kind, just the existing kind-4 path generalized to the leaf. A deeper
  `i32[][][]` stays kind-9 ref recursion (its element `i32[][]` is itself a ref array, not
  `nameIsI32Array`), unaffected. Graduated (seeds 101/202/303): `p1c K0[][]`, `p1r K0[][]`; also
  `(K0[]|null)[]` and `boolean[]`-valued maps (their vals ref-list is the same `boolean[][]` rep) at
  the wider gate seeds. Frozen: `tests/cases/lists/atom-2d-array.vl`. Pre-existing and OUT of scope
  (fails identically on master, a SEPARATE litunion-call-result seam, not a 2-D-array rep gap): a
  literal-union VALUE returned from a function directly into `print`/another call arg
  (`print(pick(ks))` where `pick(p: K[]): K` — 1-D too), invalid wasm; index the result first
  (`print(mk()[0][0])`) and it lowers.
- **R5 — nullable lists of a NON-i32 leaf** (`K[]|null`, `i64[]|null`, `f64[]|null`, `f32[]|null`,
  `string[]|null`, in a binding/field/return): the LITUNION sub-case is RESOLVED; the distinct-backing
  scalar/ref leaves remain a deferred missing-rep.
  - **RESOLVED — litunion `K[]|null` / inline `("a"|"b")[]|null`** (field AND binding): a litunion's
    atoms are interned i32 ids, so its list shares the `i32[]` backing EXACTLY like `boolean[]` — it
    folds into the existing code-18 / `nullist` niche with NO new rep, the nullable dual of R4's kind-4
    fold. One predicate change per position: `nameIsNulI32List` → `nameIsI32Array(nullablePartOf(name))`
    (the name path, `fieldTypeCode`/`nameFieldCode`) and its arena twin `nodeTyIsNulI32List` +
    `repOfNullable`'s array arm gain a `tyIsLitUnion` element check (the structural path,
    `retNulListFlag`/`vtKindOfType`). The litunion atom lowering the construct/store site needs was
    already threaded by the shared i32-list path (`nameIsI32Array` already claims a litunion array), so
    no store-site change was required. Graduated (seeds 101/202/303): `p2c`/`p2r K0[] | null`; the
    4242/7777 sweep fixed those two shapes, 0 new. Frozen: `tests/cases/lists/litunion-nullable-list.vl`.
    Pre-existing and OUT of scope (fails IDENTICALLY for `i32[]|null` — a shared limitation, not a
    litunion gap): a bare `= null` INITIALIZER value (`const xs: K[] | null = null` → `bare null needs a
    struct-typed context`); a list VALUE init and the `!= null`-narrowed read both work.
  - **RESOLVED — distinct-backing leaves** (`i64[]|null`, `f64[]|null`, `f32[]|null`, `string[]|null`),
    at the BINDING / RETURN / GLOBAL positions: each leaf now has its OWN `(ref null $wrapper)` niche over
    the leaf-list wrapper (`il64TypeIdx` / `fl64TypeIdx` / `fl32TypeIdx` / `mkListIdx`) — four new VKinds
    `nuli64list` / `nulf64list` / `nulf32list` / `nulstrlist`, the nullable dual of `nullist`. A non-null
    list value SUBTYPES the nullable slot (no rebuild), a bare `null` is `ref.null $wrapper`, and a
    narrowed `t[i]` recovers non-null then reads the leaf list. Sites wired: the valtype ladders
    (`fbValtype` / `fbValtypeNullable` / `fbRefNullForKind`, one arm per kind), the structural type→kind
    seam (`repOfNullable`'s array arm, so `vtKindOfType` covers return/param), the classifiers
    (`nulScalarListKind` name→kind, `letNulScalarListKind` / `exprNulScalarListKind` binding+init
    inference), the local-slot chain (`emit_collect`, before the non-null scalar-list arms), the
    global cell (`globalCellKind` + the const-init leaf-build seed in `emit_sections`, which the SMALL-i64
    / f32 literal needs so the const cell builds the RIGHT wrapper), the binding + return null-seed
    (`ExpCtx.nulRefHeap`/`listKind`), the `!= null` fold, the narrowed index read, and the collect
    classifiers (forcing the leaf list wrapper even for a `= null`-only module). Graduated (seeds
    101/202/303): `p0c`/`p0r string[] | null`, `p2c`/`p2r f32[] | null`, `p3r i64[] | null`; the 4242/7777
    sweep additionally graduated `f64[] | null` (p0c/p0r/p3r), 0 new findings. Frozen:
    `tests/cases/lists/nullable-scalar-list.vl`. Pre-existing and OUT of scope (a SEPARATE param-gate
    rejection, a clean fail-loudly, not a target shape): a nullable-scalar-list PARAM
    (`useIt(p: f32[]|null)`) still rejects at `only i32, i64, … parameters are supported`; the nullable
    scalar list as a struct FIELD is the remaining position (R5's field arm — a per-leaf field code).

- **Literal-union array LITERALS built the string list** (`const ks: VK[] = ["aa", "bb"]` —
  invalid wasm at the first atom-context use of an element: a `: VK` binding, a `VK` param,
  a top-level or in-function `for k in ks`; `print(ks[0])` "worked" by printing the string
  ref). Root: a bare `StrLit` types as `string`, so the literal's recorded type is
  `string[]` and `arrLitIsStr` (syntactic, first-element string-ness) claimed the
  string-list SLOT + collect + build, while every consumer read the i32 atom rep. Fix at
  the adoption seam: `assignableExpr`'s ArrayLit arm RECORDS the destination array type on
  the literal node when the element target is a literal union (the same context-adoption
  move as lambda expected-returns), and `arrLitIsStr` defers to the recorded type
  (`nodeArrayElemIsLitUnion`) — one signal, every position (binding/global/arg/return).
  Plus the start-fn locals pass gains the ForIn atom flag (`localLitUnion`) its
  `collectLocals` twin already had — another drifted parallel enumeration. Graduated
  (seed sweep): `p1c K0[]`, `p1r K0[]`. Frozen: `tests/cases/lists/atom-array-literal-binding.vl`.
- **`??` litunion-join audit (the follow-up to the atom-map `m[k] ?? <member>` fix) + the
  atom↔string VALUE-JOIN family it surfaced.** Verdicts per join seam:
  - `??` sites: SOUND. The member-literal rule is general (any `K | null` LHS, not just map
    gets); an atom (non-literal) default keeps the union; a `string`/non-member default over
    the niche or atom-map is a loud reject (`` `??` is only supported on a map index get `` /
    the `tErrUnsupported` channel). No other over-widening `??` spelling found.
  - if-EXPRESSION / match-arm / un-annotated-return joins: FIXED — the same class at three
    more seams. An atom joining a string types `string` and the raw i32 id flowed into the
    string-ref join (invalid wasm, both arm orders; match desugars to the chain). Fixes: the
    join's CHECKED type routes the if-expression string kind (`ifExprRefKind`/`exprString`,
    arm-order independent); the atom arm widens at `emitRefIfArm`; `retStrWiden` covers the
    INFERRED-string return (`cloRetIsString`) like the annotated one; the string-op scratch
    scan reserves the frame for atom arms (`ifChainHasAtomArm`). Two adjacent finds fixed
    with it: an ALL-ATOM join lost atom-ness at the binding (printed the raw id —
    `exprIsLitAtom` sees through a value-if now), and the checker's `else if` CHAIN join
    read the innermost block tail instead of the inner if's own join (dropping arms from
    the join type — `checkIfNode` now joins the chain correctly).
  - array-literal element joins (`[k, "cc"]`): loud reject (list-rep classifiers), unchanged.
  Frozen: `tests/cases/unions/atom-string-join.vl`.

- **`m[k] ?? <inline literal>` WIDENED a litunion struct field to `string` (silent MISMATCH)**
  (`{[string]: {a: f32, f: K0, z: i32}}`, `{f: {[string]: {a: boolean, f: K1, z: i64}}}`, K a
  litunion alias): reading the atom field — `print((m[k] ?? {…, f: "28", …}).f)` — rendered the RAW
  ATOM ID (`2`) instead of its member string. The map-value struct's litunion field is an i32 ATOM
  (interned in #847), so the read must widen the atom at `print`; but the `??` type-checker returned
  `joinTys(nonNull, default)`, and the LUB of the litunion field `{f: K}` and the inline default's bare
  `{f: string}` field WIDENED it to `string` — divorcing the checked node type from the atom rep, so
  `print`'s widening had no litunion members (`nodeLitUnionMemberTexts` empty) and fell through to
  `__print_i32__`. The VARIABLE-default spelling (`?? d`, `d: {f: K}`) was already correct (`joinTys`
  of two identical `{f: K}` types), so only the inline-literal default — the form the fuzzer's `??
  <same-shape dummy>` read emits — was wrong. Fix: the `??` result is the NON-NULL LHS type whenever
  the default is assignable to it WITH the field-wise object-literal coercion `assignableExpr` applies
  (the coercion #851 added through `| null`), preserving the litunion field; only an incompatible
  default falls through to `joinTys`. A one-line checker change (no emit-side change — the store already
  built the atom correctly, and once the read node types `K` the existing atom-widening path fires;
  the `K`-typed node also self-trips `anyLitUnionUsed`, so no `gLitUnionUsed` gate change was needed).
  Graduated (seeds 101/202/303): `p0r {[string]: (f32 | null)[]}`, `p1r {[string]: {a: f64, f: K0,
  z: i32}}`; the wider 4242/7777 sweep additionally graduated the two shapes above + `{[string]:
  {[string]: K0[]}}` (5 shapes, 0 new findings, 0 regressions). Frozen:
  `tests/cases/maps/coalesce-litunion-field.vl` (reproduces the raw-atom mismatch on master).

- **INLINE struct shapes as MAP VALUES were never interned** (`{[string]: {f: f32}}`, the nested-map
  struct field `{[string]: {f: {[string]: i64}}}`): emitted `unsupported map value type` while the
  NAMED-alias spelling (`type S = {f: f32}; {[string]: S}`) round-tripped. Root (position-DEPENDENT
  interning): `internShapeDeep` (the `collectAnnShapes` per-TypeRef interner) peeled paren / nullable /
  array / functype wrappers to reach a buried inline shape but had NO map arm — the whole map is ONE
  TypeRef name, so `internInlineShape` no-op'd on it and the value's struct shape never entered `sNames`.
  The mv-slot interner (`mvShapeOfValName` → `structIndexByValName`) then found no struct and rejected
  (kind -3). A `{f: i64}` / `{a:i32,f:f64,z:i32}` value "worked" only by luck — its STORE LITERAL
  (`{f: 5000000000}`) self-collected via `collectAnonShapes`; an f32 field written from a variable
  (`{f: v}`) or a map field (`{f: inner}`) codes -1 in `anonFieldCode`, so neither path interned it.
  Fix (position-INDEPENDENT, the #837 template): `internShapeDeep` gains a `nameIsMap` arm that recurses
  into the value (`mapValNameOf`), the inline dual of the named-alias value's own TypeRef — so any inline
  shape buried in a map value at any depth interns before `collectA` resolves the mv slot. Exposed +
  fixed a LATENT same-field-name-set collision: two inline struct map values sharing a field-name SET but
  differing in field CODE (`{f: f32}` and `{f: {[string]: i64}}`) both interning now let the map STORE
  and the `?? default` READ resolve the value-struct literal via `structIndexOfObj` (field-name-set
  match) to whichever struct interned FIRST — a wrong-layout `struct.new` (invalid wasm). Fix: the map
  store (`emitMapSetV` overwrite + `emitMapPushValV` append) and the `?? default` read seed the
  expectation ctx's `structIdx` from the mv slot's `mvValStructIdx` (a kind-1 struct value) so `emitObj`
  builds the map's DECLARED value struct — the same `pendingStructIdx` hint a struct-typed call arg
  already uses. Graduated (seeds 101/202/303): `{[string]: {f: {[string]: i64}}}` p0c/p0r; the wider
  4242/7777 sweep additionally graduated `{[string]: {f: {[string]: boolean}}}` p2c/p2r and
  `{[string]: {a: boolean, f: i64 | null, z: i64}}` p2r (5 shapes total, 0 new findings, 0 regressions).
  Frozen: `tests/cases/maps/inline-struct-value-intern.vl`. Still baselined (a DIFFERENT family's residue,
  not a map gap — fail identically at a plain local): `{[string]: {f: f32}}` / `{[string]: {a:f32,...}}[]`
  (the fuzzer's float-literal store trips the f32-widening reject `cannot assign {f: f64} to {f: f32}?`),
  `{[string]: {a: f64, f: K0, z: i32}}` (the litunion field widening `{...f: string...}` vs `{...f: K0...}`).

- **Typed-value maps in COMPOSITION positions** (a map as a LIST element / a NESTED-map value /
  inside a STRUCT field): `{[string]: f32}[]`, `{[string]: f64[]}[]`, `{[string]: {f: string}}[]`,
  `{[string]: {[string]: f64}}`, `{f: {[string]: {[string]: f32}}}` — all emitted invalid wasm
  (`type mismatch: expected (ref $type), found (ref $type)`) while the SAME value types worked at a
  local / return / param boundary. Root (position-DEPENDENT rep): a map ref-list ELEMENT (kind 3)
  hard-coded its struct heap to the mono `$mStructIdx` (`mAssignTypeIndices`), so a store/read of a
  TYPED map ref mismatched the element heap — an atom-valued inner map worked only because atoms
  ride the mono struct. Fix (position-INDEPENDENT): the kind-3 element heap resolves the element
  map's OWN per-value struct (`mvMapTypeIdx`, deferred to a second pass since those are minted after
  the ref-pair loop); `ensureRefElem` interns the element map's value mv slot so a composition
  position forces the same slot a standalone `{[string]: V}` binding does; and `mapShapeOfExpr`
  gained a composition-read arm (`compositionMapReadSlot`) so a nested-map read (`outer[k] ?? d`) and
  a list-of-maps read (`xs[i]`) bind the yielded map with its TYPED slot instead of falling to the
  mono `$mStructIdx` local. The store/read machinery was already generic over `rlElemHeap`, so no map
  op changed. Graduated (seeds 101/202/303): the five shapes above at p1/p2 c+r (10 baseline lines);
  wide sweeps 4242/7777 additionally graduated 14 deeper compositions (`{[string]: f64}[]` at p0,
  `{[string]: {[string]: f32}}`, map-in-union-in-list, deeply-nested string maps in struct fields).
  Frozen in `tests/cases/maps/map-in-list-composition.vl` + `nested-map-typed-value.vl`. Still open
  (a distinct closure-result seam, NOT this family): a map RETURNED FROM A CLOSURE
  (`() => {[string]: string}` / `(i32) => {[string]: f32}`, construct-only `p2c`) — the closure
  functype result has no `$fnsig` token for a map (`repSigTokOfKind("map") == ""`), so the fat-pointer
  result rep is unresolved; the READ variants (`p2r`) already reject cleanly.
- **Maps with non-{i32,string,struct} values at the RETURN/param boundary** (`{[string]: i64}` /
  f64 / f32 / closure / union valued): the boundary gate (`retMapFlag`) enumerated the supported
  value types independently of the local interner (`mvShapeOfValName`) and lacked the scalar /
  closure / union arms — the functype result fell through to i32 over a ref-returning body
  (invalid wasm at the return seam). Fix: ONE classifier (`mvValKindOfName`) that both read.
  A third parallel enumeration of the same set (`retIsMapLocalAnnot`, the un-annotated-return
  classifier) now reads it too. Prime repOf evidence: three sites, one kind vocabulary.
- **Atom-valued maps** (`{[string]: K0}`, depth 1!): classified as UNION-boxed values (the member
  count claimed the litunion alias) while the reads/consumers treated the value as the bare i32
  atom — invalid wasm even as a LOCAL. Fix: an atom value IS an i32, so the map rides the MONO
  map; member literals lower in atom context (`pendingLitUnion`) at the store / `??`-default
  sites, the map KEY is shielded from the ambient atom context, and the fused `m[k] ?? <member>`
  read keeps the union type (checker) so `print` widens the atom. A `??` default outside the atom
  rep (a `string` value / non-member literal) is a LOUD `tErrUnsupported` reject.
  Graduated (seeds 101/202/303): `{[string]: i64|f32|f64|K0}` at p1/p2, `{[string]: {[string]:
  K0}}`, `{[string]: () => {f: i64}}`, `{[string]: (i32) => {a,f,z}}` — frozen in
  `tests/cases/maps/map-return-value-kinds.vl` + `atom-valued-map.vl`.
- **Composite global initializers → unparseable modules**: two field-classification arms, not the
  global path itself (the same shapes broke as LOCALS; the constexpr global made it a PARSE failure
  because the mismatch sits in the global section).
  - `{f: K0[]}` (atom-array field, any position): the field is code 4 — the i32 list of atom ids —
    but the member-literal value self-classified as a STRING list (its elements are string exprs
    syntactically) and the wrapper ref mismatched the field type. Fix: record the litunion-array
    name on code-4 fields (`sFieldIsLitUnionArray`), seed the atom-element context at the
    construct/assign sites, route the literal to the i32-list build under that context, and force
    the i32-list types from the field table (an inline-shape field type is never a standalone
    TypeRef the collect scan sees). Frozen: `tests/cases/structs/atom-array-field.vl`.
  - `{f: (() => T) | string}` (union field carrying a CLOSURE member): `nameFieldCode`'s SUBSTRING
    `=>` test claimed the whole union as a bare closure field (code 14) while the initializer built
    another ref. Fix: the depth-aware `annArrowAt` (a union member's arrow is nested in parens), plus
    the nullable-closure text arm (code 22) `fieldTypeCode` already had — one more enumeration pair
    (name-based vs node-based field codes) that had drifted. A LOCAL binding of this shape is still a
    clean loud reject (`isValueUnionName` has no closure atom kind — a follow-up, not a hole).
    Frozen: `tests/cases/globals/union-closure-member-field-global.vl`.
- **Lambda returning a struct with an i64 field** (`() => {f: i64}` — invalid wasm in the body;
  block-bodied broke at the CALL side): a lambda's return shape is inferred from its LITERAL
  (`anonFieldCode` — no annotation to read), and the VALUE-based field-code enumeration lacked the
  scalar-leaf arms the ANNOTATION-based one (`fieldTypeCode`) had: an i64-magnitude literal coded
  its field i32 (the body `struct.new`ed an i64 into an i32 field), and a float / i64-magnitude
  ARRAY element coded an i32 list over an f64/i64-list value. Added codes 23 / 25 / 26 to
  `anonFieldCode` and the `arrLitIsI64` collect branch (the i64 sibling of the f64 one). More repOf
  evidence: the same field-code vocabulary had three producers (annotation node, annotation text,
  literal value) drifting independently. Graduated 7 pinned-seed shapes (i64/f64 fields inside map
  values, closure-returned multi-field structs, `i64[] | null` global construct); frozen in
  `tests/cases/closures/lambda-i64-struct-return.vl` + `tests/cases/objects/anon-shape-i64-f64-fields.vl`.
  RESOLVED (the widening seam): a SMALL literal into an i64/f64 STRUCT FIELD through a lambda
  (`() => {f: i64} = () => ({f: 5})`, expr- and block-bodied, arg/array positions) — the checker's
  contextual return adoption now has a FIELD-LEVEL arm (`objRetWidenAdopt`, the object dual of the
  scalar rule): when every widening field of the literal-bodied return is a re-encodable int
  literal, the lambda adopts the expected shape and the wide field type is RECORDED on the literal
  node — `anonFieldCode` (the literal-shape interner) and `emitNumLitNode` (the value emit) both
  honor it, and `structIndexOfObjCtx` gains the i64 discrimination axis its f64 rule already had.
  Non-adoptable spellings (`= mk` named value, `{f: n}` non-literal) are clean rejects via
  `objNumWidens` in `fnSlotAssignable` (object dual of the scalar invariance). Frozen:
  `tests/cases/closures/lambda-widens-struct-field.vl`,
  `tests/cases/types/fn-value-struct-field-invariant.vl`. Pre-existing and OUT of scope: two
  same-field-name-set shapes with different scalar reps in one program (`type S = {f: i32}` +
  `() => {f: i64}`) — invalid wasm on master even for magnitude literals, now a loud
  "no interned signature" reject; the name-set-keyed interning is the documented limitation.

---

# Wave re-grounding (2026-07) — structural interning is COMPLETE; taxonomy of what remains

A fresh authoritative sweep against master (post `repCanonKey` / `buildStructTwins`, #833 +
#834) re-derives this workstream's state from scratch. Sweeps: seeds 101/202/303/4242/7777,
depths 3–4, count 300 (`--keep` per seed); plus the pinned-param baseline check
(101·d2 / 202·d3 / 303·d4 × count 120). Result: `native-fixpoint` CONVERGES, the baseline is
ACCURATE (0 graduations, 0 regressions at pinned params), and the finding-set is unchanged.

## Verdict: the struct-shape STRUCTURAL-INTERNING slice is already landed
Every collision "the rep rewrite" named as the interning target round-trips on master today —
verified by direct probes AND already frozen as `@run` regression fixtures:
- `{f:i32}` vs `{f:i64}` (declared aliases AND inline `{f:i32}`/`{f:i64}` in one program) —
  distinct slots, the i64 stays 64-bit. Frozen: `structs/structural-non-twin-distinct.vl`.
- deep same-shape `{f:{f:{f:i32}}}`, and `{f:{g:i32}}` vs `{f:{g:i64}}` — distinct.
  Frozen: `structs/inline-shape-same-name-nesting.vl`.
- union-of-shapes `{x:i32}|{y:i32}` — `is`-narrows and reads correctly.
- generic monomorphs `Pair<i32,i64>` vs `Pair<i32,i32>` (same field-name set, different rep) —
  distinct slots. Frozen: `generics/type-alias-pair.vl`, `generics/swap.vl`.
- structural twins `type A={v:i32}`/`type B={v:i32}` share ONE heap type.
  Frozen: `structs/structural-twin-heap-dedup.vl`.

Why it is closed: `annShapeIndexOf` already keys each field on (name, emitter field-CODE,
recursive element-TEXT) and recurses through nested shapes — nested field TYPES are NOT
ignored (the #668 element-name comparison + the field-code axis separate every scalar/nested
rep). The heap layer then dedups the truly-structural twins via `repCanonKey` (#834), guarded
by `structFieldCodesEq` so only same-LAYOUT twins merge.

ARCHITECTURAL NOTE — the intern table must NOT be re-keyed onto `repCanonKey`. The intern
table is a LAYOUT table, not a checker-structure table. Two structurally-identical checker
types can lower to DIFFERENT layouts (an atom-backed litunion field `type K="a"|"b"` vs an
inline `"a"|"b"` string field — the `WithAlias`/`WithInline` case in the non-twin fixture).
`repCanonKey` equates them (same checker structure); the emitter must keep them apart. So
`annShapeIndexOf` correctly keys on field CODES (layout identity), and `repCanonKey` is
confined to the heap-dedup layer where `structFieldCodesEq` re-imposes the layout guard.
"Recursive structural interning" was delivered as this TWO-LAYER split (field-code intern +
structural heap dedup), not a single key — unifying the intern onto `repCanonKey` would
OVER-merge distinct layouts.

## Current failure taxonomy (post-#834), grouped by ROOT
All remaining findings are GENUINE MISSING REPS in composition (codegen adds for later
waves), NOT intern routing losses — except the one seam noted in R3. Classes: INVALID-WASM
(soundness) · REJECT (fail-loudly tail). Family sizes are unique-shape counts across the
five sweep seeds at d3–d4.

### R1. Typed-value maps IN COMPOSITION — MISSING REP (dominant: ~106 INVALID-WASM shapes)
Repro: `const g: {[string]: f32} = {…}`; also map-in-map `{[string]:{[string]:T}}`,
struct-valued `{[string]:{f:T}}`, map-in-list `{[string]:T}[]`, nullable map
`{[string]:T} | null`, map-in-field `{f:{[string]:T}}`, closure-returned `() => {[string]:T}`.
Class: INVALID-WASM.
Losing site: `repOfMap` (emit_rep.vl ~539) returns `repUncovered()` for any value beyond
i32/boolean; the mv interner `mvValKindOfName` (emit_classify) resolves typed map values ONLY
at the return/param boundary (prior wave), never as a struct-field code, a list-element kind,
or a nested-map value kind.
Verdict: MISSING REP — the map value rep does not compose. Give the mv interner a
composition entry (field code + list element + nested-map value) backed by a per-value-kind
map struct.

### R2. Closures over COMPOSITE results/params — PARTLY the sig token (STALE), partly shape-interning + i64/f32-list
Repro: `() => {f:i32}`, `{f: () => {f:i32}}`, `() => i64[]`, `(i32) => {[string]:T}`. Also the
documented `type S={f:i32}` + `() => {f:i64}` case surfaces HERE.
Class: INVALID-WASM / REJECT (`function-value call arity has no interned signature`).
Losing site (as originally diagnosed): the value-call ABI token table `repSigTokOfKind`
(emit_rep.vl ~113).
Verdict UPDATE (fresh sweep, post-#836): the token-table diagnosis is STALE. `repSigTokOfKind`
already carries `s`/`n`/`V`/`r` (struct/nulstruct/variant/reflist) and `a`/`A`/`D` list tokens,
and the closure sig machinery (`cloRetKeySuffix`/`cloParamTok`/`cloSigKeyExt`, emit_classify)
already keys composite results/params. `() => {f:i32}`, `{f: () => {f:i32}}`, the scalar-list
results (`() => i32[]`/`string[]`/`f64[]`), and composite PARAMS (`({f:i32}) => i32`) all LOWER
on current master. The remaining live gaps are NARROWER and NOT the sig token:
  - **R2a — inline-shape-in-functype not interned (RESOLVED here).** A lambda whose inferred
    return is an inline struct with BARE-PARAM field values (`(i32) => {f:i32} = (x) => ({f: x})`,
    also `{a,b}`, `{f:{g}}`, captured-var fields) failed loudly ("ref valtype with no interned
    shape"). A literal `{f:1}` / expr `{f:x+0}` field coded a rep and interned via
    `collectAnonShapes`; a bare param field codes -1 (`anonFieldCode`), so the literal had to
    NAME-SET match a pre-interned annotation shape — but the inline shape lives inside a
    FUNCTION-TYPE annotation (one TypeRef name `(i32)=>{f:i32}`), which `internShapeDeep` never
    descended (a plain local `const o: {f:i32} = {f: g}` interned fine; a named-function value
    `= mk` worked — only the inline lambda failed). Fix: `internShapeDeep` now recurses into a
    functype's params + result (`internFuncTypeShapes`), interning each PLAINLY-LOWERABLE inline
    shape (scalar / string / scalar-list / nested-struct fields — `funcTypeShapeLowerable`). A
    struct-with-map (R1) / value-union (R3) / nullable-list (R5) field is NOT interned, so the
    closure stays a CLEAN reject (never invalid wasm) — a broad intern turned 5 clean REJECTs
    into module-level INVALID-WASM in the sweep (the interned f32-map/union-box field emitted a
    broken type), so the interning is gated on lowerability. Frozen:
    `tests/cases/closures/lambda-struct-result-param-field.vl`,
    `tests/cases/closures/error-composite-closure-result-map-field.vl`. Graduated (CI seeds):
    `p0c/p0r (i32) => {f: boolean[]}`. Zero-regression: fuzz finding-set only SHRANK (8 shapes
    fixed across seeds 101/202/303/4242/7777 d4–5, 0 new).
  - **R2b — i64[]/f32[] closure RESULT (RESOLVED, was INVALID-WASM).** `() => i64[]` / `() => f32[]`
    emitted invalid wasm ("expected (ref $type), found (ref $type)" in the lambda body, then
    "expected (ref $type), found i32" at the value call): the inferred return-kind chain had arms
    only for i32-list (2) / reflist (5) / strlist (7) / f64list (12), so an i64/f32-list body built
    the wide wrapper against a functype result the chain defaulted to the i32 list. Fix — route the
    two leaves through the SAME closure-result machinery f64list already uses: `fRetListKind` codes
    20 (i64-list) / 21 (f32-list) added to `retKindChainOf` and to the inferred-return classifiers
    (`criClassify`'s `exprI64Array`/`exprF32Array` arms, before the generic `exprArray` arm; the
    `buildFnMap` inferred-return-name pass), plus the ABI tokens `L` (i64list) / `F` (f32list) in
    `repSigTokOfKind` ⇄ `repKindOfSigTok` (kept EXACT INVERSES — verified by a full pinned-seed
    round-trip: 0 regressions), reflected on both `$fnsig` producers (`annRetKind`/`annParamKind`
    for the annotation side; `cloRetValKind`/`cloParamTok` already read the shared token). The
    checker's per-node f32[] typing is unreliable (a float literal types f64), so the anonymous
    lambda's inferred RETURN NAME is recorded (`isScalarListRetName`, a lambda-only gate that does
    NOT reach the redundant-return lint) — the syntactic classifier alone missed the f32 case.
    `fbValtype` already had the `il64TypeIdx`/`fl32TypeIdx` result arms. Bonus: an i64[]/f32[] PARAM
    closure (`(i64[]) => i64`) now lowers too (the same token feeds `cloParamTok`; previously a
    clean reject). Frozen: `tests/cases/closures/lambda-scalar-list-result.vl`. Graduated (wide
    sweeps 4242/7777 d3–4): `() => i64[]` (p1c/p1r) and `{f: () => i64[]}` (p1c/p1r) — the fuzz
    finding-set STRICTLY SHRANK (6 shapes fixed, 0 new). Still position-DEPENDENT and OUT of scope:
    an i64/f32-list closure result stored into an UN-annotated module GLOBAL (`const xs = v()` at
    top level) hits the pre-existing global-CELL i64/f32-list bug (a `const xs: i64[] = [-2]` global
    fails identically on master — its cell mis-emits) — the closure result lowers correctly in every
    function-body position.
  - `() => {[string]:T}` map result stays a clean documented reject ("a function value may not
    ... return [a map]"), R1-adjacent, not part of R2.

### R3. Value-union BOX carrying a scalar/composite member — MIXED (~10 pure-struct shapes)
Repro: `{f: f32 | {w:i32}}` (INVALID-WASM `expected f32, found f64` on the box read),
`{a,f,z} | scalar`, `(boolean|i32)[] | null`, `(boolean | {w:i32})[] | null`.
Class: INVALID-WASM.
Losing site: the union-box field READ / `emitUnionCoerce` scalar-widening seam (an f32 member
read back as f64), plus the box rep for a composite member.
Verdict: MIXED — the f32/f64 read seam is a ROUTING LOSS (same family as the prior FIXED
widening seams, an `emitUnionCoerce`/box-read arm; the ONLY routing loss left); the
composite-member box is a MISSING REP. Separable.

### R4. Nested (2-D) arrays under a composition wrapper — MISSING REP ("2-D array backing")
Repro: `{f: f64[][]}`, `{f: {f:i32}[][]}`, `(i32[][] | null)[]`, `{[string]: boolean[][]}`.
Class: INVALID-WASM / REJECT (`nested arrays are not supported`).
Losing site: `repOfArray` (emit_rep.vl ~501) returns uncovered when the element is itself a
`TyArray`; no 2-D backing wrapper for an array-of-array reached under a nullable/struct/list/
map. (Bare `i32[][]` works, `f64[][]` does not — the leaf scalar matters, which is why blanket
rejects over-reject.)
Verdict: MISSING REP — the 2-D array backing type.

### R5. Nullable list in a struct field / binding — MISSING REP ("nullable-list-in-field wrapper")
Repro: `{f: i32[] | null}`, `{f: (i32|null)[] | null}`.
Class: REJECT (`bare null needs a struct-typed context`).
Losing site: `repOfNullable` (emit_rep.vl ~443) covers `i32[]|null` at the STANDALONE position
only; a nullable list has no rep as a FIELD or a non-standalone binding.
Verdict: MISSING REP — the nullable-list-in-field wrapper.

### R6. Struct through a LIST / nullable-list receiver — MISSING REP ("struct-through-list receiver")
Repro: `({f:f64}|null)[]`, `{f: {f:f64}[]}`, `{f: {f:{f:i32}[]}}`.
Class: REJECT (`field access receiver is not a struct`).
Losing site: the field-access receiver classifier loses the struct through a list element / a
nullable-list element.
Verdict: MISSING REP — struct-through-list receiver.

### R7. Struct-ARRAY member of a value union — DEFERRED (MISMATCH + MISSING REP; needs a clean base)
Repro: `{a: f32, f: K0, z: string}[] | {w: i32}` (p1c/p1r), and the minimal `S[] | {w: i32}`.
Class: MISMATCH (silent wrong result) + REJECT. TWO distinct sub-issues, both DEFERRED (the
merge train was too deep to add a rep + a discrimination fix on a moving base):
- **(a) INLINE-annotation `is` MISMATCH (pre-existing on master).** An INLINE union annotation
  `S[] | {w: i32}` built with the `{w: i32}` member value mis-discriminates: `if v is {w: i32}`
  is FALSE (prints the array arm — a silent wrong result), while the NAMED-alias spelling
  `type U = S[] | {w: i32}; const v: U = {w}` round-trips CORRECTLY. So the inline union's
  member registration does not tag the struct-array vs struct members the way the named alias
  does — a registration/tagging difference, the value-union-box analogue of the inline-vs-named
  FIELD-union gap #840 fixed for fields. Precise site: the inline-union member registration
  (`registerInlineUnion` / the struct-array-member arm of the value-box variant registration) —
  make the inline struct-array-union member intern + tag exactly like the named-alias path.
- **(b) inline MULTI-FIELD struct-array element — MISSING REP.** The element `{a: f32, f: K0, z:
  string}` (an f32 + litunion + string field mix) rejects at emit (`binding's inline-shape type
  has an unsupported field`): a ref-list-of-inline-multi-field-struct is not internable as a
  value-union member payload. A single-field `S[]` element interns; the multi-field mixed-rep
  element does not. Precise site: the union-member ref-list element interning
  (`letAnnIsUninternedShape` / the value-box list-member arm) must intern a multi-field struct
  element the same way a standalone `S[]` binding does.
Verdict: DEFERRED — (a) is a silent-wrong-result discrimination bug (NOT merely a missing rep),
(b) a missing rep; both want a clean, drained base and careful work, not a rushed add.

### R8. `(boolean | null)[]` — DOCUMENTED CLEAN REJECT (acceptable fail-loud, NOT a bug)
Repro: `(boolean | null)[]` (p1c/p1r). Class: REJECT (`a nullable-boolean list element has no
rep; use a non-null element type`). The element is a NICHE nullable (one non-null member + null —
deliberately not a value-union box, so no box rep), and a nullable-boolean list element has no
settled backing (`boolean`'s i32-sentinel niche does not compose into a list slot). `collectA`
rejects it cleanly at emit — a LOUD fail, never invalid wasm. This is an ACCEPTED long-tail reject
pinned in the baseline (the corpus harness cannot assert emit-time errors, so no `@error`
fixture); a rep would need a distinct nullable-boolean list backing that the matrix does not yet
justify.

### Clean-reject long tail (NOT bugs) — unchanged
Map params, deep lambda-param inference, f32-through-wrapper, string→litunion-through-nullable,
`is` over some deep structural types. Fail-loudly; pinned in the baseline.

## Recommended remaining holistic sequence (per-family site)
1. R3a (ROUTING LOSS): the union-box scalar-read widening seam (`emitUnionCoerce` / box field
   read) — the only remaining routing loss; smallest, gated like the prior widening waves.
2. R1 (MISSING REP): typed-value maps in composition — the mv interner composition entry
   (`mvValKindOfName` → field code / list element / nested-map value) + per-value-kind map
   backing. Highest shape count.
3. R4 (MISSING REP): 2-D array backing wrapper (`repOfArray` element recursion + a nested-list
   backing type).
4. R5 (MISSING REP): nullable-list-in-field wrapper (`repOfNullable` field arm + a field code).
5. R6 (MISSING REP): struct-through-list receiver (the field-access receiver classifier).
6. R2 (MISSING REP): composite closure-result ABI token (`repSigTokOfKind` + `$fnsig`
   composite slots) — with the closures workstream.
