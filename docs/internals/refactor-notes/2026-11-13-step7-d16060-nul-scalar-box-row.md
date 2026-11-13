# Step 7 (lane D, D16032/D16060): the hole binding's `T | null` box carries its row, 2026-11-13

D16032's checklist (#7868) listed 28 name fallbacks. A probe of what they do found that only one
fallback ever resolves a name to a row the carried row lacked. That is `msSetOfRowOr`, reached
through `njKindsOfUnion` (wasmEmit) on a read typed at an instance hole: the D16060 family
(`fn-map-*`, `record-of-hole-fns-*`, `let-map-of-hole-fns`, `fn-set-map-get-binding*`). Every
other fallback either never runs or finds nothing by name either.

The row was lost in one place. A rung-by-rung probe of the hole read
(`unionNameOfHoleReadGo` → `letUnionNameOfHole` → `letUnionNameOf`) found every lost row in
`letNulScalarBoxName`. It names an un-annotated binding's `T | null` box and set no row; 168
programs read a name there that only the label table could map back.

`letNulScalarBoxName` now hands its row to `letUnionNameOfGo` (`letNulScalarBoxRowOut`):

- **a scalar box** (`i32|null`, `f64|null`, … named from the member's rep): the row the key of
  `prim | null` finds, read by the new `unRowOfNullableKey` (emit_union_tykey_text) without minting
  that nullable type, since `mkNullableTy` appends to the arena;
- **otherwise:** `unRowOfTyKey(ty)`.

## Measurement

MPROBE over the 24,070-record population, the row now carried against the name's label row:

| branch | programs | decisions | same | differ |
| --- | --- | --- | --- | --- |
| scalar box | 989 | 1,597 | 989 | 0 |
| type variable | 320 | 500 | 320 | 0 |
| numeric literal base | 10 | 26 | 10 | 0 |

Two scalar-box programs have no row either way. Before this change the scalar branch's type key
found no row in 175 programs (the binding's open type, not the box's).

**Byte comparison:** master against this change, 1,283 of 1,283 programs reaching
`letNulScalarBoxName` build identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
