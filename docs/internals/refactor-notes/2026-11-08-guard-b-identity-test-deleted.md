# Guard (b)'s identity-only test is deleted (2026-11-08)

Lane "per-(instance, node) recording keys", PR 2. It follows
[2026-11-08-per-frame-node-records](2026-11-08-per-frame-node-records.md).

## What changed

`monoRetFnListTy` read a held type that was the list's identity type (`elabIdentityTy`) as no
type, and left the list to the slot pins. That was guard (b)'s identity-only test of #6711. It
existed for class (c) of
[2026-11-07-rep-facts-behind-mono-guards](2026-11-07-rep-facts-behind-mono-guards.md): a lambda in
`k<T>` returning `[t]` beside `[1]`. Taking the held type there recorded `[t]` on a node both
instances' lambdas share, and `k("s"); k(2.5)` built invalid wasm in the second lambda. PR 1
records per frame, so the test is deleted and the held type is always taken.

The generic-instance half of guard (b) (`monoFrameIsGenericInstance(ctx) && holdsLit`) stays.
It is PR 3.

## Measured

Base: PR 1 merged with master `e99540ac`, a fixpoint at 6,500,079 bytes. Candidate: a fixpoint
at 6,500,061 bytes (−18). `scripts/sweep.vl -- diff`: 23,614 same, 1 bytes-only mover, 0 output
movers, 0 `runs → not-runs`, 0 new traps.

- `lambda-list-join-type-param-pin.vl` (class (c)) prints its filed output on the base and on the
  candidate. With the test deleted and no PR 1, it is invalid wasm in `__lambda_3`.
- The mover is D2926's witness (`F(x)` with `const c = () => [x]`, `x: string | null`). The
  candidate no longer interns one list row that no function uses. Every function is the same,
  and both seeds print `1`.
