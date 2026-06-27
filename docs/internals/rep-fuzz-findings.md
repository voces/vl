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
