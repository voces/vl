# IR: an `__array_new__` refusal asked without minting (2026-11-22, lane IR-N3)

IR-C1's claim of `RListNew` / `RListNewDefault` (#9549's stack) raised it: the builder asked
`arrNewPlanOf(...).anWhy`, and `arrNewPlanOf` fills `anBack`/`anWrap` through `fa64Ty()`, `ia64Ty()`,
`fa32Ty()`, `fa128Ty()`, `mkArrTy()` and `lTy()`, each of which mints its pair on first ask. A claimed
function's build runs before any of it is lowered, so its pair could mint ahead of a type an earlier
statement mints at emission. Nine probes on IR-C1's seed (an i32 or string list literal before the
site, a record, a closure) built byte-identical, so the hazard is unreproduced; this is hardening.
It is the same class as `array spread pair unminted` (#9529).

## The change

- `wasmEmit.vl`: `arrNewWhyOf(callIx, fill, fnIx)` is the refusal alone, over every list kind: a
  ref list whose rows are not collected or whose strict slot is unresolved, or an i32 fill's own
  refusal (`arrNewI32FillWhy`). `arrNewPlanOf` asks it first, then fills the pair. A refused site
  fails the build, so asking the refusal before the mint moves no successful build's bytes.
- `ir_build.vl`: the two `__array_new__` builders ask `arrNewWhyOf`; the lowering asks
  `arrNewPlanOf` as before.

## Witness

`tests/ir-shadow-rows/array-new-first-scalar-list.vl`: an i32 list literal, then the program's first
f64 list from `__array_new__`, in one function.
