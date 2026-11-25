# IR coverage: `coalesce optional place` (lane COV-UNION, 2026-11-25)

`v.j?.a ?? d` where `v` is a union of records and `j` a field one member stores as a record and
another as `null` (D15717): legacy's `emitCoalesceOptNulRecord` reads the receiver `v.j` again
after its null test (`emitOptRecvBase`), re-emitting the shared-field dispatch
(`emitMemSharedRead`) each time. The IR built the dispatch as a temp it could not read again, so the
`??` refused its receiver (`coalesce optional place`).

## Mechanism

`RSharedRead` over a box variable, or over a module global (`srGlobal`), is noted as a read the
lowering writes again whole (`irReadAgain`, through the new `irBNoteReadAgain`), as a global's or
an unboxed local's read already is. A stashed receiver (`srStash`) is not: its stash read is a temp
the dispatch reads once.

## Measurements

- Class cut (`scripts/ir-i8-census/classes/coalesce-optional-place.txt`, 2 programs), master tree
  before and this tree after: `coalesce optional place` 3 → 0 (`rd` and the start body of
  `shared-field-record-or-null-runs.vl`, D15717's start); claimed functions and start bodies 1 → 4.
- Q58 sweep `tests/cases/unions/shared-field-opt-coalesce-in-each-position.vl` (a global, a local
  and a parameter receiver; a return, an argument, a binding, an `if`, a loop, arithmetic): 6
  functions and the start missed before; after, the start and four functions are claimed, `glob`
  and `loop` move to `short-circuit right operand` (the `??` right of an operator); output equal
  to master's.
