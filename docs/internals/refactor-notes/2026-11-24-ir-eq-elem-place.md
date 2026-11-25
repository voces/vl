# IR: a record compare's element side over a place receiver (2026-11-24, lane IR-N1)

`record compare element place`: `xs[i] == p` with `xs` a global, a narrowed nullable variable,
or field reads over a variable. The IR's `elem` root read the receiver from a local only, so the
builder refused any other receiver.

## What landed

- **Builder** (`structEqSide`): an element side's receiver may be a place that
  `structEqPlaceRead` already accepts for a whole side (a global read, a narrowed nullable
  variable's recover, or field reads over a variable). The index must still be a variable or an
  immediate that builds no node.
- **Lowering** (`structEq`): such a receiver's temp is skipped, as a place side's is. The side's
  `elem` root gets `epSlot` -1 (`structEqElemPlace`).
- **wasmEmit** (`refListReadAt`): an `elem` root with `epSlot` -1 writes its receiver as its
  expression, which is legacy's own root, then the index local or immediate. It still banks the
  element-read rows into `epRows`. Only `structEqElemPlace` (ir_lower) builds an `elem` place, so
  no legacy caller reaches `epSlot` -1.
- Why not the `expr` root: it writes the same bytes, but its element-read rows are not banked,
  and the spans count fell short (IR 14 vs legacy 10 rows on `arm-struct-equality.vl`'s start).
  The banked `elem` root is span-identical.

## Why the re-read is safe

The receiver is read again at each field, never stashed:
- A right side with effects stages the left side (`structEqStagesLeft`), so the left is no place.
- A left side with effects runs before any read of the right.
- An index that builds a call (`xs[next()] == p`) builds nodes, so that side is staged, evaluated
  once. The row prints `k` to show it.

## Legacy tails the IR calls

- `refListReadAt` (`wasmEmit`), through `emitChainRootElem`, now with a receiver written as its
  expression where `epSlot` is -1.

## Still named

- `pairs[0][0] == p`: the receiver is itself an element read, not a place. It stays
  `record compare element place`.

## Witnesses

- `tests/ir-shadow-rows/record-compare-element-place.vl`: a global receiver at an immediate and at
  a variable index, two element sides, a nested record, `!=`, a field-read receiver, a narrowed
  nullable global, the staged call index and the named element receiver. Base: 2 of 9 functions
  covered, start missing. Head: 8 of 9 matched, start matched, 1 named miss. It expects
  `no row containing spans`.
- `tests/vl_ir_shadow_test.ts` grades that row with control 5 (the banked element-read rows
  dropped) and wants it to red on `spans`.
- Q58 sweep `tests/cases/structs/record-compare-element-place-in-each-position.vl`, delivering
  the compare's boolean to:
  - a boolean and a union parameter, and a nested call;
  - a concatenation, an interpolation hole, a return and a binding;
  - an `if` arm, a `??` operand and a record field.

  Base 64/74 with 10 misses; head 74/74. Claims-on is byte-identical to claims-off, and the base
  seed, the head seed and claimless all print the same.
- `tests/cases/structs/record-compare-element-place-values.vl`: equal, and unequal at each field
  including a nested record's. Base 0/2; head 2/2. All three compilers print the same.
