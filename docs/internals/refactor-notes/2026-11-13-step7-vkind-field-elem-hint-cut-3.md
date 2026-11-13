# Step 7, lane H: field element hints, cut 3, and the fallback's contract, 2026-11-13

After cut 2 (#7706), `recordFieldElemRow`'s name fallback (`fieldElemTyIxOfName`) reached 32
programs. The coordinator asked for them to be closed out class by class.

## Probe, on master `6d8f552d`

A scratch compiler ran over 24,070 programs, with a control tag on each. It tagged the
recorder site and the field's own row at each reach where the name resolved:

| site | the element name | the field's row | programs (summed per tag) |
| --- | --- | --- | --- |
| the shape interner's other-code recorder | a literal union (`"a" \| "b"`, `K0`, `K`, `KC`) | that union `\| null`; its non-null part is the name's type | 15 |
| a declared or variant field (`pushFieldRow`) | a list of literal unions (`K[]`, `K0[]`, `K1[]`) | — (the hint is `-1` by design) | 20 |
| an anonymous literal's row | `A`, `{[string]:i32}` | the open hole | 3 |

The numeric literal set the cut-2 note listed no longer reaches the fallback: cut 2's
anonymous-row hint answers it.

## The change

- The shape interner's other-code recorder hands a `| null` literal union's non-null part,
  where the row projection has none. This is the same rule cut 2 gave `fieldElemHintOfRow`.
- **D16061** is filed: an anonymous literal handed to an un-annotated parameter keeps its
  field typed at the hole. Status: runs today and must keep running. The fallback's comment
  cites it.

## The fallback's contract

The name fallback in `recordFieldElemRow` stands for exactly two populations:

- **A list of literal unions.** `fieldElemHintOfRow` hands it `-1` by design. Its element is a
  literal union whose atom set is registered from the name, so the name keys its row, and the
  recorded type is that name's resolution.
- **D16061's hole-typed anonymous field.** No type exists to hand until the instance types the
  field. The fallback goes when D16061 closes.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `6d8f552d` against this, fixpoint seeds on both sides):
  24,205 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **The fallback's reach** (a tagged build of this tree): 32 → 18 programs. That is 15
  literal-union lists (`K[]` 11, `K0[]` 4) and D16061's 3 (`A` 2, `{[string]:i32}` 1). Each
  program counts at its first reach.
