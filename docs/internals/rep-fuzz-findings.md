# Rep-composition fuzz findings

The VL-native rep-composition fuzzer (`scripts/fuzzgen.vl` + `scripts/fuzz-vl.sh`) buries a literal
payload inside a randomly-nested rep (struct field / list element / nullable) and reads it back; the
round-trip is the oracle. Run it: `scripts/fuzz-vl.sh --seed 1 --count 400 --depth 4`.

**Depth 1 (single wrapper over a scalar) is fully green** — `{f: K}`, `K[]`, `K | null` all round-trip.
So do several depth-2 shapes (`{f:{f:i32}}`, `{f:i32}[]`, `i32[][]` standalone). The failures are
specific DEEPER COMBINATIONS — the nuanced boundaries a hand-written corpus misses. ~19/400 cases at
depth 4 fail, in these families (example signature → error):

## Soundness holes (emit INVALID WASM — highest priority)
A valid program that compiles to bytes failing wasm validation / trapping, not a clean reject:
- `{f: f64[][]}` — struct field that is a 2-D f64 array → wasm validation error.
- `{f: f64[]}[]` — list of structs whose field is an f64 list → `failed to compile: wasm[0]::function go`.
- `{f: {f: (i32 | null)[]}}` — struct→struct→nullable-i32 list → wasm runtime error.

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
- Discovered while triaging (NOT yet fixed): a PARENTHESIZED `is` condition defeats the emitter's
  narrow rewrite — `if (x is i64) { print(x) }` over a value union emits the boxed read (invalid
  wasm, `expected i64, found (ref $type)`); the un-parenthesized spelling lowers fine. The fuzzer
  never parenthesizes, so no shape pins it.
- Still failing (other agents' families, seen in the re-sweeps): `() => {f: i64}` closure-struct
  sigs, `{[string]: {f: i64}}` map values, `i64[] | null` GLOBAL initializers.

## RESOLVED

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
  STILL OPEN (the widening seam, not this shape family): a SMALL literal into an i64 STRUCT FIELD
  through a lambda (`() => {f: i64} = () => ({f: 5})`) — the literal-inferred shape codes the field
  i32 and only the contextual annotation knows better (the scalar spelling `() => i64 = () => (5)`
  is fixed — the lambda contextual-return widening).
