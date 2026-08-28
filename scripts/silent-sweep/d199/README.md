# The D199 grid — a union ARM at a function-value boundary, and the receiver it is read through

The 210-cell grid that closed `silent-class-inventory.md` **D199**, **D222** and **D269**,
and that found **D351**.

```sh
python3 scripts/silent-sweep/d199/gen199.py /tmp/g199

JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/g199 <master.wasm> /tmp/g/base.json
JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/g199 <branch.wasm> /tmp/g/branch.json
```

`gradecensus.py` is reused verbatim — it takes the seed as an argument, so both sides are
measured with ONE host binary and no tree switching. `JOBS` defaults to **6** and nothing
here raises it. **The expectation is the GENERATOR's, never a compiler's**: every cell prints
`7`, and the two two-callee shapes print it twice.

## Why this grid exists

Because **D201** is still true. That row is titled *"the corpus cannot witness this family at
all"*, and every instrument agreed with it during this landing:

| instrument | population | what it saw |
|---|---|---|
| distilled corpus | 1,477 derived classes standing for 250,775 census cells, + 537 curated | **0 cells moved**, for all four rungs |
| corpus `cmp` | 1,923 buildable `tests/cases` + `std` modules, byte-compared | 1,923 identical, **0 differing**, 0 lost, 3 gained — and the 3 are the three fixtures the rows own |

So the family had to be built to be measured. This is the build, and its four axes are chosen
so that each rung of the landing has cells that ONLY it moves.

## Axes

- **`shape`** — the boundary and the spelling, in four groups:
  - `hof2` / `hofret` — TWO higher-order callees, each annotated for its own arm-or-twin name
    and each handed its own lambda. The `$fnsig` key's PARAM leg and its RESULT leg (D199).
  - `hofcross` / `bindcross` — ONE arm-typed callee handed a closure minted under the TWIN's
    spelling, inline and through an annotated binding. The same key seam with the two sides
    forced to meet, which is what turns a redundant functype into a trap.
  - `vcall_narrow` / `vcall_objlit` / `vcall_bind` / `dcall_narrow` — the value-call ARM
    PARAMETER (D269), with the arm-annotated binding and the DIRECT call as controls that run
    on every compiler.
  - `read_bare` / `read_paren` / `read_paren2` / `read_bare_path` / `read_paren_path` — a
    narrowed union receiver read with and without parentheses (D222). One paren is the whole
    difference, which makes the control free.
