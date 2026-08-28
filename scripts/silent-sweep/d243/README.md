# The BOX-vs-ARM grids — the axes D243 / D244 / D200 turn on, crossed

3,360 cells in two blocks. Built 2026-08-27 for the PR that closed **D243**, **D244** and
**D200**, and kept because the closing numbers below are only a claim if the population
cannot be re-run.

```sh
python3 scripts/silent-sweep/d243/genbox.py /tmp/gridP --block P   # 3,200 cells
python3 scripts/silent-sweep/d243/genbox.py /tmp/gridQ --block Q   #   160 cells

JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridP <seed.wasm> /tmp/P.json
python3 scripts/silent-sweep/census/delta.py /tmp/gridP <before.json> <after.json>
```

`gradecensus.py` and `delta.py` are reused verbatim — each takes the seed as an argument and
reads the generator's `manifest.json` for the expectation, so both sides of a delta are
measured with ONE host binary and no tree switching, and the outcome vocabulary is the
census's. **The expectation is computed by the GENERATOR, never by the compiler**: every cell
prints exactly `7`, so a module that loads and answers something else grades
`runs but wrong value`.

## Block P — what `scripts/silent-sweep/d184` block N held constant

Block N is D184's grid and it is where D243 and D244 were filed. Block P is that coordinate
with three axes promoted.

| held constant by block N | promoted here to | earned by |
|---|---|---|
| `escope=["mod"]` — all 640 cells are module globals | **`escope`** — mod / fn | **D244**, whose whole content is that the module-scope spelling is silent and the in-function spelling of the identical six lines RUNS. **30 of the 72 silent cells are `escope=fn`** and block N could see none of them. |
| `depth` stops at 3 (block M's too) | **`depth`** — 2 / 3 / 4 | **D243**, whose cause is a SCAN BOUND. A population that stops at 3 cannot tell "fixed" from "fixed one level further out"; **27 of the 72 are depth 4**. |
| every level gets its own BINDING (`const mid = [iv]  const c = [mid]`) — no grid has ever varied this | **`nest`** — bind / lit | **D243's filed witness writes the outer levels as ONE nested literal** (`const c = [[iv]]`), and that is a different program: the binding form gives `dstPinSrcIs` an alias to follow, the literal form gives it a nested `ArrayLit` to descend. **54 of the 72 are `nest=lit`.** |

Everything else is block N's: `nominal` (none / twin / union / twinunion), `elem` (list / map
/ bare), `deliv` (lit / ident / call / param), `annpat` (none / outer / inner / all), `rep`
(arm / struct).

### What block P STILL holds constant

Stated so the next reader can promote it rather than rediscover it:

* map keys are always `string`;
* the OUTER container is always a LIST (the map-outer cross is the census's block C);
* no `| null` anywhere, no closures, one element per container;
* no `conduit` axis (block L's) and no `annpat=mid` (block M's) — those two blocks still own
  them, and block P is not a replacement for either;
* no `order` axis — declarations are emitted in one order;
* every cell's leaf is an object shape; the seven scalar leaves block L crosses are absent.

## Block Q — the box ↔ arm seam, which is not a container question at all

D200 is `store=global × twin=exact × deliv=box-argument`, and the three controls its row
files are three points of a grid nobody built. Block Q is `src × dst × twin`:

* **`src`** — how the arm-shaped value is PRODUCED, which is what decides its rep: an
  arm-annotated global, an un-annotated global, an arm-annotated local, an un-annotated
  local, a value through an arm-typed parameter, a `: Circle`-returning call, an
  INFERRED-result call, a capture.
* **`dst`** — where it is delivered: a bare read, a union PARAMETER, a union RETURN, a
  union-typed GLOBAL assignment, a union-typed LOCAL, a `Shape[]` element, a
  `{[string]: Shape}` value, an arm-typed named PARAMETER, an arm-typed CLOSURE parameter, a
  `Circle[]` element.
* **`twin`** — none / an exact layout twin (`type Dot = { r: i32 }`), because that is what
  turns a loud refusal into a silent one.

**D200's row filed ONE destination and there are five.** At `src=global-annotated ×
twin=exact` the union PARAMETER, the union GLOBAL, the union LOCAL, the `Shape[]` element and
the `{[string]: Shape}` value were all `check-clean invalid wasm`; all five close on one
gate. Block Q still holds constant: one arm shape (`{r: i32}`), one union (two arms), no
`| null`, no generics, no nesting.

## The result it was built for — merge base `322c07f2` (seed 1,461,174), branch seed 1,461,831

Cell-matched by `delta.py`, both seeds proven self-compilation fixed points, both grids
generated ONCE and graded against every seed.

### Block P (3,200 cells) — 72 silent on the merge base

| variant | moved | → `runs` | **`runs` LOST** | **→ silent** |
|---|---|---|---|---|
| A alone (`globalKind`'s `ObjLit` variant rung — D244) | 12 | 12 | **0** | **0** |
| B alone (`dstPinPushAnn`'s element DEPTH — D243) | 69 | 69 | **0** | **0** |
| C alone (`globalStructIndexSid`'s kind gate — D200) | **0** | 0 | **0** | **0** |
| A+B+C — what shipped | **72** | 72 | **0** | **0** |

### Block Q (160 cells) — 13 silent on the merge base

| variant | moved | → `runs` | **`runs` LOST** | **→ silent** |
|---|---|---|---|---|
| A alone | 2 | 2 | **0** | **0** |
| B alone | **0** | 0 | **0** | **0** |
| C alone | 5 | 5 | **0** | **0** |
| A+B+C | **7** | 7 | **0** | **0** |

`|A ∩ C| = |B ∩ C| = 0` in both blocks and `|A ∩ B| = 9` in block P (at depth ≥ 3 a
box-repping global runs either because the producer stops repping as the box or because the
pin names the arm). In both blocks the union of the singles is **set-IDENTICAL** to the whole
(72 = 72, 7 = 7), so the composition adds nothing and cancels nothing.

**THE DIRECTION CHECK IS THE POINT OF THE TWO BLOCKS.** C moves 0 cells in block P and B
moves 0 in block Q, and each is load-bearing in the other — a candidate that moves 0 alone in
the population you happen to have built is not thereby inert.

**Stripping all three reproduces the merge base byte-for-byte** (1,461,174, sha256
`d94100cd…`), which is what makes the singles' seeds comparable to it at all.

## The named set — the cheap census substitute

`scripts/silent-sweep/census/d243-moved.json` names the 79 cells this landing moved, all of
them `-> runs`. It re-grades against any new seed in ~158 `vl` invocations:

```sh
python3 scripts/silent-sweep/d243/mkset.py /tmp/moved \
    scripts/silent-sweep/census/d243-moved.json /tmp/gridP /tmp/gridQ
JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py /tmp/moved <seed.wasm> /tmp/m.json
```

The histogram must read `runs 79` and nothing else.

## What these two blocks CANNOT cover, and it is the reason the full census still runs

A grid holds constant the axes it was not chasing, and both of these hold a great deal
constant (the two lists above). **Neither block is a substitute for the census after-pass**:
they contain no `| null`, no closures except block Q's one lambda destination, no generics,
no scalar leaves in block P, no declaration-order axis, and no map-outer container. The two
numbers `CLAUDE.md` item 6 asks for — `runs → not-runs` and `→ silent`, cell-matched against
the merge base over the full 150,224-cell population — are the integrator's to produce on the
merged result.
