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

> **`sabcensus.py`'s `check-clean invalid wasm` column is PERISHABLE — a specimen chosen to model
> a live defect stops modelling it the day that defect closes.** Measured: the file as it stood
> at `1559d80c` reproduced 3 invalid-wasm / 4 runs there, and **2 / 5** from `c55269c9` onward,
> because its `iw_d155` cell was fixed by **#1965 (D155)** — the very row it was modelled on.
> #1970 refreshed the specimens; the CURRENT file reproduces its predicted **4 / 4 / 3 / 3 / 3 /
> 3 exactly on `16d5c6e7`** (re-run 2026-08-27). `RESULTS.md`'s caveat 1 tracks the full
> churn — four specimens lost in one day.
>
> The lesson that survives each refresh: **the two columns the census's zeros actually rest on,
> `runs but wrong value` and `trap_loads`, fired unchanged on every seed tested** (1,452,766 /
> 1,453,528 / 1,453,931 / 1,455,395 / 1,456,293 / 1,456,371), so the grader's discriminating
> power is stable even while the REFUSAL columns move. Quote a sabotage count with the seed it
> came from, or it is not a count.

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

## Grading a MERGED change — the after-pass protocol (`delta.py`)

An after-pass asks a different question from the census itself: not *how large is the surface*
but *did this change move anything the wrong way*. Two rules, both learned by getting them
wrong:

**Grade COMMITS, never a working tree.** Build one seed per commit from that commit's own
`compiler/*.vl` and let `refresh-compiler.sh --prove-fixpoint` prove each is a self-compilation
fixed point — the byte size then IDENTIFIES the commit instead of being asserted about it. A
shared checkout's `build/vl-compiler.wasm` is refreshed after every merge, so an agent grading
against it mid-session reads unrelated churn as a regression. Restoring the tree afterwards has
a trap of its own: `git checkout <sha> -- compiler/` STAGES those files, so it needs a
`git reset -- compiler/` and a `cmp` of the seed before anything else is believed.

**Generate the cells ONCE and grade that one directory against every seed.** Two directories
generated at two commits are two populations, and a per-cell diff across them is meaningless.
`delta.py` refuses to paper over this: it matches cells by name and prints a POPULATION
MISMATCH line if either side has a cell the other lacks.

    for S in <sha1> <sha2>; do ... build seed from that commit ... ; done
    python3 scripts/silent-sweep/census/gencensus.py scratch-silent/census/cellsA --block A
    JOBS=4 python3 .../gradecensus.py scratch-silent/census/cellsA seed-<sha1>.wasm before.json
    JOBS=4 python3 .../gradecensus.py scratch-silent/census/cellsA seed-<sha2>.wasm after.json
    python3 scripts/silent-sweep/census/delta.py scratch-silent/census/cellsA before.json after.json

**Read the transition matrix, not the two histograms.** A per-class count is a NET: a block can
hold its silent total exactly while cells fall out of `runs` and different cells fall in.
`delta.py` leads with the two numbers a merged change can be invalidated by — `runs` LOST and
moved INTO a silent class — and only then prints the matrix. Block A's own after-pass is why the
second number is reported separately: it lost **0** `runs` and still moved **12** cells from a
loud emit reject into check-clean invalid wasm, which the histograms hid entirely (the loud
column moved by −126, a net of 186 out and 72 in).

**Prewarm the seed's `.cwasm` sidecar before any parallel fan-out.** `vl --compiler X` caches a
Cranelift image beside `X`, and a cold parallel start races to write it (`RESULTS.md` caveat 3,
where it cost `mono-tyaram-grid.sh` a reproducible count). Grade a handful of cells serially
against a freshly built seed before opening it to `JOBS=4`. The after-pass here was warm by
accident rather than design — every seed had been used by a small serial grade first — and the
evidence it did not bite is that all five blocks reproduced the published table exactly; the
12-cell backward set was additionally re-graded at `JOBS=1` and agreed with the parallel run.

**A detector that has only ever printed zero is not known to work.** Inverting the two gradings
turns every forward move into a backward one, which is a free way to watch the backward column
fire before trusting it.

**Attribute to a COMMIT, not to a span.** Two merges between the census base and master means a
delta over the span cannot name which one moved a cell — and the shape of a defect is not
evidence. Block A's 12 backward cells look exactly like the row #1969 fixed and belong to #1966;
the seed ladder settled it in twelve `vl` invocations, because the backward set can be copied
into its own tiny cell directory (with its manifest subsetted) rather than re-grading 150,224
cells. **Pin the intermediate rungs**: "the census's base" named two different compilers here —
it PUBLISHED against `1559d80c` and MERGED as `c55269c9`, with #1965 in between — and without
the middle seed the 12 cells were equally attributable to #1965.

### EVERY CENSUS FIGURE NAMES THE COMMIT IT WAS MEASURED AT — IN THE DOCUMENT

**This is the root cause of the whole base-ambiguity finding, so it is a rule and not a
remark.** A census number is a fact about ONE compiler. Written without its commit it silently
becomes a fact about "the census", which readers then resolve to whatever master happens to be —
and the two are the same sentence.

