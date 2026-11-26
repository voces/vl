# IR: a box map read's computed default is boxed into the read's box (2026-11-26, lane COV-CLOS)

## Defect

A union map read under `??` takes the box arm (form 5). Its default is boxed into the map's value
rep, and a default that is not self-contained is fused: written into the read's out local.
The fusion was allowed only when the read's rep was the map's value rep. A boxed `T | null` value
(`{[string]: {f: K[]} | string | null}`) read under a non-null default yields the non-null box,
while the value rep is the disc-4 nullable of that box. The two reps differed, so the read missed
(`map read box default computes`). That class was behind the I8 draft's only two rep-fuzz REJECT
rows.

## Fix

Where the map's value rep is the disc-4 nullable whose inner box is the read's rep, the builder
boxes the default into the read's box. It is the same struct, its null only one more tag. The
fused read is then at one rep. The verifier's map-read rule accepts a form-5 default at that inner
box as well as at the value rep. A self-contained default at the inner box lowers to the same bytes
(the shadow matches them). Nothing in `wasmEmit` changes, so there is no claims-off ripple.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,702 | 114,704 |
| lost | — | 0 |
| `map read box default computes` | 2 | 0 |

The gained units are `boxUnionWithNull` and `boxUnionAtomArrayDefault` in
`maps/nullable-value-map.vl`.

## Rep fuzz

Seed 31337 case 1 (`{[string]: {f: {[string]: f64}} | {w: i32} | null}`) and seed 88888 case 243
(`{[string]: {f: K0[]} | string | null}`) are generated at count 150, depth 5. Base misses each
with this class. Head claims both, and each prints its `@log` value with claims on and off.

## Positions

`tests/cases/maps/map-box-read-computed-default-positions.vl` covers binding, argument, `return`,
record field and list element, over a stored null, a stored member and a missing key. Base misses
`map read box default computes` twice; head claims every function, and the output is the same with
claims on and off.
