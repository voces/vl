# The LIST-CONTAINER grid — the axes D180 / D183 / D184 turn on, crossed

2,224 cells in three blocks. Built 2026-08-27 for the PR that closed **D180**, **D183** and
**D184**, and kept because the closing numbers below are only a claim if the population
cannot be re-run.

```sh
python3 scripts/silent-sweep/d184/genlist.py /tmp/gridL --block L   # 1,188 cells
python3 scripts/silent-sweep/d184/genlist.py /tmp/gridM --block M   #   396 cells
python3 scripts/silent-sweep/d184/genlist.py /tmp/gridN --block N   #   640 cells

JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridL <seed.wasm> /tmp/L.json
```

`gradecensus.py` is reused verbatim — it takes the seed as an argument and reads the
generator's `manifest.json` for the expectation, so both sides of a delta are measured with
ONE host binary and no tree switching, and the outcome vocabulary is the census's.
**The expectation is computed by the GENERATOR, never by the compiler**: every cell prints
exactly `7`, so a module that loads and answers something else grades `runs but wrong value`.

## Why it exists — what every earlier grid held constant

| held constant by | promoted here to | earned by |
|---|---|---|
| `d52` `d88` `d94` `d111` `d112` `d131` `d139` and the D156 position grid all build the container as a **`Map()`** | **`elem`** — list / map / bare, so every map cell has its LIST twin | **D184**, which exists only because the list spelling of a coordinate seven grids covered was never generated |
| every one of them delivers the inner container as an inline literal or a local | **`deliv`** — lit / ident / call / param / global / field — and **`conduit`** — none / a hand-written generic / `std:array`'s `reverse` | **D183**, which is D180's coordinate with a conduit in the middle, and **D180**, whose element is an IDENT rather than a nested literal |
| the census's `annpos` annotates the OUTERMOST binding only | **`annpat`** — none / outer / mid / inner / all — crossed against **`depth`** (2 or 3) | **D180**, whose own control table says only the MIDDLE annotation rescues at depth 3 |
| each picked ONE leaf type | **`rep`** — i32 / string / f64 / f32 / i64 / boolean / a string literal-union / a plain struct / a union ARM | **D180**, whose `i32` control is a LOUD emit reject and whose `string` twin is silent: the axis decides the outcome CLASS |
| the row's own scope | **`escope`** — module / function | **D180**, loud at module scope and silent in a function |

The three blocks are `L` (the D180/D183 core: `deliv × rep × conduit × annpat × escope`),
`M` (`depth × annpat × rep × deliv × escope`) and `N` (D184's: `nominal × elem × deliv ×
annpat × depth` at the two object reps).

## What this grid STILL holds constant

Stated so the next reader can promote it rather than rediscover it:

* map keys are always `string`;
* the OUTER container is always a LIST (the map-outer cross is the census's block C);
* no `| null` anywhere, no closures, one element per container;
* no `order` axis — declarations are emitted in one order;
* `nominal` is only crossed in block N, and only against the two object reps.

## The result it was built for — seed `1457423`, merge base `a19a3db7` (seed `1457262`)

Cell-matched, both seeds proven self-compilation fixed points.

| variant | moved | → `runs` | **`runs` LOST** | **→ silent** | silent LOST |
|---|---|---|---|---|---|
| R1 alone (the `arrLitIsRef` list rung) | 338 | 304 | **0** | **0** | 150 |
| R2 alone (`armPinAnnName`'s own rung at depth) | **0** | 0 | **0** | **0** | 0 |
| R3 alone (`dstPinPushAnn`'s element arm) | 9 | 9 | **0** | **0** | 9 |
| R1+R3 — **what shipped** | 347 | 313 | **0** | **0** | 159 |

`R1 ∩ R3 = 0`; the union of the singles is set-IDENTICAL to the whole (347 = 347), so the
composition adds nothing and cancels nothing. R2 is inert here, on the corpus and on all four
filed witnesses, and was dropped rather than shipped.

Transition matrix for the shipped pair: 188 `loud emit reject → runs`, 125
`check-clean invalid wasm → runs`, 34 `check-clean invalid wasm → loud emit reject` (all
module-scope conduit cells reaching `monomorphize: unsupported argument type`, a refusal the
classification hole was routing around). 18 cells remain silent, all in block N, and they are
filed as **D243**, **D244** and **D245**.
