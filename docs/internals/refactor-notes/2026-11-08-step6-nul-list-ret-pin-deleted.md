# Step 6's last write-back: `synthNulListRetAnns` is deleted

Measured 2026-11-08 on a 4-core box. Every seed is a fixpoint. The sweep population is 23,679
programs. No `synth*Ann*` function remains.

## The two pins, re-ablated

Each ablation made one branch's `fn.fnRet` write a no-op, on master with #6824 and #6828 merged.

| pin | movers (#6758) | movers now |
| --- | --- | --- |
| nullable list / nullable struct (`inferRetNulPinned`) | 2 | 3 runs → not-runs, 9 bytes-only |
| list-union and function-arm union (`synthUnionRet`) | 10 | 9 runs → not-runs (4 compiler traps), 13 bytes-only |

## The readers, switched

The nullable pin's movers were three readers that read `fn.fnRet` and had no arm for the
stored kind:

* `emitNullForRet` and `fnRetNullBearing`: an un-annotated function's `nullist`, `nulstruct`,
  `nulreflist` or nullable scalar list now takes its `ref.null` heap from `fRetKind` and its
  slot, as `nulmap` already did. Witness: an else-less tail `if` yielding `[5]` trapped at
  `unreachable`.
* The un-annotated functype arm had no `nulreflist` slot, and `criColsFromRecorded` stored a
  nullable ref list's row nowhere. The row now rides `fRetStructIdx`, as an annotated one's
  does, and `criRecordedRefListDemand` interns the row of a nullable list too. Witness:
  `function first(x: i32[][]) { return [x, null][0] }` refused with `ref valtype with no
  interned shape`.

The union pin's columns were already right (`fnRetColsFromRecorded` reads `union`). Its
movers were two readers:

* `fnReturnsClosure` scanned the body's tail and answered `closure` for
  `if b { return (x: i32) => x + 1 }; return (x: string) => x.length`, so the functype said
  closure while each `return` built a union box. An un-annotated return whose type is a
  function-arm union is now not a closure, as its annotated spelling already was not.
* `fnUnionRetSinkOk` now reserves the sink frame for a recorded `union` result that joins
  lists of different storage or has a function arm.

The pin also registered the union a record-list arm or function arm needs after `collectU`.
That half stands, as `registerRetJoinUnions`, and writes no annotation: without it 3 list-union
cases refuse with `ref valtype with no interned shape`.

`inferRetNulPinned` and `inferRetIsNulList` had no other caller and are deleted.

## `inferRetRung`

The checker pushed a rung per inferred-return row, and only the rollback read it. The column,
`irReset` and `irRungTruncate` are deleted. `inferRetNameRung` stays: `recordInferRet` reads
the rung it is passed to register nominal twins.

## Proof

On the merged tree (master `2ec34b26`), each seed a fixpoint:

| check | master | this PR |
| --- | --- | --- |
| seed bytes | 6,531,436 | 6,531,328 (−108) |
| L2 guest fuel, compiling this PR's source | 77,162,614,142 | 77,160,912,992 |
| sweep | — | 0 output movers, 0 runs → not-runs, 2 bytes-only |
| `gate.sh` | — | 23 of 23 green |

The 2 bytes-only movers print what they printed before, and each module was diffed:

* `capture-nullable-scalar-list-tail-write`: master emitted one function as an `unreachable`
  stub plus an env thunk that `return_call`ed a copy. This PR emits the body once and calls it.
* `fn-value-nullable-fn-param`: `lf(inc)`, where `const lf = (p: F | null) => p`, called a
  direct copy of the lambda. It now calls through the closure value.

## Left

* `buildFnMap` classifies annotations only: `buildFnMapRowOfRetAnn`, the resume bank
  (`fmSeed*`) and the name and sid maps.
* `registerRetJoinUnions` registers unions late because `collectU` does not see an inferred
  return's type. Registering them in `collectU` would remove the pass.
* The cloRet* remnants (`mfStructResultRowName`, `cloRetKeySuffix`) were not started.
