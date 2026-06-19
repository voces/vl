# Unions — representation & discrimination

How VL represents and discriminates union types at runtime. Implementation: `unionInfo`,
`coerceUnion`, and the global tag registry in `compiler/toWasm.ts`; the type side
(`isEquatable`, soften, narrowing) in `compiler/typecheck.ts`. Roadmap items A6 / A16.

## Three encodings (chosen by `unionInfo`)

1. **Niche** — when one variant is "free", no box and no tag:
   - `T | null` where `T` is a reference → a WasmGC nullable ref; `is null` is `ref.is_null`.
   - `boolean | null` → an i32 with a sentinel value for `null`.
2. **Value-kind tagged struct** `{ tag: i32, value: <rep> }` — members share one scalar wasm rep
   (`boolean | i32`, `i32 | null`): `value` *is* that rep. binaryen's **Heap2Local** usually
   scalarizes the box away, so it costs no allocation in the common case.
3. **Boxed tagged struct** `{ tag: i32, value: anyref }` — reference or mixed-rep members
   (`string | i32`, `{x} | {y}`, `i32 | f64`): a reference is stored as-is, a scalar is wrapped in a
   one-field `{ rep }` box, recovered by `ref.cast` (+ a `struct.get` for value members).

## Tags are global

Variant tags are interned in a **global** registry keyed by the variant (not per-union), so a value
keeps its tag identity as it flows between a union and its sub-/super-unions — `is T` is a `tag`
compare. This is what lets a value boxed as `string | i32` pass through unchanged into
`string | i32 | null` (same box type, same tags), instead of being re-boxed at each boundary.

The key (`variantKey`) is **field-name aware** for struct members: it keys on `structSig` (the
shape signature including field names + recursive structure), **not** on the lowered wasm type.
WasmGC erases field names — `{tag, x}` and `{tag, y}` both lower to `(struct i32 i32)` and binaryen
interns them to ONE heap type — so a wasm-type key would hand two distinct struct variants the SAME
tag, and `v is A` would wrongly be true for a `B`. Keying on the field-name shape keeps distinct
shapes apart, so the tag a value is boxed with matches what `is A` tests (soundness). Other reference
members (string, list, map, closure) have no field-name shape, so `structSig` falls back to their
interned wasm ref type — a sound discriminant for them.

## Discrimination is by structural shape

VL is **structurally typed**, so a struct variant's tag identity is its *shape*, not its `type`
name. Two `type` aliases with the *same* field shape are the **same variant** — under structural
typing a `B` value genuinely IS an `A` — so `v is A` is (soundly) always true over a same-shape
`A | B`, and its `else` is dead. A union whose members share a shape needs an explicit
**discriminant field** (a `kind`/`tag` set to distinct values per variant) to tell them apart; the
shape alone cannot. Distinct-shaped variants (the AST-node `NumLit | BinExpr | Call` pattern) are
discriminated directly.

## Shared-field access

A field present on **every** member of a struct union with the **same** type is readable on the
union directly, without narrowing — `(A | B).tag`. The type side (`sharedUnionField` in
`typecheck.ts`) admits the access only when every member is a struct carrying that field at a
mutually-assignable type; codegen (`sharedUnionFieldRead` in `toWasm.ts`) dispatches on the variant
tag and reads the field at **that member's own index** (members may store a shared field at
different struct indices, since fields are sorted by name per shape). A field that is not shared — or
shared at a differing rep — still requires an `is`/`==` narrowing.

## Boxing happens at value-flow boundaries

One hook — `coerceUnion` (toWasm) — boxes a value into the desired union representation at every
boundary: assignment, argument, return. So discrimination works across function boundaries. The
typed core `coerceToUnion(value, fromType, toType)` is shared by that hook and the `?.`/`??` lowering.

## Known limits / remaining

- **Reference-vs-reference** discrimination uses the tag, not `ref.test`. A `ref.test` fast-path could
  drop the tag for all-distinct-heap-type ref unions. (It could not replace the tag for *struct*
  members, though — binaryen interns same-shape-different-name structs to one heap type, so
  `ref.test` cannot tell `{tag,x}` from `{tag,y}` apart; the field-name-aware tag is what does.)
- **Union arrays** (`[boolean | i32]`) hit the single-element-type WasmGC array wall.
- **Literal-union enum representation** is not built: a closed union of same-base literals could be a
  bare i32 tag (intern each literal, materialize the value at print/coercion boundaries). Today
  literal unions soften to their base at the value level, so a string union stores whole strings.
  (Roadmap A16.)
