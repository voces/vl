# D15922: a struct field's ref-list row is minted when its element holds a function, 2026-11-12

This closes D15922, a clause-2 loud emit reject (`ref-list field element type is not interned`).
It was the orchestrator's next item after cut 5's first rung.

## Mechanism

The type section reads a struct's fields before any function body. So a record returned from a
maker that binds its list first is the first to ask for the list's ref-list row, through
`sFieldRefSlot` (`emit_shape_rows.vl`). Two of that function's branches missed the row:

- **An element holding a type parameter** (an unannotated function). It was minted under the
  field's stored element name and looked up by that name. An anonymous record's name has no rep
  key, so the lookup missed. A probe in `tsStruct` showed the row just minted at the element's
  type, with the same rep key as the field's, yet the slot came back -1. A second call found it.
- **A closed element holding a function** (an annotated one). `rlRowMint` declines it, since the
  function-value sets decide such a row for a literal. The struct field has no literal in hand.

## What changed

`sFieldRefSlot` looks the minted row up by the element type when the name misses. For a closed
element `rlRowMint` declines, it falls back to `rlArmRowMint`, which mints it under its declared
type, as a union arm's ref list does. This is not the `emit_shape_rows` ref-list cluster w311
holds (`refArrElem*`, `nameIsNulRefList`, `shapeRowScanK`).

## Witnesses

`tests/cases/closures/maker-returns-record-holding-bound-list-of-fn-records.vl` covers:

- the witness;
- the annotated, bound and two-function spellings of one result;
- two lists in one record;
- a pushed lambda capturing a parameter;
- a declared element type nested a record deeper;
- a pushed second function.

Each failed on master with the row's message. The two-function spelling of different results is
a separate defect, filed as D15883: the checker refuses it when `xs` is returned bare and misses
it through the record.

## Measurement

This can move output, so the sweep is CI's under the `sweep` label, per the 2026-11-12 process.
