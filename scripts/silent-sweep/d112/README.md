# The D112 grid

The 1,114-cell grid that closed `silent-class-inventory.md` **D112** and filed **D123** and
**D124** out of its residue. Kept because the closing numbers in that document — **452
moved, all `check-clean invalid wasm` → `runs`, 0 backward, 0 same-class message changes,
silent 513 → 61** — are only a claim if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d112/gen112.py /tmp/d112cells

JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d112cells <master.wasm> /tmp/g/base.json
JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d112cells <branch.wasm> /tmp/g/branch.json
```

`grade88.py` is reused verbatim — it takes the seed as an argument rather than reading
`build/vl-compiler.wasm`, so both sides are measured with ONE host binary and no tree
switching, and using one grader across the D88 and D112 grids is what makes their residues
comparable. `JOBS` defaults to **6** and nothing here raises it (`vl check` peaks around
650 MB RSS).

**The expectation is computed by the generator, never by the compiler.** Every cell prints
exactly `7`, so a module that loads and answers wrong grades `runs but wrong value` rather
than `runs`. Every leaf kind reaches 7 by its own route — the object shape through `.r`, the
string through `"1234567".length`, the list through `[0]`, the inner mono map through
`["z"]` — so no leaf is silently untested for want of a way to print.

## Why these axes

- **`depth`** (1 / 2 / 3 maps) — D112 is a NESTED map and a one-level grid structurally
  cannot see it. Depth 3 is not decoration: 55 of the 61 surviving silent cells are there,
  and it is the only depth at which two intermediate value cells are nullable at once.
- **`leaf`** (`anon` / `scalar` / `str` / `list` / `monomap`) — the innermost value. `anon`
  is D112's own coordinate; `monomap` is the CONTROL that ran before the fix (the mono map
  struct IS what an unseeded `Map()` builds, so the bug was invisible there); the three
  scalar-ish leaves are what say D124 is about the map SLOT and not the value's rep, because
  they are in its residue too.
- **`decl`** (`nodecl` / `plain` / `plaintwin` / `arm` / `armtwin`) — D53's levels, carrying
  the CLAIMANT COUNT (0 / 1 / 2 declared structs of the leaf layout) and ARM-NESS in one
  axis. **D112's whole point is `nodecl`** — not one declared type in the file — and keeping
  the other four is what separated its residue into D123 (arm-ness) and D124 (neither).
- **`src`** (`inline` / `declname`) — the leaf shape spelled as a literal `{r: i32}` or by a
  declared name. Two spellings of one type, only one of which lowered, is D53's sentence and
  it is still an axis here.
- **`ann`** (`none` / `outer` / `inner` / `both`) — which levels carry the container
  annotation. **It is the axis that separates D124 from everything else**: 57 of the 61
  survivors are `ann=outer`, i.e. exactly the state in which one map layout gets named twice
  — once inferred from the store, once written down.
- **`nul`** (`nonul` / `nul`) — whether the crossed value cell is `V | null`. This is the
  axis rung 2 of the close moved, and the axis D124 lives on (53 of 61).
- **`read`** (`coal` / `coalvar` / `getm` / `opt`) — `m[k] ?? Map()`, `m[k] ?? <a named map
  of the right type>`, `m.get(k) ?? Map()`, and `m[k]?.f ?? 0`. `coalvar` is the control that
  RAN before the fix and is what says the trigger is the bare `Map()` and not the `??`;
  `getm` is the method spelling of the same lowering and had to be shown to move with it.
- **`order`** (`norm` / `rev`) — the declarations reordered, because declaration order has
  been the whole answer at this layer before (D33).

Cells that are structurally unrepresentable are skipped rather than emitted broken:
`src=declname` needs a declaration, `order=rev` needs two reorderable declaration lines,
`ann=inner`/`both` need a level to annotate, `nul` needs an annotation to spell `| null` on
and an intermediate cell to put it on, and a non-object leaf has no shape to declare and no
field to optional-chain.

## What the close reported

| grid | cells | base silent | branch silent | moved | backward |
|---|---|---|---|---|---|
| D112 (this one) | 1,114 | 513 | 61 | 452 | 0 |
| D88 / D100 | 2,850 | 530 | 100 | 430 | 0 |
| D52 | 9,450 | 0 | 0 | 0 | 0 |
| D75 / D81 / D82 | 3,144 | 0 | 0 | 0 | 0 |

Every moved cell is `check-clean invalid wasm` → `runs`. The two older grids' zeros SURVIVE
the change, which is the evidence that it is inert where it is not the answer — and breaking
one of them would have been the finding.

## The residue, and why it is two rows and not one

61 cells survive here and 100 on the D88 grid. They do not overlap in mechanism:

- **D123** — every cell with `decl` in {`arm`, `armtwin`, `armdiff`}: the arm-nominal map
  rung is a one-level special case rather than a rung in the recursive `shapeNominalOfTy`.
- **D124** — every `depth=3` x `nul` x `ann=outer` cell, at EVERY leaf kind: a
  `{[K]: V | null}` value spelling mints a second map slot for a layout that already has
  one.

**D112's fix moved the WASM of the D124 cells without moving their outcome class** — the
first of their two `?? Map()` sites went from the mono struct to the typed one and the
store-side twin mismatch stayed. A partial fix inside one outcome class is invisible to the
grader of that class; `cmp` the modules across the fix, or a half-moved family reads as an
untouched one.


## The 2026-08-27 re-grade (D123 / D124's close)

Re-run against master `89d01c97` and the D123/D124 branch with `grade88.py`, one host
binary, both sides (re-measured on the merged base after #1962 landed; **0 cells differ
from the pre-merge measurement on `89f88840`**, and #1962 moves none of these cells):

| side | runs | loud emit reject | check-clean invalid wasm |
|---|---|---|---|
| base `89d01c97` | 761 | 292 | 61 |
| D123/D124 branch | 810 | 292 | 12 |

**49 cells moved, every one `check-clean invalid wasm` → `runs`; 0 backward, 0 to a silent
class.** Every moved cell is `depth=3` x `nul` x `ann=outer`, at every leaf kind — which is
what says D124 is the map-SLOT identity and not the value's rep, exactly as the row filed
it. All 49 belong to **D124** alone: the ablation's D123 compilers move **0** cells here.

**Two same-class MESSAGE changes**, both `d3 x armtwin x nul x coalvar`: the engine's
complaint moved from `function[N]::mk` to the start function. The in-`mk` mismatch is gone
and the module-scope one is not — progress no outcome-class count can see, which is the
instrument this grid's own close named.

The residue is **12 cells, all `armtwin` x `declname` x `leaf=anon` x `read=coalvar`**
(6 at depth 2, 6 at depth 3), filed as **D139**: an arm-valued map beside a standalone
struct of the arm's exact layout, where the two mv slots hold two genuinely different heaps
and merging them would be wrong.

### The ablation

Three candidate edits, one compiler per candidate, built by STRIPPING the others out of the
branch — and stripping ALL of them reproduces `89d01c97` **byte-for-byte** (1,452,441
bytes, the same number the coordinator proved independently), so the base column is proven
rather than assumed.

| candidate | this grid | D88/D100 grid |
|---|---|---|
| A — `rlSlotsLayoutTwin` in `repMapValSlotsTwin`'s kind-1 arm | 0 | 8 |
| B — the niche peel in the twin's canonical identity | **49** | 0 |
| C — the value-row columns read through `mvCanonRepOf` | 0 | 0 |
| A + C | 0 | **56** |
| A + B + C (the branch) | 49 | 56 |

`A ∩ B = 0` and `(A+C) ∩ B = 0` on both grids; `(A+C) ∪ B` is set-identical to the branch's
moved set on both. A and C are ONE root in two edits (their union alone is 8, the pair is
56); B is a second root.
