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
- **`const v: f64 | null = null`** — an actual `null` into a nullable-f64 LOCAL → `expected i32,
  found f64`. The non-null carrier works; `i64|null`, `f32|null`, `boolean|null` with `null` all work.
- **`(f64 | null)[] = [8161.5]`** and **`(boolean | null)[] = [true]`** — CONSTRUCTING a
  nullable-f64/boolean list from a value → invalid wasm (`(i32|null)[]` works; the READ side of the
  f64 case is a clean reject — the construct-only variant exposed it).
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
- **Multi-field struct with an i64-list field as a union variant**: `{a: i32, f: i64[]} | i32`
  construct → invalid wasm (single-field `{f: i64[]} | i32` and i32[]/f64[]/string[] fields work).
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
- **boolean prints as 0/1 instead of false/true** through: a struct FIELD read (`{f: boolean}` —
  depth 1!), a map `??` result, a closure-call result (`(i32) => boolean`), and a `boolean[]`
  PARAM's element (a local `boolean[]` element prints `true`). print's boolean rendering is
  type-driven and these read paths surface the value as bare i32.

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

## Notes
- The union `is`-oracle needs the decoy to NOT admit the carrier literal (see `pickAlt`); when
  adding decoy types, keep that invariant or the round-trip claims a bug the spec doesn't make.
- The i32-only leaves of the OLD generator hid every family above — all of them involve i64/f32/
  boolean/atom leaves, maps, closures, or the param/return/global positions.

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