`RESULTS.md` published its table against `1559d80c` and the census MERGED as `c55269c9`, one
compiler change later (#1965). Nothing in the document said so, so four later PRs each measured
"against the census base" and at least two different compilers answered to that phrase. It cost
a whole extra seed to work out that D211 belonged to #1966 rather than #1965.

Concretely:

* **Every table gets the commit AND the seed byte size in its own heading or caption**, not only
  in the commit message that introduced it. A commit message is not readable from the table.
* **The seed size is the check on the commit name**, because it is reproducible: build from that
  commit's source, let `refresh-compiler.sh --prove-fixpoint` prove it self-compiles, and the
  size then IDENTIFIES the tree rather than being asserted about it. Five seeds are pinned this
  way in `RESULTS.md`; each was confirmed by rebuilding, not by trusting a filename.
* **A figure whose commit is unknown is not stale, it is unusable** — there is no way to tell
  which of the two failure modes it is in. Prefer deleting it to leaving it unlabelled.
* **The table goes stale the moment the next compiler change merges, and that is FINE** as long
  as it says which tree it describes. `RESULTS.md`'s per-block table now describes a compiler
  four merges back (#1965, #1966, #1969, #1968, #1970); it is still correct, because it names
  `1559d80c`. What was never correct was the reader's ability to know that.

The same rule holds for a defect ROW: an attribution span between two named commits is
historical and never needs re-deriving, but a LIVENESS claim ("still live on X") is about a
moving head and must name it and be re-run. D211 separates the two explicitly for that reason.

### THE STANDING REQUIREMENT

**A change to the emit / rep lowering path re-grades the census cell-matched against its MERGE
BASE, and reports two numbers explicitly: `runs → not-runs` and `→ silent`.** Not histogram
deltas. Block A's own after-pass is the argument: it lost 0 `runs` and still moved 12 cells from
a loud emit reject into check-clean invalid wasm, and the per-class columns could not show it —
the loud-emit column moved by −126, which is 186 cells out and 72 cells in, and the 12 are
arithmetically invisible inside that net. A column delta answers "how many cells are in each
class"; only a cell-matched matrix answers "did any individual cell get worse".

This is what three merged PRs missed. #1952, #1954 and #1966 each reported "0 backward" that was
TRUE of the grids they ran and silent about the wider population, because a per-row grid holds
constant the axes it was not chasing.

**Why it is NOT a `deno task test` gate, and why sampling cannot rescue it.** The full run is
250,238 cells and ~35 minutes at `JOBS=4` — too slow to require on every PR, and a gate nobody
can afford to run gets bypassed rather than obeyed. The tempting escape is to grade a random
subset, and the arithmetic kills it. To catch a family of size *k* in a block of 150,224 with
95% confidence you must grade `1 − 0.05^(1/k)` of it:

| family size | sample needed for 95% | for 99% |
|---|---|---|
| 1 cell | **95.0%** | 99.0% |
| 3 cells | 63.2% | 78.5% |
| **12 cells (D211)** | **22.1%** | 31.9% |
| 72 cells | 4.1% | 6.2% |

The families this instrument exists to find are small — D211 is 12 cells, 0.008% of block A — so
any sample cheap enough to be worth taking is too small to see them.

> ### CORRECTION — "there is no cheap sufficient subset" was WRONG, and it cost 35 minutes a merge
>
> That is what this section used to conclude, and the conclusion does not follow from the
> arithmetic above it. The table proves a **random sample** cannot see a small family. It says
> nothing about a subset chosen with knowledge of which cells are alike, and the difference is
> the whole game: D211's 12 cells are not twelve chances to get lucky, they are **one
> behavioural class**, and one representative of that class finds it with certainty.
>
> Measured over the 19 graded snapshots this directory has accumulated: block A's 150,224
> programs produce only **212 distinct answers** and carry **4.09 bits** of entropy each — the
> whole block is about **75 KiB** of signal, with `runs` alone accounting for 60,197 cells.
> Collapse cells that no compiler in the history ever separated and block A becomes **343**
> classes; the full census becomes **1,477 (99.41% redundant, 169×)**. Block A has **zero
> singletons** — not one program behaves unlike every other.
>
> `scripts/silent-sweep/distilled/` is that collapse, and it covers **2,699 of 2,699**
> transition events across every snapshot pair (938 loud→silent, 856 runs→not-runs), with
> leave-one-out over 17 held-out compilers missing **0 of 1,468** transition kinds. It runs in
> **~8 seconds** and is now gate 6.
>
> So the census is a **discovery** instrument again, not a merge gate. Run it to measure a new
> population; re-distil afterwards.

The full run remains the honest option when the question is *how many* cells a change moved,
which a representative cannot answer — that is a reporting number, not a gate. Filing it as a
mandatory pre-merge step for every emit/rep change was the error, not the instrument.

**The cheap thing that IS worth doing per-PR** is the subset check after the fact: once a full
run has named a backward set, that set copies into its own cell directory and re-grades against
any new seed in seconds (12 cells, ~10 `vl` invocations). Use it to answer "is D211 still live?"
without re-running 150,224 cells — it is how this row was confirmed live on `e04b1567`.

**The named sets live here.** A per-row grid works the same way once it has named its movers:
`d243-moved.json` is the 79 cells D243/D244/D200's landing moved (every one `-> runs`, so a
later seed that does not run one of them has LOST it), materialised by
`scripts/silent-sweep/d243/mkset.py` and graded by `gradecensus.py` like any other block in
~158 invocations. A named set is a list of COORDINATES the generator reproduces, never a copy
of its output — `mkset.py` re-checks each name against the grid's own manifest and refuses if
the generator has changed under it, which is the drift a committed copy would hide.

**A named set is not the after-pass and does not stand in for it.** It answers "did the cells
this change fixed stay fixed", which is the forward direction; the after-pass answers "did any
cell get worse", over a population the row's own grid does not contain.

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
