# The D88 / D100 grid, and its ablation

The 2,850-cell grid that closed `silent-class-inventory.md` **D88 and D100** and filed
**D111** and **D112** out of its residue. Kept because the closing numbers in that document
— **24 + 18 cells, pairwise intersection 0, union-of-singles set-identical to the full
branch, 0 backward** — are only a claim if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d88/gen88.py    /tmp/d88cells

JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d88cells <master.wasm>   /tmp/g/base.json
JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d88cells <d88only.wasm>  /tmp/g/d88only.json
JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d88cells <d100only.wasm> /tmp/g/d100only.json
JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d88cells <branch.wasm>   /tmp/g/both.json

python3 scripts/silent-sweep/d88/ablate88.py /tmp/g
```

`grade88.py` takes the seed as an argument rather than reading `build/vl-compiler.wasm`, so
every side is measured with ONE host binary and no tree switching — the difference between
two runs is then the compiler and nothing else. That is `sweep52.py`'s discipline and the
reason the numbers from the two grids are comparable.

**The expectation is computed by the generator, never by the compiler.** Every cell prints
exactly `7`, so a module that loads and answers wrong grades `runs but wrong value` rather
than `runs`.

## Resource discipline

`JOBS` defaults to **6** and nothing here raises it. `vl check` peaks around 650 MB RSS.

## Why these axes

- **`decl`** (`nodecl` / `plain` / `plaintwin` / `arm` / `armtwin` / `armdiff`) — D53's own
  six levels, kept verbatim so this grid's residue is comparable with that close's. It
  carries TWO axes at once and both rows needed one of them: the CLAIMANT COUNT (0 / 1 / 2
  declared structs of the layout — `plaintwin` is D100's coordinate) and ARM-NESS
  (`arm` / `armtwin` / `armdiff` — `arm` is D88's, and that `armdiff` moves with it is what
  says the layout twin is NOT required).
- **`cont`** (`bare` / `mapval` / `nestedmap` / `listelem` / `structfield`) — the container
  the payload crosses in. **`mapval` is D88's coordinate and `nestedmap` exists because a
  one-level grid cannot see a recursion gap**; it is where the largest surviving silent
  family (D112, 570 cells) lives.
- **`route`** (`none` / `gen` / `std`) — no generic, a hand-written `idg<T>`, and
  `std:array`'s `reverse<T>`. `gen` is D88's coordinate; `none` and `std` are what proved
  D100 is route-independent (6 cells each way).
- **`src`** (`inline` / `declname`) — the shape spelled as a literal `{r:i32}` or by a
  declared name. The two denote one type and only one of them lowered, which is D53's whole
  sentence and D100's too.
- **`deliv`** (`direct` / `local` / `param` / `paramlocal` / `retann`) — `paramlocal` is
  D100's own filed shape (a parameter re-bound to a local and returned) and was added after
  a first generation held it out; a delivery axis that misses the filed witness measures
  something else.
- **`ann`** — whether the local carries the container annotation. **It is the axis that
  found D111**: the `ann0` siblings move to `runs` and the `ann1` siblings move loud → a
  DIFFERENT loud, which no outcome-class count can see.
- **`order`** — the layout twin (or the union's arms) declared before rather than after.

Cells that are structurally unrepresentable are skipped rather than emitted broken:
`src=declname` needs a declaration, and `order=rev` needs a declaration block with two
reorderable lines.

## What the ablation reported

| candidate | moved | transitions | axes |
|---|---|---|---|
| D88 only | 24 | 24 `check-clean invalid wasm` → `runs` | `mapval` x `gen` x `declname` x {`arm`,`armtwin`,`armdiff`} x {`param`,`paramlocal`} |
| D100 only | 18 | 18 `loud emit reject` → `runs` | `plaintwin` x `inline` x `bare` x `ann0` x all routes |
| both | 42 | 24 + 18 | — |

Pairwise intersection **0**; union of the singles **set-identical** to the full branch. Two
roots, and 0 cells moved backward or to a silent class in any candidate.
