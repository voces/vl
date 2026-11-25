# START-2: the global read, store and index classes (2026-11-25)

Lane START-2 (split from COV-START). Census restricted to the class programs COV-START listed,
master d171a617, seed `build/vl-compiler.wasm` refreshed on each side.

| class | before | after |
|---|---:|---:|
| global index | 6 | 0 |
| global store coercion | 6 | 1 |
| global read coercion | 8 | 4 |
| argument coercion (moved in) | 0 | 2 |

On those programs: tests/cases distinct functions 179 → 183 of 200, start bodies 1 → 8 of 42;
witnesses start bodies 0 → 2 of 17.

Mechanisms, one commit each:
- A union global narrowed to a niche (`identReadArmOf` = `niche`) reads its box through the niche
  tail, as a box local does.
- A struct global read at a record its cell's row holds (the read's record is that row, or one no
  row records) reads at the row's type, as `rowlessReadTyOfVar` does for a local. Asked only where
  every other arm declines.
- A global store retags a value that stands at the cell's rep under the `let` initializer's tests
  (`storedAsStands`).
- `globalMinted` answers for an extern binding: its import index is fixed at parse.

Left open, with the local spelling missing alike (so not global-specific):
- `global read coercion` ×4: closure-holed reads (`hole-lambda-bundle-slot-read-held-and-handed`,
  `producers-of-fn-widened-holder-built-at-its-row-runs`, `return-literal-twin-nested`, D17385). In
  a function the same reads miss on `declaration coercion` or fall back on the verifier.
- `global store coercion` ×1 (D17076): `xs = []` into a cell whose list row is wider than the
  empty literal's type; a local reads `assignment coercion`.
- The local `assignment coercion` shares `storedAsStands`'s gap for a wider record; the helper
  applies there unchanged if its owner takes it.
