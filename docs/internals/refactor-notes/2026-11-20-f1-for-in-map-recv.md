# IR: a map walk over a receiver that is no global (2026-11-20)

For-in family step 2. The IR claimed a map walk (`for k in m`, `m.keys()`, `m.values()`) only
when its receiver was a module global, read by index in `SForIn.xfMap`. Legacy's stash
(`emitForInMapStash`) is `pushMapRecvRef` (the receiver's own `emitExpr`, then
`mapRecvRefTail`) and `forInMapStash`, so another receiver differs only in how its value is
written.

## Mechanism

- One encoding: `xfMap >= 0` is a global; otherwise a map walk's `xfList` is its receiver, at a map
  rep, which is what tells a map walk from a list or string one (the verifier reads it so).
- One decision: legacy has no global-or-expression split here (`pushMapRecvRef` is the
  receiver's `emitExpr`, which for a global name is legacy's own global read); the split is the
  IR's own choice between `globalRead` and an operand. `mapRecvGlobalIx` (`ir_lower.vl`) is
  `mapGlobalOf`'s existing name test moved verbatim, and the builder and the lowering both ask it:
  the builder sends a global down the global read (missing `for in map receiver` if its rep is no
  map) and builds any other receiver raw with `irBExpr`; the lowering misses on disagreement.
- A map walks its keys or values into an `i32` or a string, the verifier's rule for every map
  walk; any other element is a named miss, `for in map element`.
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

This step's own delta, against a fixpoint at the merge-base ebf4b1c17 (which holds #9280, the
step it was stacked on; candidate a fixpoint at 05980b2cc):

- Self-compile functions covered 18,785 → 18,803 (+18); `for in map receiver` 0.
- Corpus functions with no blocker 41,682 → 41,684 (+2); `for in map receiver` 4 → 0, two of them
  now the named `for in map element`. Shadow 41,684 covered, verified and matched.
- `--cases` 7,531 identical, 0 differ; witnesses 59 same.

The full grade ran against c2f0a972f, before #9280 merged, so its coverage figures (self +43,
corpus +50) held both steps; its identity readings stand: corpus `ir-identity --names` 9,037
identical, 0 differ, self-compile identical; mode-3 self-compile identical; the `tests/cases` A/B
7,250 same, 0 differ; L2 self-compile fuel 103,511,758,090 → 103,522,294,912 (+0.010%); late
demands 9 of 9, late tag rows 307 of 307.

## Next rows of the family

`for in map element`: 2 corpus functions (`d16565_values_pinned_before`/`_after`, a walk over a
map's `i32[]` values), none in the self-compile.
