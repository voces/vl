# A nullable's miss names its non-null part's union; the floor keeps only function values, 2026-11-13

Lane A, the declared-alias family from lane G's producer floor (cut 8a, #7720). Emit only.

**The family.** After 8a, `unionNameRowOfExpr` named a union from the expression's box type, else
its node type, and fell to `unionNameOfExprFloor` (the old spelling producer) where neither named
one. G's probe put about 15 non-function-value calls in that floor. A probe at the floor on master
`6a8ee323` found all 15, in 5 programs:
- `maps/ctor-type-arg-union-value-registers` (8)
- `objects/record-field-holds-pinned-ctor-list-and-typed-map` (1)
- `strings/string-index-into-value-union-param` (1)
- `unions/narrowed-array-arm-index-binding` (1)
- `unions/narrowed-place-arm-delivery` (4)

Every one is an identifier read whose box and node type are both `X | null`: a union-valued map's
read with its miss (`const e2 = v["k"]` typed `K | null`), or the same over an alias member
(`J | string | null`). The value is `X`'s own box with `null` as its tag (D1009), but no row or key
names `X | null`, so no type named the union.

**The change** (emit_classify). A third typed rung in `unionNameRowOfExpr`, before the floor:
where the box type, else the node type, is nullable and its non-null part (`nonNullTy`) names a
union, the read names that union and pushes its row. A literal union's nullable is excluded, since
it is a niche, not a box. The floor's comment now names only the function-value contract.

**Probe** (full sweep population; the rule's answer against the floor's at every floor call):
- With the literal-union exclusion, the rule fires at exactly 15 sites in 5 programs, all equal to
  the floor's name, and nowhere else.
- Without it, it also named a union at 11 sites in 5 literal-union niche programs, where the floor
  names none: `generics/is-non-member-at-the-pin`, `generics/is-record-over-literal-union-niche`,
  `match/const-arm-dispatch`, `types/is-null-guard-niche-reps`, `unions/match-nullable-litunion`.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,204 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.
