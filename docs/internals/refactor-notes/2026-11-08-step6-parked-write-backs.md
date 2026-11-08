# Step 6's parked write-backs, re-measured: one deleted, one narrowed

Measured on 2026-11-08 at `2684af7c` over the sweep population (23,615 programs). Each ablation
made the write-back a no-op, built a fixpoint seed, and diffed a full sweep against the
candidate tree it was ablated from.

| write-back | census movers (11-07) | movers on `2684af7c` | after this change |
|---|---|---|---|
| `synthNullHoleAnn` | 1 | 2 (both runs → not-runs) | deleted, 0 movers |
| `synthNulListRetAnns` | 9 | 12 (all runs → not-runs) | two of four branches deleted, 0 movers |
| `synthParamAnnots` | 135 | 124 output (123 runs → not-runs), 30 bytes-only | parked |
| `synthRetAnnots` | 66 | 51 output (all runs → not-runs), 11 bytes-only | parked |

## `synthNullHoleAnn`

The two movers were `tests/cases/inference/null-hole-filled-by-write.vl` and D2421's witness.
Three readers took the hole's type from the annotation the write-back minted:

- the collect pass registered the union off `letType`. It now registers the checker's filled
  type (`letNullHoleFilledTy`) directly;
- `nliInferLet` scanned the filling write's syntax and named a value-union box `boolean|null` or
  `string|null`, types whose rep is a niche. It now runs only on a hole the checker did not fill;
- `captureBoxRewrite` typed a captured hole's cell from the bare `null`'s type. It now takes the
  filled type (D2421).

## `synthNulListRetAnns`

A per-branch ablation over the 12 movers:

| branch | movers |
|---|---|
| nullable list / nullable struct pin (`inferRetNulPinned`) | 2 |
| list-union and function-arm union pin (`synthUnionRet`) | 10 |
| joined-record pin (D2731, D3401) | 0 |
| union-arm nominal pin (D4555) | 0 |

The two branches with no movers are deleted, along with `fnRetBuiltRecord` and
`tyIsJoinedRecord`, which only they called. The two that stand feed the inferred-return result
kind (`fRetKind`), which `buildFnMap` and `computeRetInference` own. Both go in step 7, so
an arm added there now would be deleted with them.

## The two large ones

Movers by directory: `synthParamAnnots` 33 closures, 18 inventory, 18 generics, 17 arrays;
`synthRetAnnots` 40 closures. By message (a message count, not a mechanism count):
`synthParamAnnots` 45 `field access receiver is not a struct` or `no struct type declared`, and
68 invalid wasm, 47 of them inside a lambda. `synthRetAnnots` is invalid wasm in 49 of its 51.
Both match the census's readers: a parameter's slot read off `parType`, and a lambda's functype
and `$fnsig` key read off `fnRet`.

`synthAnnOfTy` stays: `synthRecordedRetAnnots` still calls it.

## Cost

| measure | `2684af7c` | this change |
|---|---|---|
| seed bytes (fixpoint) | 6,497,120 | 6,495,908 (−1,212) |
