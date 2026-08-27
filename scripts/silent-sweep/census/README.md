# The CENSUS grid — the cross product of the axes the per-row grids each held fixed

Built 2026-08-27 against master **`1559d80c`**, seed **1,452,766 bytes** (a self-compilation
fixed point: `refresh-compiler.sh` reproduced it byte-identically from that tree).

## Why it exists

`scripts/silent-sweep/` has one grid per row — `d52/`, `d88/`, `d94/`, `d111/`, `d112/`,
`d131/`, `d139/`. Each was scoped to the row it was chasing, and each was later shown to
hold constant the axis that mattered: a 900-cell grid declared the union in all 900 files;
a 741-cell grid hid a defect in its own prelude; a 1,514-cell grid held callee delivery
fixed; D88's 2,850 cells and D112's 1,114 both build the map as a function local, so
neither could ever contain D139. **This grid crosses the axes those rows were each found
on**, so the question it answers is not "is this row's fix complete" but "how large is the
remaining surface".

## The answer, from the run recorded below

**21,765 silent cells of 250,238 (8.70%)** — 21,763 `check-clean invalid wasm` and
**2 `compiler trap`**, which is the first program-level witness that column has ever had.
**Zero `runs but wrong value` and zero `trap_loads`** across the whole census; the grader is
proved able to fire both on demand (see *Validating the grader*), so those zeros are
readings rather than blind spots.

## The axes

| axis | levels | earned by |
|---|---|---|
| `store` | local, global, param, callres, capture | D139, D131 |
| `escope` | mod, fn, nested, lambda | `gen.py`'s scope axis |
| `declness` | byname, anon, nodecl | D112 |
| `twin` | none, exact, samearity, armtwin, late | D88/D100, D155 |
| `union` | nounion, unused, used | D88, D139 |
| `claim` | 0, 1, 2 container aliases of the same layout | D88's claimant count |
| `cont` | bare, list, listlist, list3, mapval, nestedmap, map3, forin, map_of_list, list_of_map, structfield, structfield2 | every row |
| `annpos` | none, binding, dest, retann, readsite | D155, D158 |
| `deliv` | direct, boundlocal, closurearg, structread, std, generic, calleedeliv | D157, D155 |
| `pval` | single, two, mixed, empty, nestedempty, nullfield | the `[[null]]` probe row |
| `order` | norm, rev | `genorder.py` |
| `rep` | 16 payload field types: the scalars, string, three literal-union backings, list, map, struct, union arm, nullable | the rep vocabulary |
| `annpat` | outer, none, inner, mid, all — WHICH intermediate level is annotated | **new, and it is the axis D180 turns on** |

## The design, and what it guarantees

The full cross is 217,728,000 cells. The census is a fractional design in five blocks:

| block | what it crosses | cells |
|---|---|---|
| **A** | `twin × union × claim × (store,escope)` FULLY crossed (720) × a constraint-aware pairwise covering array over the seven remaining axes (216 rows) | 150,224 |
| **B** | `cont × annpos × deliv × pval` FULLY crossed, at 3 core corners × 5 (store,escope) pairs | 28,590 |
| **C** | `rep × cont` FULLY crossed against the FULL core quartet (225) | 43,200 |
| **D** | the `annpat` axis × `cont` × `rep` × storage, with nothing nominal declared, and its `byname` control | 9,000 |
| **E** | `order` and `pval` crossed EXHAUSTIVELY against the nominal ingredients, so every cell has its exact twin | 19,224 |
| | **total** | **250,238** |

`coverage.py` re-derives the guarantee from the manifests rather than asserting it:

* **2,185 of 2,217 axis-value pairs covered.** All 32 missing pairs are structurally
  impossible and are listed by name (a local has no module-scope spelling; only the `nul`
  rep has a field that can be null; a bare binding has one slot; …).
* **225 / 225** combinations of `twin × union × claim × store`, and 720 with `escope` joined.
* **2,205 / 2,520** of `cont × annpos × deliv × pval` — the 315 absent are the nine
  impossible `(cont, pval)` pairs times the 35 `annpos × deliv` combinations.
