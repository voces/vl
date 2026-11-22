# IR coverage: a record compare side legacy re-reads as a list element (2026-11-22, lane IR-N8)

The follow-up of `structEq` (#9503) and `variantEq` (#9510): a side legacy does not stash, and so
re-reads at every field read, that is no variable. On #9510's head a census put 11 `tests/cases`
functions at `record compare place operand`, 8 of them std's `self[i] == needle`.

## Design

- **The root plan (`wasmEmit.vl`).** The struct compare's walk (`emitStructEqRec` and the field
  writers under it, through `structEqTail`) takes an explicit `rp: EqRootPlan`, one
  `EqRootPlace` per side: `expr` (the operand node, legacy's `EQ_ROOTS_EXPR`), `local`, or `elem`
  (a ref list element read over a receiver local at an index local or immediate). Coordinator
  ruling, 2026-11-22: the root writer is an explicit parameter, not a function-hook global.
- **One ref list read writer.** `refListReadAt` is split out of `emitIndexRefList`; `emitIndex`
  dispatches on `refListReadPlain` (a ref list read with no arm override, arm site or null cell
  ahead of it), the answer the IR's admission reads too.
- **Element-read rows.** With names or the shadow on, each `elem` read appends its row to the
  place's `epRows`, which the lowering banks as legacy's `emitIndexBanked` does.
- **IR.** `RStructEq` gains `seLIx`/`seRIx`; an element side is its receiver and index, built
  without a statement or temp, read at every field by the plan.

## Measured

Against master cc27c3ea's fixpoint seed:
- `tests/cases` covered = verified 68,513 → 68,522 (+9), matched 68,512 → 68,521; corpus unchanged
  at 45,099;
- `ir-identity --cases`, `--claimless` and `--names` differ 0; the legacy A/B over `tests/cases`
  differs 0 (`emitIndex`'s ladder moved, its bytes did not);
- L2 fuel per PR +0.07%, the same-tree pair +0.001%; the deep-nesting margin edge is the base's.

The row `tests/ir-shadow-rows/record-eq-element-place.vl` has 4 functions, all `record compare
place operand` on master's seed, all covered and matched here.

## The function-value version (unexplained, not reproduced standalone)

The ruling's first spelling, a function-typed `rw: (rootIx, fnIx) => i32` with legacy passing
`emitExpr`'s wrapper (commit fb843f6d against master d51926731), measured L2 +3.57%: emit passes
10.77G → 13.85G and code payload 27.90G → 29.27G, with the same-tree pair flat (the head seed
compiles the base tree at the base's fuel). The data version measures +0.01%.

Three minimal shapes did not reproduce it; each is linear (compile fuel, master 5f8d0483's seed):
- a function-typed parameter threaded through N mutually calling functions: about 330K fuel per
  function over an `i32` parameter (N = 10 … 80);
- one function value in a program with an M-function recursive cycle: about 90K fuel per program
  function, whether or not the value reaches the cycle (M = 50 … 400);
- 1, 2 or 4 distinct function types: about 2.1M per extra type at both M = 100 and 200.

No inventory row was filed, since no standalone witness reproduces the in-tree reading.
