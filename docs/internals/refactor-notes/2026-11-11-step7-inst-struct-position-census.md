# Step 7 inst: values of a union-arm type held at a struct row, census, 2026-11-11

Lane w321, from w319's famb 7 note (`2026-11-11-step7-famb-struct-index-of-expr-graded.md`,
#7183). That note left about 56 programs where `structIndexOfExpr` answers a struct row and the
value's rep reads as a variant. In those programs the value is no arm value, and no union-box
record (`boxDstTyAt`) exists. This census asks where those values sit.

## Method

The probe compiler was built in the scratchpad from master `1d517770` and never refreshed into
a seed. It wraps `structIndexOfExpr`. It fires once per node and function where four things
hold: the answer is a row ≥ 0; `repOfNodeAt` of `nodeTyAt` reads `variant` or `nulvariant`;
`exprVariantIndex` is -1; and `boxDstTyAt` is -1. It tags the node's kind, its up-link
(`cwIxUpKind`) and its parent's kind. The population is all 7,732 `tests/cases` programs, the
1,478 distilled `cells/` and the 10,336 `named/` cells.

## Reading

269 reaches in 84 programs: 64 in `tests/cases` and 20 distilled cells. The count is above
w319's 56 because this condition does not ask whether the storage and rep answers differ.

| position (up-link) | reaches | programs | typical value |
| --- | --- | --- | --- |
| compared with `null` (`CW_UP_CMP`) | 162 | 39 | a parameter `y: Ca \| null`, `Ca` an arm of `Sh = Ca \| Sq` |
| a field read's receiver (`CW_UP_OBJ`) | 59 | 30 | `xs[i].next` over `O \| null`; `a.f` with `a: A` |
| a call argument (`CW_UP_ARG`) | 29 | 16 | a record literal `{r: 1}` handed to a parameter typed at the arm |
| a `??` operand (`CW_UP_COAL`) | 12 | 7 | `f() ?? d`, typed `{r: i32} \| null` |
| no up-link | 7 | 6 | a hole's optional member read |

By kind: `Index` 48 reaches, `Ident` 44, `Member` 128, `ObjLit` 27, `Call` 22.

## What it is

In every class the value is stored or built as a plain record. Its binding, field, element or
parameter is declared at the arm, or at the arm with `null`, not at the union. The rep reads
`variant` only because `repOfTy` is per type, and a record type that is an arm of any union reps
as a variant. These are mostly **reads** (a compare, a receiver), not deliveries. So a union-box
record has no place here. A coercion record has none either, since no conversion happens.

The record the reader needs is the rep the storage holds the value at: struct, at the arm's own
row. A type cannot carry that, since the same type reps as a variant elsewhere. So the record is
a per-position rep kind, or the store column read through a rep rule that asks the declaration.
It is not a type alone. This decides how the rep layer treats union arms outside a union, and
it touches `repOfNodeAt`'s callers and the rep-fuzz gate. So this note stops at the census, for
the owner of the struct class (w319) and the orchestrator to choose the record's shape.

## Proof

Docs only. The probe compiler was never refreshed into a seed.