* **192 / 192** of `rep × cont`.

Block E exists because a covering array fixes one `order` value per row, leaving only 20
one-step sibling pairs that differ in `order` alone. A marginal rate over an unpaired
population is not a reading of the axis: `order=rev` needs two reorderable declaration
lines, so its cells carry MORE nominal ingredients than `order=norm`'s, and block A's
9.9%-vs-6.7% marginal is that difference, not the axis.

## Validating the vocabulary before the grid inherits it

`mkmatrix.py` builds `rep × cont` (192 cells) in the CLEAN shape — everything declared by
name, annotated on the binding, no twin, no union, no alias. **All 192 run.** Anything that
is not `runs` there is a language limit or a harness spelling error, and the census excludes
it BY NAME rather than absorbing it. Measured limits found this way and kept out:

* `{ f: Circle }` — a struct field holding an object — is a loud emit reject once `Circle`
  is a union arm (`only i32 / boolean / string / array struct fields are supported`); a
  struct field holding a MAP of it runs, so that is the spelling the census uses.
* `(Circle | null)[]` and `{[string]: Circle | null}` inside a function are loud.
* A lambda parameter typed as a map, and `[m].map((x) => x)`, are loud.
* `type Box1 = {r: i32}[][]` is a **parse error** (`expected an expression but found
  RBRACK`); `({r: i32}[])[]` parses. This bounds the `claim` axis over list-nested
  containers with an inline-object payload — see *What the census could not reach*.
* `const _sp1: Box1 = [{ r: 0 }]` where `type Box1 = {r: i32}[]` is
  `cannot assign {r: i32}[] to '_sp1' of type Box1` — a type alias over an inline-object
  array is not assignable from its own structural type. Loud, and it bounds the same slice.

## Validating the grader

`sabcensus.py` provokes every column `gradecensus.py` can print, and reproduces its stated
counts exactly: **runs 4 / runs but wrong value 4 / trap_loads 3 / check-clean invalid wasm
3 / loud emit reject 3 / loud check reject 3**. Three of the `runs but wrong value` cells
are byte-identical to a `runs` control with a different manifest, which is what proves the
grader reads the expectation and not the output.

Two of its cells were mispredicted on the first run and the PROGRAMS, not the prediction,
were corrected — `const c = [[7]]` runs, and `type W = { f: Circle }` runs until `Circle` is
a union arm. Both are recorded in the file, because a sabotage whose stated counts it does
not reproduce is worse than none.

`compiler trap` could not be provoked from source when the sabotage was written, and the
file says so. **Block D then produced two** (D179), so the column is now proved live by a
program rather than by an injected fault. Half the discriminator was already proved in the
other direction: the three `trap_loads` cells all reach the third `vl build` stage and come
back "module written", so a build stage stuck at "no module" would have graded them
`compiler trap` and did not.

The PUBLISHED grader was re-validated against the same compiler first:
`scripts/silent-sweep/sabotage.py` → **15 wrong_value / 10 wrong_evalcount / 8 trap / 5
correct**, exactly as `REPRODUCE.md` publishes.

## Running it

    bash scripts/agent-setup.sh                     # seed must be 1,452,766 bytes at 1559d80c
    python3 scripts/silent-sweep/census/mkmatrix.py  scratch-silent/census/matrix
    JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py \
        scratch-silent/census/matrix build/vl-compiler.wasm scratch-silent/census/matrix.json
    python3 scripts/silent-sweep/census/sabcensus.py scratch-silent/census/sab
    JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py \
        scratch-silent/census/sab build/vl-compiler.wasm scratch-silent/census/sab.json

    for B in A B C D E; do
      python3 scripts/silent-sweep/census/gencensus.py scratch-silent/census/cells$B --block $B
      JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py \
          scratch-silent/census/cells$B build/vl-compiler.wasm scratch-silent/census/$B.json
    done

    python3 scripts/silent-sweep/census/coverage.py scratch-silent/census/cells{A,B,C,D,E}
    python3 scripts/silent-sweep/census/families.py  <celldir> <json> ...
    python3 scripts/silent-sweep/census/siblings.py  <celldir> <json> ...
    python3 scripts/silent-sweep/census/rescue.py    <celldir> <json> ...
    python3 scripts/silent-sweep/census/rows.py      <celldir> <json> ...

