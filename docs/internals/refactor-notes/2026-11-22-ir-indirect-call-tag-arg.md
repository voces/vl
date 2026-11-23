# IR: a tagged set's id handed to the closure adapter as a plain argument (2026-11-22, lane IR-N5)

`indirect call` is `callRhs`'s miss when `callRefPlainKey` refuses a call through a function
value. A probe of the check that refused it, per function over the 44 files that hold the class,
gave:

| failing check | functions |
| --- | --- |
| arg 0, general arm, `i32` parameter, key `i>c` | 59 (48 solo, 11 joint with `expression if ref closure`) |
| arg 0, general arm, `nulstr` parameter | 1 |
| head: callee not `exprIsClosure` | 1 |

The 59 functions are a single call shape. A tagged set's value delivered to a closed function type
is rewritten by the checker's function-value adapter (`check_assignable.vl`, fva) into
`((fv: Set) => (..) => fv(..))(k)`. The call's argument is the set read, whose checked type is a
function type, so `exprScalarWidth` is `""` and the scalar tail's `k == "i32" && w == k` refuses
it. Legacy's general arm writes `emitExpr(k)`, which is the set's i32 id (disassembly: a
`call_indirect` to the adapter, `(param i32) (result (ref $closure))`, whose argument is the cell's
`array.get`).

## The change

- `callRefArgPlain`'s scalar tail also accepts an `i32` parameter whose argument's type is a
  tagged set (`fnTagSetIsTagged(fnTagSetOfTy(nodeTyAt(a, fnIx)))`). No new IR route:
  `closureCallRhs` builds the general arm it already builds. Legacy reads the answer only under
  `irShadowOn` (`callRefLastPlain`).
- The `nulstr` and head rows, and the 11 joint ones, stay named misses.
- New test case `closures/tagged-set-delivered-to-closed-parameter-called-through.vl`.

The measurements are in the PR body.
