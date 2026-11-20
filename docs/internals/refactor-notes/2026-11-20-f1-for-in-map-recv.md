# IR: a map walk over a receiver that is no global (2026-11-20)

For-in family step 2. The IR claimed a map walk (`for k in m`, `m.keys()`, `m.values()`) only
when its receiver was a module global, read by index in `SForIn.xfMap`. Legacy's stash
(`emitForInMapStash`) is `pushMapRecvRef` (the receiver's own `emitExpr`, then
`mapRecvRefTail`) and `forInMapStash`, so another receiver differs only in how its value is
written.

## Mechanism

- One encoding: `xfMap >= 0` is a global; otherwise a map walk's `xfList` is its receiver, at a map
  rep, which is what tells a map walk from a list or string one (the verifier reads it so).
- One decision: `mapRecvGlobalIx` (`ir_lower.vl`) names the global a bare receiver is. The builder
  sends a global down the global read (missing `for in map receiver` if its rep is no map) and
  builds any other receiver raw with `irBExpr`; the lowering re-asks it and misses on
  disagreement either way.
- The receiver is a map, or a nullable map `exprNullableMap` owns (`mapRecvRefTail` recovers it);
  any other rep misses as `for in map receiver rep`.
- The lowering writes the receiver at legacy's point, then the shared `mapRecvRefTail`,
  `forInMapStash` and `forInMapList`, so the stash slot and the op's map ref are legacy's own.

## Witnesses

`tests/cases/maps/for-in-map-receiver-kinds.vl` and `vl_ir_shadow_test`: a local, a parameter, a
field read, a call receiver whose counter shows it runs once, two nested walks over two maps, a
body that writes another map, and a nullable parameter narrowed by `!= null`; all eight functions
covered and matched (seven were `for in map receiver` misses before), output 7 5 1 103 15 4 5 0.

## Readings

READINGS
