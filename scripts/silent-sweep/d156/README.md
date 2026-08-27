# The D156 / D158 grid — the ANNOTATION-POSITION axis

The 1,188-cell grid that measured `silent-class-inventory.md` **D156** and **D158** and filed
**D171–D174** out of the result. Kept because the closing numbers in that document — the
total split of the peel along the layout-twin axis (**36 loud→runs / 0 backward where the
arm's layout is uncontested, 20 silent→runs / 16 runs→silent where it is contested**) — are
only a claim if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d156/gen156.py /tmp/d156cells

JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d156cells <master.wasm> /tmp/g/base.json
JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d156cells <branch.wasm> /tmp/g/branch.json
```

`grade88.py` is reused verbatim — it takes the seed as an argument rather than reading
`build/vl-compiler.wasm`, so both sides are measured with ONE host binary and no tree
switching, and using one grader across the D88, D112 and D156 grids is what makes their
residues comparable. `JOBS` defaults to **6** and nothing here raises it (`vl check` peaks
around 650 MB RSS).

**The expectation is computed by the GENERATOR, never by the compiler.** Every cell prints
exactly `7`, so a module that loads and answers wrong grades `runs but wrong value` rather
than `runs`. Every leaf kind reaches 7 by its own route — the object shape through `.r`, the
scalar directly, the string-free inner mono map through `["z"]`.

## Why this grid exists

D88/D100 and D112 both carry an `ann` axis, and in both it means **which LEVEL** of a nested
map is annotated (`none` / `outer` / `inner` / `both`). Neither varies **where the deciding
annotation SITS**. Every carrier in the `synthRetPinAnn` / `synthEmptyListAnn` /
`synthDstPinAnn` family reads a DELIVERY — a destination binding's annotation, a call
parameter's, a declared result's — and D158's entire content is that the only nominal claim
in its program is at a READ. A grid whose annotation axis is "which level" cannot separate
those two; this one's is "which position", and it does:

| `pos` | cells | `check-clean invalid wasm` on `ff04d74b` |
|---|---|---|
| `none` | 216 | **0** |
| `bindann` | 216 | 4 |
| `retann` | 108 | 6 |
| `dest` | 216 | 8 |
| `delivery` | 216 | 18 |
| `read` | 216 | **30** |

The silent class is monotone in how far the deciding annotation sits from the binding, and
`pos=none` — no nominal claim anywhere — has none of it at all. That is the shape of a
CHANNEL defect (D39) rather than a lowering one, measured rather than argued.

## Axes

- **`pos`** — `none` / `dest` (on the binding or parameter that receives the outer map) /
  `delivery` (a `thru(x: T)` call it is passed to) / `retann` (the building function's
  declared result) / `read` (only at the read site, as the annotated `??` default at each
  crossed level — **D158's coordinate**) / `bindann` (on the local the read's SOURCE is bound
  to, outside the builder).
- **`depth`** 1 / 2 / 3 nested maps. D156 is a NESTED map and a one-level grid structurally
  cannot see it; the backward half of the peel lives at depth 2 and 3 only.
- **`leaf`** `arm` / `anon` / `struct` / `scalar` / `map` — the innermost value and how an
  annotation spells it. **Every cell the peel moves in either direction is `leaf=arm`**,
  which is what says the seam is variant⇄struct and not shape-versus-name; `struct` is the
  declared non-arm control and `scalar` / `map` are the value kinds with no nominal claimant.
- **`twin`** — whether an exact layout twin (`type Dot = { r: i32 }`) is declared. This is
  the axis the peel splits on TOTALLY (see the header), so a grid without it measures a
  mixture and reports a net.
- **`storage`** `local` / `global` / `param` / `callres` — where the OUTER map is bound.
  D139 was storage-class DEPENDENT and D155 is not, so a grid that holds this constant cannot
  tell those two rows apart. `callres` is also the coordinate at which `armPinLitInit`
  declines, the initializer being a call rather than a literal producer.
- **`order`** `norm` / `rev` — declaration order of the type block. The mv slot find is
  un-hinted for a caller with no recorded type, so it resolves whichever of two same-canon
  slots was minted first; order is how that becomes visible (D93's own `order=b` residue).

## Resource discipline

`JOBS` defaults to **6** and nothing here raises it.

## Skips

Cells that are structurally unrepresentable are skipped rather than emitted broken:
`leaf=struct` needs the twin declaration to exist (144 cells), and `pos=retann` needs a
function whose result IS the outer map, which does not exist at `global` or `param` storage
(108 cells).
