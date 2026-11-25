# I8a: twin-row record lists in a const cell (2026-11-25, lane COV-START)

After #10053, 7 programs still sent a const cell to legacy's `emitExpr` (armed shadow, all 27,421
programs). Five of them hold a list literal of struct literals beside two declared records of one
layout (D2938, D6731, D6772):

```
type A = { v: i32 }
type J = { f: A | null }
type I = { f: A }
const il = [{ f: { v: 7 } }]
```

## The mechanism

- Legacy builds each element at its layout row, `J`'s. That row shares one struct heap with the
  list's element type `{f: {v: i32}}`, and the heap's field is declared `ref null`.
- The IR built the element at `J`'s rep, so it met `array element coercion`.
- Retagging `J` to the non-null record is not something the verifier can admit (nullable to
  non-null).
- The element is instead built at the list's element rep, with the same layout row
  (`elemTwinTy`, then `objLitAt`). Those are legacy's bytes: one `struct.new` of the shared heap.

The heap match asks legacy for a type that records no heap of its own (`recHeapOf`). A first cut
widened `objLitTwinTyAtRow` itself, which every record delivery reads. That turned 6 claimed
maker functions (`mk` returning a twin literal) into rule-2 verifier refusals, so the widening is
held to list elements (`litTwinTyOnHeap`'s `ask`).

## Measured, master 9b13d009 → head

Same probe and program lists on both sides:

| reading | master | head |
|---|---:|---:|
| programs with a const cell miss | 7 | 2 |
| tests/cases distinct functions claimed | 44,289 | 44,290 |
| witnesses distinct functions claimed | 11,460 | 11,461 |
| tests/cases start bodies claimed | 7,711 | 7,712 |
| armed shadow mismatch, fail and fallback rows | 25 | 25, the same rows |

## Left

`box ladder`, 2 programs:
- `objects/record-literal-in-binding-wider-than-field-arm.vl`
- `unions/nested-union-arm-literal.vl`

In both, a literal with no variant of its own goes into a union whose arm is itself a union.
`holeBoxPlanOf`'s `obj` rung (`unionArmVariantForObj`) finds no arm there, since it does not
flatten the nested union, so the plan falls to the ladder (rung 6). Function bodies with the same
shape miss identically.
