# IR coverage: store arm write and field store arm unbox (lane COV-UNION, 2026-11-25)

`store arm write` of the I8 census (6 rows): `q[i] = v` inside `is K[]` where `q` is a box of
list arms (D17002). `field store arm unbox` (6 rows): `h.x = u` with `u` a box narrowed to the
field's record arm.

## Mechanism

Legacy's `emitArmIndexWriteAt` writes, per list arm: the box (its name's local, or a global read
again), its tag test opening the arm's `if`, the box again with its payload cast into the arm's
wrapper local, then the store under `luOvEnter` / `luOvLocalEnter` with the receiver overridden to
that local, the store's parked value slot read and dropped; `unreachable` past the last arm.

A new statement `SArmWrite { awV, awAt, awArms, awVars }` carries one body per arm: the element
store built over the arm's payload variable, through the arm-site read's override (`ibArmRecvIx` /
`ibArmRecvVar`) and legacy's type override. The lowering writes the chain through the legacy pieces
`emitArmIndexWriteAt` now shares: `armIndexWriteTest`, `armIndexWritePayload`,
`armIndexWriteDrop`. A payload variable sits in the frame's list scratch, as an arm site's does
(`armSitePayloads`). A box no name or global holds is a named miss.

## field store arm unbox

`fieldStore` refused a value on legacy's `armDelivery` arm that owes the narrowed arm's unbox.
`deliver` already builds that unbox at a record destination (`armUnboxOwed`, `RArmUnbox`), which
writes what `emitArmDelivery` writes; the refusal is dropped.

## Measurements

- Class cut of the census (`CENSUS_CLASS`, 47 programs across this lane's assignment, store and
  union compare classes), against the tree after #10095:
  - `store arm write` 6 → 0;
  - cases functions claimed 388 → 391 of 412; witnesses 237 → 238 of 239;
  - two start bodies (D17002's, `is-list-arm-write-at-numeric-literal-set.vl`'s) move to the
    arm-site read's `arm site operand` miss for the read that follows the write.
- Q58 sweep `tests/cases/arrays/is-list-arm-write-in-each-position.vl`: 9 of 9 functions and the
  start matched; 5 of its functions missed `store arm write` before. A literal, a parameter, a
  call's value and index, a loop, a nested `if` and a global box.
- `field store arm unbox` 6 → 0: all six functions and start bodies match. Q58 sweep
  `tests/cases/records/field-store-arm-unbox-in-each-position.vl`: 8 of 8 functions and the start
  matched; 5 of its functions missed `field store arm unbox` before.
