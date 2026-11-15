# Bucket marks on the open clause-2 rows, 2026-11-15

Lane R1. This note changes no code. It puts a bucket mark on the status line of every open clause-2 row
that had none, using the buckets and method of
[2026-11-14-clause2-architecture-map.md](2026-11-14-clause2-architecture-map.md).

## Method

- **Population:** `ls.vl -- --status open`, 180 rows. From these I took every open loud-reject row whose status
  line names no bucket: 116 that say `clause 2`, and 31 that name no clause. That is 147 rows.
- **Rows the map already bucketed:** 109 of them. Each takes the map's bucket and secondary bucket,
  which were ablated there, and its mark says `(the 2026-11-14 clause-2 map)`.
- **Rows filed after the map, or outside its population:** 38 of them. Each is bucketed from the ablation table in
  its own row, by the ingredient whose removal makes it run. Its mark says `(by ablation, 2026-11-15)`.
  Rows the map's population left out as diagnostic-only, owner, or by design are (g), with the reason
  from their own status line.
- **The mark** is appended to the status line: `bucket (x), <name>[: <why>][, secondary (y)] (<source>)`.

## Counts

| bucket | rows |
| --- | --- |
| (a) slot store | 44 |
| (b) L3 width subtyping | 9 |
| (c) L2 inferred interfaces | 20 |
| (d) L1 typed IR | 19 |
| (e) rep-as-ADT or hash-consed types | 18 |
| (f) a local fix | 9 |
| (g) not a clause-2 fix | 28 |
| total | 147 |

## Bucket (f): the local-fix queue

| row | why | source |
| --- | --- | --- |
| [D2836](../inventory/D2836.md) | see the map; secondary (d) | the 2026-11-14 clause-2 map |
| [D3477](../inventory/D3477.md) | see the map | the 2026-11-14 clause-2 map |
| [D16180](../inventory/D16180.md) | D15956's flow-sensitive read, the hole-lambda face | by ablation, 2026-11-15 |
| [D16181](../inventory/D16181.md) | the written `let` path builds the adapter the call needs | by ablation, 2026-11-15 |
| [D16182](../inventory/D16182.md) | D15956's flow-sensitive read, the call-argument face | by ablation, 2026-11-15 |
| [D16274](../inventory/D16274.md) | D1190's scoped substitution, the closure face | by ablation, 2026-11-15 |
| [D16540](../inventory/D16540.md) | the constant tree is typed before the destination pins `T` | by ablation, 2026-11-15 |
| [D16541](../inventory/D16541.md) | an infinite constant tree is not given the `f32` use | by ablation, 2026-11-15 |
| [D16435](../inventory/D16435.md) | a held record is joined with a fresh one before the annotation adopts it; secondary (e) | by ablation, 2026-11-15 |

Two of these are faces of families the map already named: D16180 and D16182 go with D15956 and D15957, and D16274 goes
with D1190. Each family should close together.

## Every row marked