- **`twin`** — what else claims the arm's layout: `arm` (a second UNION's arm of the same
  shape — the `uVarTwin` merge), `decl` (a declared plain struct — D280's cross-table merge),
  `none`. The four two-name shapes need a second name and SKIP `twin=none` (24 cells).
- **`fld`** — the arm's field storage: `i32`, `two` (two i32 fields), `str` (i32 + string).
- **`order`** — declaration order of the type block.

## What it measured

Base `4bdfcc67`: **84 runs · 108 loud emit reject · 18 trap_loads**.
The landing: **198 runs · 0 loud · 12 trap_loads**, with **0 runs lost** and **0 → silent**.

| seed | runs | loud | silent | cells only the full landing runs |
|---|---|---|---|---|
| base (all rungs ablated) | 84 | 108 | 18 | 114 |
| V ablated | 174 | 18 | 18 | 24 — `hof2`/`hofret`/`hofcross`/`bindcross`, all `twin=arm` |
| P ablated | 144 | 54 | 12 | 54 — every `read_paren*` |
| K ablated | 180 | 18 | 12 | 18 — `read_paren_path` only |
| C ablated | 162 | 36 | 12 | 36 — `vcall_narrow` + `vcall_objlit` |
| the landing | 198 | 0 | 12 | 0 |

24 + 54 + 36 = 114, so the rungs partition the base's shortfall and no two of them are one
landing. **P and K are the exception and the grid is what says so**: K's 18 cells are a subset
of P's 54, because the path-key unwrap is unreachable until the receiver unwrap has fired.
Stripping all four rebuilds the base seed byte for byte (`md5 28d8dbf44a9f6ba88c197176c3f07d7d`).

## The `order` axis earned its place, once

`bindcross_arm` and `hofcross_arm` graded **3 `trap_loads` / 3 loud** on the base — the split
is exactly `order=norm` vs `order=rev`. Which row of a twin pair is declared first decides
whether the mismatched `$fnsig` reaches the type section or is refused a stage earlier, so a
grid without the axis would have reported one of the two outcomes as the family's.

## The residue, the refusal that named it, and the close that came from somewhere else

12 cells were still `trap_loads` after that landing: `hofcross_decl` and `bindcross_decl`, the
variant⇄STRUCT-table half of D199's seam. **D351** is the row. Its obvious fix was built and
graded here: folding the arm's `$fnsig` slot onto the declared struct row buys all 12 and
costs **6 `runs` → check-clean invalid wasm** (`vcall_narrow_decl`), because the token CHAR is
what `sigParamKindAt` reports and an arm parameter spelled `s…;` stops being a `variant`
parameter. That refusal stands, and its 18 cells are kept whole at
`scripts/silent-sweep/distilled/named/d199_*_decl_*.vl` (coordinates:
`census/d351-crossfold-price.json`).

**#1994 closed the 12 without paying the 6**, by folding the `$fnsig` POOL rather than any
key: two entries whose functypes render byte-identically now share one type index
(`cloSigTwin`), so `sigParamKindAt` still reads `V…;` and the value-call arm coercion still
fires. On this grid: **210 runs, 0 trap_loads, 0 runs LOST, 0 → silent.** On the corpus it
moves seven pre-existing modules and not one of them is this seam — six are list-WRAPPER twins
and one is a map-struct twin, which is the argument for doing it at the byte level rather than
one table pair at a time.

## The grid's second measurement: four sites, one landing

Four sites turn a `$fnsig` pool position into a type index, and this grid is what shows they
cannot be routed separately.

| seed | runs | trap_loads | cells MOVED vs base | note |
|---|---|---|---|---|
| base = master `7d3698a4` | 198 | 12 | — | md5 `8ae09ea5d0888321f09028a3f86fb97d` |
| all rungs ablated | 198 | 12 | 0 | output byte-identical to base on all 1,934 corpus modules |
| twin COMPARISON ablated | 198 | 12 | 0 | the column is filled with the identity |
| DECLARED functype unrouted | 198 | 12 | **24** | 12 bought, **12 `runs` LOST** — the histogram is the base's |
| value call unrouted | 186 | 24 | 12 | **12 `runs` LOST**, nothing bought |
| arity fallback unrouted | 210 | 0 | 12 | 0 — the site is never reached on this grid |
| `.map` callback unrouted | 210 | 0 | 12 | 0 — the site is never reached on this grid |
| the landing | 210 | 0 | 12 | 12 bought, 0 lost |

**Read the fourth row twice.** Its histogram is the base's, exactly, and 24 cells have moved
underneath it. A histogram delta would have called that landing a no-op.

The two rungs that score 0 here are not equal. `.map`'s is reached by nothing in this grid and
nothing in the distilled corpus, and over the whole `tests/cases` tree its answer changes on
exactly ONE module — `closures/map-callback-value-fnsig-pool-twin.vl`, which had to be written
for it. That module runs on master and traps with the `.map` site alone unrouted, so the rung
is load-bearing at a score of zero everywhere else. The arity fallback's cannot be witnessed at
all, because `i*ar>i` is the only key the token alphabet can spell that renders
`(structref, i32*ar) -> i32`, so that entry is always its own representative.

## Named sets out of this grid

```sh
python3 scripts/silent-sweep/d243/mkset.py /tmp/set \
    scripts/silent-sweep/census/d199-rungs.json /tmp/g199
JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/set <seed.wasm> /tmp/s.json
```

- `census/d199-rungs.json` — 15 cells: nine that one named rung and only that rung buys, plus
  six controls that must never move.
- `census/d351-crossfold-price.json` — 18 cells kept WHOLE: the 12 the refused key fold buys
  and the 6 it costs. All 18 run today.
- `census/d351-halfroute-price.json` — the 12 `hof2_decl`/`hofret_decl` cells a PARTIAL routing
  of the pool costs. Two of them are already `d199-rungs` controls and stay in that block.

Cells are named by COORDINATE (`d199_hof2_arm_i32_norm`), not by index, so a named set keeps
its names when a later axis is added and `mkset.py`'s staleness check means what it says.

## Resource discipline

`JOBS` defaults to **6** and nothing here raises it.
