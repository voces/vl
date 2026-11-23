# IR-M1: omitting variant literals and re-laid literal sets (2026-11-23, lane IR-M1)

Two mechanisms, one commit each. Both close record-literal cells the module-piece re-measure named
(object layout ×4, the literal-set relay ×2).

## 1. A re-laid literal-set field reps at the string

A layout family re-laid at the string (D14752, `famRelayField`) stores a literal-set field such as
`K = "circle" | "round"` as the string in every row of the family, while the rep tree keeps the set as
its atom. `rtOfObjAs` now asks the record's row (`rowFieldStorage`, through the recorded asks
`rowFieldAsksHold` re-checks) for an atom-rep field too, and reps it as the string on a 0, as it
already did for a lone literal.

## 2. A variant literal that omits fields

`emitVariantStruct` builds a variant literal that leaves out a field the row may omit
(`variantFieldMayOmit`) with the `null` node its check minted (`omittedFieldNullNode`), when no stash
is needed. `objLitVariantOmitAt` (wasmEmit, beside `objLitVariantLayoutAt`) names that row by the
same condition, and `objLitAt` delivers each omitted field from that node. Its only callers are the
IR's, so no legacy bytes move. `omittedFieldNullNode` is exported for it.

## R8

| IR predicate | legacy answer it calls |
| --- | --- |
| re-laid literal-set storage | `rowFieldStorage` (`structRowOfRecordTy`, `structRowFieldStoresAtom`) |
| omitting variant row | `objLitDropsField`, `objLitNeedsOrderStash`, `variantFieldMayOmit` |
| an omitted field's value | `omittedFieldNullNode` |

## Left

The cells move on to other classes:

- empty-object-all-nullable-runs's union cells reach `rep ?` (D17077, N3).
- tagged-arm-nullable-field-literal and the witnesses reach `narrowed field unbox rep` and
  `coalesce field place` (N2).
- layout-family-literal-set-beside-string's start reaches `narrowed field read coercion` (N7).

## Readings

PENDING