`JOBS` defaults to 4 and nothing here raises it (`vl check` peaks around 650 MB RSS). The
cell programs and result files are NOT committed — 250,238 files, ~180 MB; everything
regenerates. Total wall time at `JOBS=4` is about 35 minutes.

## Resource discipline

Four concurrent `vl` invocations, the same bound `scripts/silent-sweep/REPRODUCE.md` fixes.
`gradecensus.py` runs a third `vl build` stage ONLY when the run stage failed with a trap
marker, so the common cell costs two process spawns.

## RESULT — the axes that MOVE an outcome, and the ones that do not

`siblings.py` compares every pair of graded coordinates differing in EXACTLY ONE axis:

| axis | compared | outcome differs | rate | → silent | → loud |
|---|---|---|---|---|---|
| `cont` | 851,122 | 347,128 | 0.408 | 52,824 | 52,824 |
| `rep` | 675,570 | 262,694 | 0.389 | 29,886 | 29,886 |
| `annpat` | 36,000 | 9,528 | 0.265 | 408 | 408 |
| `pval` | 74,886 | 15,604 | 0.208 | 3,533 | 3,533 |
| `deliv` | 74,380 | 14,914 | 0.201 | 2,475 | 2,475 |
| `annpos` | 46,252 | 4,862 | 0.105 | 957 | 957 |
| `claim` | 411,562 | 42,752 | 0.104 | 6,160 | 6,160 |
| `union` | 409,866 | 39,460 | 0.096 | 10,370 | 10,370 |
| `declness` | 9,738 | 736 | 0.076 | 186 | 186 |
| `store` | 625,664 | 41,892 | 0.067 | 4,861 | 4,861 |
| `twin` | 829,908 | 46,992 | 0.057 | 18,966 | 18,966 |
| `escope` | 358,078 | 1,246 | **0.003** | 252 | 252 |
| `order` | 19,028 | **0** | **0.000** | **0** | **0** |

**`order` is INERT.** Zero outcome changes over 19,028 exactly-paired comparisons, and the
pairs are real: block E's `norm`/`rev` twins differ textually and only in the order of the
declaration block. Drop the axis from future grids.

**`escope` is all but inert** — 0.3%, and where it does move it moves between two refusals
far more often than into or out of `runs`. It is worth one level, not four.

## What the census could NOT reach

Named and counted, because a silent cap reads as "covered everything":

1. **32 axis-value pairs are structurally impossible** and are printed by `coverage.py`.
2. **`claim` × list-outermost containers × an inline-object payload** is unreachable: the
   alias spelling does not parse past one `[]` and the alias is not assignable from its own
   structural type. Both limits are LOUD, both are recorded above, and the axis is still
   covered over map, struct and bare containers (D181 is at `list_of_map`, whose alias
   spelling `{[string]: T}[]` does parse).
3. **`pval=empty` and `pval=nestedempty` at `annpos=none`** are loud check rejects
   (`cannot infer a type for 'lv1'`): an empty container needs an annotation to have a type.
   About 14,000 cells.
4. **6,896 silent coordinates have no one-step rescue inside the census.** For the ones in
   block A that is partly the fractional design — the rescuing sibling may simply not be a
   generated cell — so it is a bound on the analysis, not a property of those defects.
5. **`runs but wrong value` and `trap_loads` are zero**, but every cell here prints one
   token; a grid whose programs computed longer answers could separate a wrong value from a
   refused module in places this one cannot.
6. The census grades ONE seed. It says nothing about which fix closes what.
