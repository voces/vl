# I8 re-entry: a `for` iterable's hoisted module list, 2026-11-25

Lane COV-CALL, the first of its three I8 re-entry ports (coordinator, 2026-11-25). Base: master
41b0be1e.

## The re-entry

The IR's list lowering (`makeList`) asked legacy's `arrLitHoistGlobal` whether a `for` walk's literal
of constants hoists into a module list. Legacy's `forLitHoistPlan` decided by writing each element
into a scratch buffer: `emitStrValue` for a string list (so `emitExpr`), `arrLitDataElemEmit` for a
number list (`emitExpr`, `emitWidened`). That is legacy's expression emitter on the claim path. Under
the I8 stub it refused `litI64HeldTargetOf` (`for f in ["f64", "f32"]`), which stopped the
self-compile.

## The port

- `forLitHoistPlan` is split into its decision (`forLitHoistable`), the element append
  (`forLitHoistAdd`) and the close (`forLitHoistClose`), at the arm's types (`forLitHoistTysOf`).
  Legacy's own path is unchanged.
- The IR's `irForLitHoist` writes each element itself (`forLitElemAt`):
  - an immediate, as its operand;
  - a variable's read (a `local.get`, or a range copy's constant, which is then a miss as before);
  - a global's read of a module `const` string literal, written as that literal where it is pooled
    (`forLitConstStrOf`, `forLitStrPooled`), the pure read skipped. One that is not pooled is no
    single constant, so the list does not hoist.
- Only another element (a computed temp) still asks legacy's hoist. Its hoist is a miss, as before.

## Measurement

`scripts/ir-i8-sweep.sh scripts/ir-i8-census/keep.txt` over cases, witnesses and probes:

| | before (master) | after |
|---|---:|---:|
| newly failing: cases / witnesses / probes | 1196 / 533 / 37 | 1090 / 495 / 34 |
| IR needs `emitExpr` (programs) | 452 | 310 |
| IR needs `emitWidened` | 8 | 0 |

The self-compile under the stub no longer stops on `litI64HeldTargetOf` or on `monoCoerceIfArms`
(`for a in [tv, ev]`, two locals). It now stops on `decodeArities` (`for s in [AR_00, ...]`, module
`const` strings). There the swept compiler, and only it, falls back with `non-stack temp: out of
order`; the shipped compiler claims the same function in the swept tree. Not yet explained.

A program the IR used to refuse is now claimed. On master, a `for` over module `const` strings fell
back (`claim fell back: for iterable element`).

## Proof

- Sweep program: `tests/cases/loops/for-literal-of-constants-hoisted.vl`. On master `lens`,
  `nested`, `words` and the start body fall back. After the port every function is claimed,
  armed-matched and claimless-identical.
- `scripts/ready-check.sh` (gate.sh --fast passed); `ir-identity.sh` runs in CI.
