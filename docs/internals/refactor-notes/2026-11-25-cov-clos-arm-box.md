# IR coverage: a declaration `if`'s arm boxed at the binding's union (2026-11-25, lane COV-CLOS)

This is item (b) of the coordinator's 06:48 order, ruled 2026-11-25 at 11:45: "approved, the
emit-side route with no checker fact, calling legacy's shared box decision (not a mirror)".

## Mechanism

Legacy writes a nullable or union binding's `if` initializer per arm (`emitLetIfInit`). Into a box
binding, rep 0, each arm goes through `emitNulArmToLocal` or, under the binding sink,
`emitUnionArmToPair`. Both call `emitUnionBoxOwed(unionName, letIfInitTy(s), arm)`. An arm the
checker records a box for (`boxOwedAt`) is delivered as recorded. Any other arm is boxed at the
binding's union (`emitUnionBoxArg`).

The IR's `letIfArmBody` and `letIfSinkBody` delivered each arm at the binding's rep and missed
where it came back at its own rep. That happens for a desugared `??`'s narrowed arm
(`const t = xs.pop(); const r = t ?? d`), which nothing records a box for.

Both bodies now call `armBoxDeliver`. It delivers the arm as before. Where the arm comes back at
its own rep and `boxOwedAt` (legacy's predicate) is false, it boxes the arm with `boxTempIn` at
`letIfInitTy(s)`, the union legacy passes (`letIfInitTy` is now exported). `unionIfArm` already
uses this delivery and box for an `if` value's arms.

The box comes after the arm's own delivery, which is unchanged. A first version passed the union
into `deliver` instead (`floorDeliver`), which changed already-claimed arms. One compiler function
(`stmtNode`) began to miss on `box of a valued if`, which `self-ir-misses` reported.

## Census

- **The class** (the 4 `pop-get-or-result-rep-*-hoisted.vl` programs): `declaration if per arm
  coercion` goes from 16 rows to 0. All 4 match their `@log` under `VL_IR_STRICT=1`. Their
  `_ret` twins miss on `tail coercion`; COV-START takes them in #10109.
- **The population** (11,395 programs under tests/cases and probes, with the first version):
  - distinct functions claimed: 93,182 → 93,198
  - start bodies: unchanged
  - functions lost: 0
  - no other class moved
  - fallbacks: unchanged (1, already there)

## Q58 sweep

`tests/cases/conditionals/declaration-if-arm-boxed-positions.vl` covers these positions, each
printing its value:
- a `??` into a nullable, and into a union (the sink);
- an else-less `if`;
- an `else if` chain;
- an arm with a prelude;
- a generic instance at two types.

On base, the two `??` positions missed (`declaration if per arm coercion`), and the others were
already claimed because the checker records their boxes. On head, every position is claimed.
