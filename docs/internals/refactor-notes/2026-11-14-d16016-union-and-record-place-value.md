# D16016: a write into a union or `R | null` place used as a value, 2026-11-14

D16015 and D16017 made a write used as a value yield its store's parked cell, but only when the
assignment's type is the place's. Two places store a value at a type apart from it.

- **A boxed union.** `us[i] = 5` over `(i32 | string)[]` stores a union box; the assignment
  yields the `i32`. `asgYieldsBoxedArm` takes a list element or map entry of a boxed union with a
  right-hand side that is one of its members. The store parks the box, and the rung opens it to
  that member (`emitUnionUnboxTail(boxTagOfTy(...))`). D2632's closure-shared union cell is such an
  element after the capture rewrite, so it runs too.
- **A record into `R | null`.** `root.left = { v: 3, left: null }` stores the record at `Node`'s
  row in a nullable cell; the assignment yields the record. `asgNonNullCell` takes a record whose
  own row is absent or `R`'s. A field of a name is re-read, a list element's stored cell is
  parked, and either is taken past its `null`. The place's type can read back narrowed to `R` (an
  un-annotated module `const`), so `R` is accepted as well as `R | null`.

A record whose own row is not the place's stays refused: delivering it would need the value
before the store narrows it. That is D16019.

## Graded

| matrix | base | candidate |
| --- | --- | --- |
| `union-target-write-value` (`(uw[uwi] = 5)`, a string member, a union map entry, a row-less record field) | 0 of 52 run | 52 of 52 run, 0 silent |
| `element-write-value`, `field-write-value`, `map-write-value` | 50 of 50 each | 50 of 50 each |

## Measured

| instrument | result |
| --- | --- |
| full sweep, base master against this change, both fixpoint seeds | 3 output movers, all `emit_reject` → `runs` (D16016's and D2632's witnesses and the new test); 0 bytes-only movers; 0 runs → not-runs; 0 new traps |
| fast set | all green (fixpoint, lint-self clean, regress, filed witnesses, late demands, seed size, comment, ladder, sentinel, scan, render-parse and export ratchets); native deep-chain, scaling and emitter-state audit (`SELFHOST_NATIVE_ALIGN=1`) 105 passed |
