# Step 2: the call key binds instances whose parameters hold functions (2026-11-08)

Follows [the call key shadowed against every instance](2026-11-08-call-key-every-instance-shadow.md)
(#6767). That note left 4,668 builds declined as `unkeyed-fn`: `elabCallKeyBinding` refused any
parameter whose type may hold a function, on the reading that the key names the parameter's TYPE but
not the function value's REP. Dropping the refusal there cost 24 `runs → not-runs`.

## What the declined builds were missing

Measured, not the rep. On #6767's tree, dropping the `tyMayHoldFn` arm alone loses 9 programs
(D3165, D9562, D9564, D9700, `generics/hole-bound-field-function-*`, `literal-unions/coalesce-hole-call-litunion-join`).
Their `ckey` rows read `agree`: the key's binding spells the same instance as mono's. Printing both
bindings type by type showed the one difference. Mono's rebuild (`monoBindCols`) binds a hole twice,
as a hole and as a type parameter, and the key bound it only as a hole. A call through the function
(`const g = z.f; print(g())`) reads the function type from the type-parameter side.

So `elabCallKeyBinding` now also binds a hole as a type parameter **where its type may hold a
function**. Binding every hole that way was tried too. It loses 15 programs, the `d3127_*` map cells,
whose `??` over a map read then lowers at the wrong rep. The rule is per hole, by its bound type.

## The `ckey` classes, before and after

Population: the 23,628 programs of `scripts/sweep.vl -- list`, built with `vl build` under
`$VL_ID_SHADOW=1`, base master `7963801c` and the candidate, each at its fixpoint. Counts are instance
builds. They are ±a few, because four parallel builds share one stderr file and an occasional row
interleaves. The files whose count looked different were rebuilt one at a time: 383 builds on both sides.

| class | before | after |
|---|---|---|
| keyed (`call` + `value`) | 19,643 | **22,113** |
| declined, `fn` | 4,668 | **0** |
| declined, `open` (was hidden behind `fn`) | 0 | 2,197 |
| declined, `hole` | 5 | 5 |
| no key (`spelled`, `lam`) | 685 | 685 |
| `monoHoleBinding` binds at least one name | 2,917 | **2,316** |
| `monoBindSeededTyParams` (agree / differ) | 25 / 3 | 25 / 3 |

The 2,197 `open` builds have a parameter whose type at the key still carries a type variable. That
is the next class. The `fn` reason was checked first, so these were never counted apart.

## Proof

- Fixpoint seed: 6,509,054 bytes, against master's 6,508,784 (+270).
- `scripts/sweep.vl` diff, base vs candidate: 23,625 same, 3 bytes-only, 0 output movers,
  0 `runs → not-runs`, 0 new traps. The 3 are D15539 and `generics/nullable-fn-list-through-generic-param{,-annotated}`.
  There mono bound `T` to `(i32) => i32?` for `first([inc, null])`. The key binds `(i32) => i32`, and a
  `ref.as_non_null` on the returned element goes away.
- Pin-helper budget unchanged at 927.