| row | bucket | secondary | why | source |
| --- | --- | --- | --- | --- |
| D1666 | g |  | a measurement of the refusal sites, not a program | by ablation, 2026-11-15 |
| D1856 | d | c |  | the 2026-11-14 clause-2 map |
| D1968 | c | f |  | the 2026-11-14 clause-2 map |
| D1981 | e | d |  | the 2026-11-14 clause-2 map |
| D2101 | a |  |  | the 2026-11-14 clause-2 map |
| D2196 | e | d |  | the 2026-11-14 clause-2 map |
| D2293 | g |  | a diagnostic: the adjacency is not named | by ablation, 2026-11-15 |
| D2308 | g |  | a gap in the fuzz instrument | by ablation, 2026-11-15 |
| D2467 | d |  |  | the 2026-11-14 clause-2 map |
| D2520 | d | c |  | the 2026-11-14 clause-2 map |
| D2540 | g |  | message quality | by ablation, 2026-11-15 |
| D2634 | e | d |  | the 2026-11-14 clause-2 map |
| D2673 | e | d |  | the 2026-11-14 clause-2 map |
| D2681 | d |  |  | the 2026-11-14 clause-2 map |
| D2772 | g | e | the design owes the refusal | the 2026-11-14 clause-2 map |
| D2833 | d | e |  | the 2026-11-14 clause-2 map |
| D2836 | f | d |  | the 2026-11-14 clause-2 map |
| D3040 | g |  | awaits a readonly-view ruling | the 2026-11-14 clause-2 map |
| D3056 | g |  | awaits a readonly-view ruling | the 2026-11-14 clause-2 map |
| D3172 | d | e |  | the 2026-11-14 clause-2 map |
| D3183 | c | a |  | the 2026-11-14 clause-2 map |
| D3216 | c |  |  | the 2026-11-14 clause-2 map |
| D3230 | g |  | awaits the D3197 ruling | the 2026-11-14 clause-2 map |
| D3270 | g |  | awaits an owner ruling | by ablation, 2026-11-15 |
| D3286 | c | d |  | the 2026-11-14 clause-2 map |
| D3299 | c | f |  | the 2026-11-14 clause-2 map |
| D3321 | g |  | the refusal is owed; it is reported twice | by ablation, 2026-11-15 |
| D3368 | c | e |  | the 2026-11-14 clause-2 map |
| D3409 | g |  | possibly the intended grammar | by ablation, 2026-11-15 |
| D3431 | b |  |  | the 2026-11-14 clause-2 map |
| D3436 | c |  |  | the 2026-11-14 clause-2 map |
| D3452 | d | f |  | the 2026-11-14 clause-2 map |
| D3469 | d | c |  | the 2026-11-14 clause-2 map |
| D3470 | g |  | the refusal is owed, its sentence is not | by ablation, 2026-11-15 |
| D3471 | g |  | the refusal is owed, its first sentence is not | by ablation, 2026-11-15 |
| D3477 | f |  |  | the 2026-11-14 clause-2 map |
| D3482 | g |  | refused by design: the literal is not exact at `f32` | by ablation, 2026-11-15 |
| D3549 | d |  |  | the 2026-11-14 clause-2 map |
| D3642 | g |  | a build item awaiting an owner ruling | the 2026-11-14 clause-2 map |
| D3689 | g | d | awaits a ruling on `f64 is <integer literal>` | the 2026-11-14 clause-2 map |
| D3703 | g | d | awaits a ruling on `f64 is <integer literal>` | the 2026-11-14 clause-2 map |
| D3771 | g |  | a diagnostic cascade | by ablation, 2026-11-15 |
| D3818 | c |  |  | the 2026-11-14 clause-2 map |
| D3819 | g |  | the refusal is right, a hint is missing | the 2026-11-14 clause-2 map |
| D3851 | a | c |  | the 2026-11-14 clause-2 map |
| D3931 | d | c |  | the 2026-11-14 clause-2 map |
| D3956 | a | d |  | the 2026-11-14 clause-2 map |
| D3983 | g |  | a diagnostic: no `redeclared` | by ablation, 2026-11-15 |
| D3984 | g |  | a parse-error cascade | by ablation, 2026-11-15 |
| D4018 | d |  |  | the 2026-11-14 clause-2 map |
| D4050 | b |  |  | the 2026-11-14 clause-2 map |
| D4053 | g |  | the refusal is right, its reason is wrong | by ablation, 2026-11-15 |
| D4057 | g |  | the refusal is right, the duplicate is the defect | by ablation, 2026-11-15 |
| D4060 | g |  | a diagnostic cascade | by ablation, 2026-11-15 |
| D4081 | b | e |  | the 2026-11-14 clause-2 map |
| D4089 | d |  |  | the 2026-11-14 clause-2 map |
| D4150 | e | c |  | the 2026-11-14 clause-2 map |
| D4151 | e | c |  | the 2026-11-14 clause-2 map |
| D4173 | c | d |  | the 2026-11-14 clause-2 map |
| D4193 | g |  | the first refusal is right, the second is the defect | by ablation, 2026-11-15 |
| D4262 | b |  |  | the 2026-11-14 clause-2 map |
| D4263 | e | f |  | the 2026-11-14 clause-2 map |
| D4265 | e | d |  | the 2026-11-14 clause-2 map |
| D4267 | e | d |  | the 2026-11-14 clause-2 map |
| D4719 | c | a |  | the 2026-11-14 clause-2 map |
| D4770 | e | f |  | the 2026-11-14 clause-2 map |
| D4778 | e | d |  | the 2026-11-14 clause-2 map |
| D4860 | e | d |  | the 2026-11-14 clause-2 map |
| D4883 | c | d |  | the 2026-11-14 clause-2 map |
| D4961 | d | e |  | the 2026-11-14 clause-2 map |
| D4964 | d | e |  | the 2026-11-14 clause-2 map |
| D4985 | g |  | a diagnostic cascade | by ablation, 2026-11-15 |
| D5018 | a |  |  | the 2026-11-14 clause-2 map |
| D5472 | d | c |  | the 2026-11-14 clause-2 map |
| D10402 | a |  |  | the 2026-11-14 clause-2 map |
| D12130 | d | f |  | the 2026-11-14 clause-2 map |
| D12218 | a | c |  | the 2026-11-14 clause-2 map |
| D12230 | a |  |  | the 2026-11-14 clause-2 map |
| D12233 | a | f |  | the 2026-11-14 clause-2 map |
| D12236 | a | c |  | the 2026-11-14 clause-2 map |
| D12454 | b | c |  | the 2026-11-14 clause-2 map |
| D12455 | d | c |  | the 2026-11-14 clause-2 map |
| D12466 | e | d |  | the 2026-11-14 clause-2 map |
| D12602 | c |  |  | the 2026-11-14 clause-2 map |
| D14041 | e | d |  | the 2026-11-14 clause-2 map |
| D14042 | e | d |  | the 2026-11-14 clause-2 map |
| D14082 | e | c |  | the 2026-11-14 clause-2 map |
| D14401 | a |  |  | the 2026-11-14 clause-2 map |
| D14433 | a | d |  | the 2026-11-14 clause-2 map |
| D14437 | a | c |  | the 2026-11-14 clause-2 map |
| D14782 | a | e |  | the 2026-11-14 clause-2 map |
| D14827 | g |  | awaits the owner's option (c) | by ablation, 2026-11-15 |
| D14880 | a | c |  | the 2026-11-14 clause-2 map |
| D14888 | a | d |  | the 2026-11-14 clause-2 map |
| D15014 | d | c |  | the 2026-11-14 clause-2 map |
| D15040 | d | e |  | the 2026-11-14 clause-2 map |
| D15041 | c | d |  | the 2026-11-14 clause-2 map |
| D15161 | c | a |  | the 2026-11-14 clause-2 map |
| D15197 | a |  |  | the 2026-11-14 clause-2 map |
| D15303 | a |  |  | the 2026-11-14 clause-2 map |
| D15332 | a | c |  | the 2026-11-14 clause-2 map |
| D15334 | a | c |  | the 2026-11-14 clause-2 map |
| D15431 | a | c |  | the 2026-11-14 clause-2 map |
| D15483 | a | c |  | the 2026-11-14 clause-2 map |
| D15771 | c | a |  | the 2026-11-14 clause-2 map |
| D15776 | a | c |  | the 2026-11-14 clause-2 map |
| D15777 | a | c |  | the 2026-11-14 clause-2 map |
| D15900 | a |  |  | the 2026-11-14 clause-2 map |
| D15923 | a | e |  | the 2026-11-14 clause-2 map |
| D16079 | a | c |  | the 2026-11-14 clause-2 map |
| D16094 | a | c |  | the 2026-11-14 clause-2 map |
| D16095 | a | f |  | the 2026-11-14 clause-2 map |
| D16096 | a | c |  | the 2026-11-14 clause-2 map |
| D16130 | a | c |  | the 2026-11-14 clause-2 map |
| D16131 | a | c |  | the 2026-11-14 clause-2 map |
| D16136 | a | e |  | the 2026-11-14 clause-2 map |
| D16143 | a | c |  | the 2026-11-14 clause-2 map |
| D16144 | a |  |  | the 2026-11-14 clause-2 map |
| D16172 | e | f |  | the 2026-11-14 clause-2 map |
| D16180 | f |  | D15956's flow-sensitive read, the hole-lambda face | by ablation, 2026-11-15 |
| D16181 | f |  | the written `let` path builds the adapter the call needs | by ablation, 2026-11-15 |
| D16182 | f |  | D15956's flow-sensitive read, the call-argument face | by ablation, 2026-11-15 |
| D16202 | a |  |  | the 2026-11-14 clause-2 map |
| D16203 | a |  |  | the 2026-11-14 clause-2 map |
| D16207 | c |  | the open map hole is the ingredient | by ablation, 2026-11-15 |
| D16210 | b | c |  | the 2026-11-14 clause-2 map |
| D16211 | b | c |  | the 2026-11-14 clause-2 map |
| D16213 | a |  |  | the 2026-11-14 clause-2 map |
| D16214 | a |  |  | the 2026-11-14 clause-2 map |
| D16220 | a |  |  | the 2026-11-14 clause-2 map |
| D16240 | a |  |  | the 2026-11-14 clause-2 map |
| D16241 | a |  |  | the 2026-11-14 clause-2 map |
| D16242 | a |  |  | by ablation, 2026-11-15 |
| D16243 | a |  |  | by ablation, 2026-11-15 |
| D16272 | c |  | the unpinned empty-list result is the ingredient | by ablation, 2026-11-15 |
| D16273 | e | c | a nested empty list has no element rep | by ablation, 2026-11-15 |
| D16274 | f |  | D1190's scoped substitution, the closure face | by ablation, 2026-11-15 |
| D16331 | a | e |  | by ablation, 2026-11-15 |
| D16338 | c |  | the un-annotated parameter is the ingredient | by ablation, 2026-11-15 |
| D16339 | c |  | the un-annotated parameter is the ingredient | by ablation, 2026-11-15 |
| D16382 | g |  | awaits the return-rule flag day and ruling A1 | by ablation, 2026-11-15 |
| D16401 | b |  |  | by ablation, 2026-11-15 |
| D16402 | b |  |  | by ablation, 2026-11-15 |
| D16425 | c |  | the hole parameter is the ingredient | by ablation, 2026-11-15 |
| D16435 | f | e | a held record is joined with a fresh one before the annotation adopts it | by ablation, 2026-11-15 |
| D16540 | f |  | the constant tree is typed before the destination pins `T` | by ablation, 2026-11-15 |
| D16541 | f |  | an infinite constant tree is not given the `f32` use | by ablation, 2026-11-15 |
