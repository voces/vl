# START-2: `identity compare narrowed box operand` (2026-11-26)

Regen-10 lists 2 units:
- `operators/identity-eq-narrowed-union-operand.vl` (`f`)
- `operators/identity-sweep-narrowed-union.vl` (`go`)

In both, an operand of `===` is a union binding narrowed by an assignment or an `is` test, which
legacy reads from its box and compares by the payload (`identityOperandUnboxes`). `identityEq`
built the operand at its narrowed member and missed. It now builds such an operand as a storage
read (`storageReadEnter`), which yields the box, as legacy pushes it.

`ir-parity`: byte-identical on both programs. Each is already a position matrix: a narrowing by
assignment and by `is`, against a record, the box's own binding, and a distinct equal record.
