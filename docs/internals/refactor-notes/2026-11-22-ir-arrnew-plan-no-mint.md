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

## Measured vs merge-base 4bcb34f3 (fixpoint seeds on both sides)

- Fixpoint after one refresh; `--names` self-compile identical; mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14019, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7622, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7342, differ 0.
- `ir prepost` (mode 6, build before vs after legacy): ok, no new row.
- tests/cases armed shadow and corpus census unchanged (covered 69,322, matched 69,321; corpus
  no-blocker 45,190): the change moves no coverage.
- Self-compile L2 fuel +0.01% per PR. Deep-nesting margin fail 920 / pass 930 KB on both sides.
