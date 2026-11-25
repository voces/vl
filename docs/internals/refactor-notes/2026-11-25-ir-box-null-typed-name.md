# IR box of a null-typed value: a name read's bottom payload (2026-11-25, lane COV-IS)

`box of a null-typed value` is the miss for a value of the `null` type delivered into a union box
that is not a call. On master `bc95de5c4` it is the first miss of 17 functions across
`tests/cases` and the inventory witnesses. A probe that names the value's node kind splits them:
9 name reads, 5 value `if`s, 2 member reads and 1 `??`.

## What landed

- **Legacy's rung**: `emitNulNoneBoxPayload` writes a name read's payload, or a bare `null`'s, as
  the bottom ref alone. `nulNoneWritesNothing` says which values those are.
- **Builder** (`boxTempIn`): a `null`-typed name read builds `RNulNoneBox` without a payload
  (`nnPay` false). The lowering already wrote that form: the null tag, `ref.null none`, the box.
- **The read**: the read built for the name is left unread. When it is a temp defined last by a
  leaf that reads no operand (`nulReadDropped`), its `SLet` is dropped.
- The value `if`, member and `??` arms stay the named miss.

## How it was measured

- **Probe**: the class drops from 17 functions to 8. The 9 name reads all claim and match under
  `VL_IR_SHADOW=2`, and 2 of their programs reach `null unit read rep` next.
- **Legacy**: only the builder changed.
- **Q58 position sweep** (`tests/cases/unions/null-typed-name-boxed-into-union-positions.vl`,
  new): a `null`-typed name delivered as an argument, a return, a `let`, a record field, a list
  element, an assignment's value and an `if` arm. On master 7 of its 8 functions are this miss;
  here all 8 match and it prints its 8 lines.
- **D17201 closed**: a `null`-typed name in a value `if` arm boxed into `A | B | null`. The claimless
  build refuses it at emit ("ref valtype with no interned shape"); the claimed build now runs and
  prints its `Want:`. The parity gate's refusals population showed it as `build-fails(off)` until
  the row was closed, and it then leaves that population (112 → 111 programs).
