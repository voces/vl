# d341 — the `elem_place` grid inventory-2 D11 is filed against

`mkgrid.py` writes 184 cells: **23 gap reps × 4 narrowing constructs × 2 runtime inputs**,
every one narrowing `xs[0]` IN PLACE and then reading it. It is the denominator D11's row
quotes, and the population its price was measured on.

```sh
python3 scripts/silent-sweep/d341/mkgrid.py <outdir> --verify
JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py <outdir> <seed.wasm> out.json
```

## Why it is committed

#1993 built this grid, priced a candidate against it, refused the candidate — and threw the
generator away, keeping only the 51 cells that made up the price. #2001 had to rebuild it
from those 51 files to re-measure. `--verify` is the guard against that costing a third
person: it re-derives every cell that also exists under `distilled/named/` and asserts the
two are **byte-identical**, so a regenerated grid is provably the same programs and not a
paraphrase of them. It currently checks 56.

## The read has to CONSUME the narrowed type

This is the row's own correction and the reason the denominator moved from a filed 162 to a
measured 184. D11 was first read as "in-place element narrowing works for the reps whose
nullable is a niche, 8/8 on `new string` and `new boolean`" — on a grid whose newtype cells
read `print(xs[0])`. But `print` of a nullable `new string` is simply allowed: delete the
guard entirely and the cell still runs. The 8/8 was the use site's tolerance, not a
narrowing.

Every rep here therefore reads through a site that refuses a nullable — an index for the
arrays, `.size` for the maps and sets, a call whose parameter is DECLARED at the payload type
for the reps `print` tolerates, and a field read for the structs. The four scalar newtypes
keep `print(xs[0])`, which already refuses a nullable, and that is why their eight cells each
are byte-identical to the ones #1993 filed.

## What it measured

| seed | runs | loud check | loud emit | check-clean invalid wasm | trap |
|---|---|---|---|---|---|
| `053fcf64` (base) | 0 | **184** | 0 | 0 | 0 |
| #2001 (landed) | **86** | 2 | 40 | **56** | 0 |

0 `runs` lost, 0 wrong values. The 2 residual loud cells are `match` over a literal union — a
language limit whose control fails too, excluded by name. The 56 are D451, kept whole in
`distilled/named/` with coordinates in
`scripts/silent-sweep/census/d341-index-place-price.json`.

**The grid does not grade six of the landing's ten rungs.** R5–R10 move zero of these 184
cells; what grades them is the three `d341_sound_*` witnesses in the same named set (strip R5,
R6 or R7 one at a time and exactly one traps) and two fixtures under `tests/cases/`. A grid is
a population, not a proof of coverage.
