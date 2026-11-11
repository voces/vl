# D15690: a literal holding a list built at a kept maker's record is built where the list is, 2026-11-11

Clause-1 close. Base is D15657's branch (#7148) over master `ada32709`.

## What was wrong

`const xs = [mk2()]; const r = { ys: xs }`, with `mk2` kept at `J = { f: i32 | null }`. `xs` is
built at `J[]` by the build table (`recBuildElemTyOf`, which emit's `letBindTy` reads). The store
column held a literal slot at another record only for a `??` join or a binding of a call or a
literal stamped elsewhere (`storeBindingHeldAt`). It never read the build table, and its slot
check admitted only a record type. So `{ ys: xs }` stayed at `{ys: {f: i32}[]}` while `xs` was a
`J[]`. A field read gave `field access receiver is not a struct`, and `.length` gave invalid wasm.

## The fix (checker, check_store_rep.vl)

- `storeBindingHeldAt` answers a list-literal binding with a recorded element build at
  `mkArrayTy(build)`.
- `storeSlotHeldAt` admits a list of records (`storeBuiltListTy`) beside a record.
- `storeLitHeldAt` then builds the literal at the held slot (`recordRepTyAdopt`), as D15312 does
  for a held record.

## Graded

| cell | master | here |
| --- | --- | --- |
| `{ ys: xs }` field read, after an index write, after a push | emit error | runs |
| `r.ys.length`, `{ ys: xs, n: 1 }` | invalid wasm | runs |
| `const zs = r.ys; zs[0].f` | emit error | runs |
| `[xs]` then `ws[0][0].f` | emit error | runs |
| `{ y: xs[0] }`, `{ ys: [mk2()] }` index read | runs | runs |
| `for y in r.ys` (also with an inline `[mk2()]`) | emit error | emit error, D15694 |
| `use(r)` at `{ys: {f: i32}[]}` | invalid wasm | invalid wasm, D15695 |
| `r.ys.push(mk2())` | check reject | check reject, D15696 |
