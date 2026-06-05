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

## Boxing happens at value-flow boundaries

One hook — `coerceUnion` (toWasm) — boxes a value into the desired union representation at every
boundary: assignment, argument, return. So discrimination works across function boundaries. The
typed core `coerceToUnion(value, fromType, toType)` is shared by that hook and the `?.`/`??` lowering.

## Known limits / remaining

- **Reference-vs-reference** discrimination uses the tag, not `ref.test`. A `ref.test` fast-path could
  drop the tag for all-distinct-heap-type ref unions.
- **Union arrays** (`[boolean | i32]`) hit the single-element-type WasmGC array wall.
- **Literal-union enum representation** is not built: a closed union of same-base literals could be a
  bare i32 tag (intern each literal, materialize the value at print/coercion boundaries). Today
  literal unions soften to their base at the value level, so a string union stores whole strings.
  (Roadmap A16.)
