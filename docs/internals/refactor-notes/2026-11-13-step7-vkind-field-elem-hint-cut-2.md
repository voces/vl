# Step 7, lane H: field element hints, cut 2, 2026-11-13

Cut 1 (#7693) took the shape interner's `-1` sites, which left `recordFieldElemRow`'s name
fallback (`fieldElemTyIxOfName`) reaching 122 programs. This cut takes `emit_collect`'s
callers.

## Probe

A scratch compiler ran over 24,070 programs, with a control tag on each. It tagged each reach
by site and compared the name's type with the field's projected row (`er`) and its own type
(`fty`):

| site | programs, summed per probe tag | the type the name resolves to |
| --- | --- | --- |
| a declared-struct, variant-shape or variant-node field (`pushFieldRow` through `fieldElemHintOfRow`) | 36 | a `\| null` literal union's non-null part: `K` for `fty = K \| null` |
| the same sites, a list of literal unions (the hint is `-1` by design) | 13 | `er`, structurally the same |
| an anonymous literal's row (`recordSFieldElemRowTy(…, aeTy)`), `aeTy` -1 | 54 | `er` (22 identical, 32 structurally same) |
| the same, `aeTy` -1 | 9 | `K` for `K \| null` (4); no type, `fty = _` (3); a numeric set `1\|2\|null` against the name's `i32 \| null` (2) |
| the shape interner's `en` with no row, and the alias-shape recorder | 14 | an inline literal union with no field type at all |

## The change

- `fieldElemHintOfRow` tests `tyPeelNul(fty)` for a literal union where the projection has
  none, so a `K | null` field hands `K`.
- The anonymous-literal row falls back to `fieldElemHintOfRow` over its field's row when its
  own hint is `-1` and it records an element name.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `0a83e7bb` against this, fixpoint seeds on both sides):
  24,204 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **The name fallback's reach** (the same probe after the cut): 122 → 32 programs. Left are
  inline literal unions with no field type, hole-typed anonymous fields, and the numeric set
  whose recorded name is the widened `i32 | null`,
  and the lists of literal unions whose hint is `-1` by design.
