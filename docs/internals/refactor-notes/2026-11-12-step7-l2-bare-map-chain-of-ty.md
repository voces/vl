# Step 7 L2 §7: the bare-map chain's nullable-map and member rungs read the type, 2026-11-12

Lane w310, item (d), fifth part. After #7339, `nameIsBareMap` kept five spelling-only callers.
This PR takes four of them and a `nulMapInnerName` gate. The fifth, `refElemArrName`, is lane
w311's and goes with its `ensureRefElemTys` floor. A new predicate, `tyIsNulMap`
(`emit_union_registry.vl`), is a `| null`-peeled `tyIsBareMap`, so a nullable union of twin maps
(D15540) counts.

The base is #7354's head `981599d0`, with a fixpoint seed on both sides. The population is the
whole sweep, 23,954 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the predicates
note's accumulator. Each site had its own reach tag.

| site | reach | true | untyped and true | disagree |
| --- | --- | --- | --- | --- |
| `nulRefMapValInnerOfTy`, the inner member | 107 | 7 | 0 | 0 |
| `fieldCodeOfSpelling`, untyped bare-map leg | 31 | 0 | — | — |
| `fieldCodeOfSpelling`, nullable-map gate | 238 | 4 | 0 | 0 |
| `refArrShapeKindGo`, paren-union map rung | 18 | 0 | — | — |
| `collectATypeRef`, nullable-map arm | 17,533 | 96 | — | 2 |

The two disagreements are D2723 and `maps/nullable-map-union-same-shape-records-is.vl`, a
nullable union of twin maps that the checker spells folded. The probe's twin used `tyMapHeld`,
which misses a twin union. `tyIsNulMap` handles it, and the sweep is byte-identical.

## Changed

- `collectATypeRef` and `fieldCodeOfSpelling`'s code 29 ask `tyIsNulMap`.
- `nulRefMapValInnerOfTy` asks `tyIsBareMap` of the peeled member type.
- `fieldCodeOfSpelling`'s untyped bare-map leg and `refArrShapeKindGo`'s paren-union map rung
  are deleted. Neither was ever true on the sweep.
- `rlElemMapShape` loses a `nulMapInnerName` cut whose result it never read.

## Left

`nameIsBareMap` keeps `nulMapInnerName` (`emit_map_value_slots.vl`), `refElemArrName` (w311)
and `monoAnnPinName`'s untyped leg. `nulMapInnerName` keeps three name producers in
`emit_union_atoms.vl` and `shapeFieldElemName` (w311).

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,954 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Render-parse.** Flat at 20 renders and 57 parses, with `--findings`.
- **Checks.** After master was merged in: the fixpoint holds, `rep-fuzz-check.sh` is exact,
  `cases_wasm` passes 7,459 with 0 failed, lint-self is clean, and the export budget, with
  findings, has 0 dead exports.
