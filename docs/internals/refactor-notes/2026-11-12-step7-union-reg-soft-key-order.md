# Step 7 L6: the one-list sites find a set spelled in another order by its type key, 2026-11-12

Sites 27 and 28 (`unSiteOnKey`) ask the registry through the softened key (`unRowOfSoftKey`),
which keeps D4320's one-list collapse. That key comes from canon's render, which keeps member
order. A union is a set (D1712), so a row minted under one order is the row for every order. But
a let annotated `Circle|i32|string`, over the row minted for that type, missed at site 27 when
its type rendered `{r:i32}|i32|string`. The binding then took no box, and its init was stored
raw: invalid wasm.

## Changed

`unRowOfTyAB` at those sites asks the type key (`unRowOfTyKey`, order-insensitive by
construction) when the softened key finds no row. It only adds hits, and every softened-key hit
stands.

## Found by

Lane w317's `monoSubstLetType` spelled by the naming rule, which orders members differently from
the substitution. Four programs built invalid modules. Under the change with this fix:

| program | before | after |
| --- | --- | --- |
| `generics/widen-union-structT-narrowed-string-arm.vl` | invalid wasm | master's output |
| `generics/join-of-lists-literal-union-beside-string-at-instance.vl` | invalid wasm | master's output |
| `generics/pin-explicit-type-argument-union-member.vl` | invalid wasm | master's output |
| `generics/generic-is-over-anonymous-record-pin.vl` | invalid wasm | invalid wasm |

The fourth is a different gap. The let's synthesized annotation carries no type
(`synthTypeRefFb(…, -1)`), and its rule spelling (`#anon0|i32`) parses to none, so no typed
lookup can find its row. That is `monoSubstLetType`'s to give it.
