# Step 7 (lane D, D16032): the union key folds a brand over a scalar to its base, 2026-11-13

At `pushValueUnionRow`, D16032's first measurement found 64 programs whose value-union row a
label reached and the type key did not. The label folds three things the key kept apart: a
numeric literal set (lane G's half), a type alias such as `F32x4` against `v128`, and a nominal
brand such as `NtI32` against `i32`. The coordinator ruled that the storage row's key folds both
of the latter: an alias is the same type as its expansion, and a brand over a scalar shares its
base's box, so no runtime test can tell them apart inside the union. The checker keeps the brand.

`utkShapeText` (emit_union_tykey_text) keys a newtype over a primitive as that primitive. `F32x4`
is a newtype over `v128` here, so this one rule covers both cases. A newtype over a record or a
function keeps its name, since the label was not seen folding one.

## Measurement

MPROBE over the 24,070-record population:

| `pushValueUnionRow`: label row vs type-key row | key only | label only |
| --- | --- | --- |
| before | 19 programs | 64 programs |
| after | 19 programs | 25 programs |

All 25 programs left are numeric literal sets: `int-lit-set-dispatch`,
`litunion-mixed-type-member-dispatch`, `coalesce-numeric-binding`,
`coalesce-numeric-union-widens`. The fold fires in 47 programs.

**Byte comparison:** master against this change, 47 of 47 programs where the fold fires build
identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
