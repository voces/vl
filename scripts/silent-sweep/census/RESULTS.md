# CENSUS RESULTS — master `1559d80c`, seed 1,452,766 bytes, 2026-08-27

Every number below is the verbatim output of the script named above it, re-runnable with
the commands in `README.md`.  Cell programs and per-cell results are not committed
(250,238 files, ~180 MB); they regenerate.

## Per block — measured at `1559d80c`, seed 1,452,766 bytes

**This table describes ONE compiler and says which.** It is now several merges behind master
(#1965, #1966, #1969, #1968, #1970 have all landed since), and that is fine — a census figure is
a fact about the tree it was measured at, and stays correct as long as it names it. What is NOT
fine is an unlabelled figure: the census MERGED as `c55269c9`, one compiler change after this
table was taken, so "the census base" named two different compilers and cost an extra seed to
disambiguate. See `README.md` §*Every census figure names the commit it was measured at*.

| block | cells | runs | loud check reject | loud emit reject | check-clean invalid wasm | compiler trap | SILENT |
|---|---|---|---|---|---|---|---|
| A | 150,224 | 60,197 | 49,715 | 27,639 | 12,673 | 0 | 12,673 (8.4%) |
| B | 28,590 | 7,963 | 9,621 | 7,865 | 3,141 | 0 | 3,141 (11.0%) |
| C | 43,200 | 22,953 | 7,200 | 9,162 | 3,885 | 0 | 3,885 (9.0%) |
| D | 9,000 | 7,069 | 832 | 944 | 153 | 2 | 155 (1.7%) |
| E | 19,224 | 8,573 | 890 | 7,850 | 1,911 | 0 | 1,911 (9.9%) |
| **all** | **250,238** | **106,755** | **68,258** | **53,460** | **21,763** | **2** | **21,765 (8.70%)** |

`runs but wrong value` = 0 and `trap_loads` = 0 across the whole census.  Both columns are
proved able to fire on demand by `sabcensus.py` (4 and 3 respectively), so these are
readings, not blind spots.

## BLOCK A's AFTER-PASS — `1559d80c` → `88f21245`, graded 2026-08-27

Block A is 60% of the census and was the one block with no after-pass: #1969 graded B/C/D/E
and its report records block A as *"still grading at hand-off"*.  This is that pass.  Method:
ONE generated cell directory, graded against THREE seeds each built from source at its own
commit and each self-verifying as a self-compilation fixed point — `1559d80c` at 1,452,766
bytes, `1e81b0f3` at 1,453,931, `88f21245` at 1,455,395.  Nothing is graded against a
working-tree `build/vl-compiler.wasm`.

**The before-pass reproduces this file's ENTIRE published table on all six columns** — all five
blocks, 250,238 cells, from seeds and cell directories regenerated from scratch (A 150,224 /
60,197 / 49,715 / 27,639 / 12,673 / 0, and B, C, D, E each exact including block D's two
compiler traps). That validates the rebuilt seed, the regenerated cells and the grader in one
measurement rather than assuming any of the three, and it is what makes the deltas below
attributable to the compiler rather than to the harness.

| | cells | runs | loud check | loud emit | check-clean invalid wasm | SILENT | rate |
|---|---|---|---|---|---|---|---|
| before `1559d80c` | 150,224 | 60,197 | 49,715 | 27,639 | 12,673 | 12,673 | 8.44% |
| after `88f21245` | 150,224 | 63,821 | 49,715 | 27,513 | 9,175 | 9,175 | **6.11%** |
| delta | 0 | **+3,624** | 0 | −126 | **−3,498** | −3,498 | −2.33pt |

### The cell-level transition matrix — `delta.py`, which is why the net is not the answer

**Per-PR, cell-matched.** The span `1559d80c` → `88f21245` covers TWO compiler merges, so the
span delta cannot name which one moved a cell. Split at `1e81b0f3`:

```
1559d80c -> 1e81b0f3   (#1965 D155 + #1966 D156)   moved 606 of 150,224
     336  check-clean invalid wasm -> runs                       (forward)
     186  loud emit reject         -> runs                       (forward)
      72  check-clean invalid wasm -> loud emit reject           (forward)
      12  loud emit reject         -> check-clean invalid wasm   <== BACKWARD

1e81b0f3 -> 88f21245   (#1969 D203-D206 ALONE)      moved 3,102 of 150,224
    3102  check-clean invalid wasm -> runs                       (forward)
#1969 backward: 0.  #1969 into-silent: 0.  Every cell it moved, it moved forward.
```

**#1969 is clean on block A** — the same shape its own report claims for B/C/D/E, now measured
on the block that was outstanding. The 12 backward cells belong to the earlier span, and graded
against a `c55269c9` seed (1,453,528 bytes, #1965 in and #1966 not) they are still LOUD, so
#1965 is cleared and #1966 owns them.

A per-class histogram is a NET.  A block can hold its silent total exactly while cells fall
out of `runs` and different cells fall in.  `delta.py` matches cells BY NAME across the two
gradings, so the unit is the cell:

```
unchanged: 146516 of 150224 (97.53%)   moved: 3708
   3438  check-clean invalid wasm -> runs                       (forward)
    186  loud emit reject         -> runs                       (forward)
     72  check-clean invalid wasm -> loud emit reject           (forward)
     12  loud emit reject         -> check-clean invalid wasm   <== BACKWARD
```

**N cells moved backward (`runs` before, NOT `runs` after): 0.**  No working program was lost.

**N cells moved INTO a silent class: 12**, and they are the finding.  They are filed as **D211**
in `docs/internals/silent-class-inventory.md`.  Three things about them:

* They are a full **2 × 3 × 2 cross** — `store ∈ {global, callres}` × `twin ∈ {none, samearity,
  armtwin}` × `union ∈ {unused, used}` — with nine axes held constant (`cont=nestedmap`,
  `annpos=dest`, `pval=nullfield`, `rep=nul`, `escope=mod`, `declness=byname`, `claim=0`,
  `deliv=direct`, `order=norm`).  A loud `emitProgram: ref valtype with no interned shape`
  became a check-clean module the engine rejects.
* **They belong to #1966 (`1e81b0f3`), not #1969.**  Graded against a third seed they are
  already invalid wasm one commit before #1969's rung existed, with a byte-identical validator
  message.  The witness is textbook D203 shape — an un-annotated `Map()` with a declared
  destination — so the obvious attribution is the wrong one, and only the seed ladder separates
  them.
* **#1966 never had a census after-pass of its own.**  #1969's B/C/D/E figures are measured
  from `1e81b0f3`, not from this file's base: its report's before-silent for those four blocks
  is 8,854 where this file's table gives 9,092.  That 238-cell gap IS #1966's effect on
  B/C/D/E, and it was never graded in either direction.  Whether it too contains a loud→silent
  move is open — this pass measured block A, not B/C/D/E.

### Grader validation, re-run against the compilers actually measured with

`scripts/silent-sweep/sabotage.py` reproduces its published counts exactly on the `88f21245`
seed: **15 wrong_value / 10 wrong_evalcount / 8 trap / 5 correct**.

`sabcensus.py` as it stood at `1559d80c` reproduced its published counts exactly there, and read
**2 invalid-wasm / 5 runs** from `c55269c9` onward: its `iw_d155` cell was fixed by **#1965
(D155)**, the row it was modelled on.  #1970 has since refreshed the specimens, and the CURRENT
file reproduces its predicted **4 / 4 / 3 / 3 / 3 / 3 exactly on `16d5c6e7`** — re-run here, not
inherited.  Caveat 1 below tracks the full churn.

The two columns the census's zeros actually depend on — `runs but wrong value` (4) and
`trap_loads` (3) — fired unchanged on **all six** seeds tested (1,452,766 / 1,453,528 /
1,453,931 / 1,455,395 / 1,456,293 / 1,456,371), so the grader's discriminating power is stable
even while the perishable REFUSAL columns move.

`delta.py`'s backward detector was shown to FIRE, not just to report zero: inverting the two
gradings turns the same `iw_d155` cell into a `runs` LOST.

## THE WHOLE CENSUS, PER PR — and the base that named two compilers

Extending the after-pass to B/C/D/E (100,014 cells) against the census's MERGE base makes
every merged change since the census gradeable separately.  **`c55269c9` is that base, not
`1559d80c`**: the census published its table against `1559d80c` and merged as `c55269c9`, with
**#1965 (D155) landing in between and editing `emit_collect.vl`**.  So the per-block table at
the top of this file never described the tree the census merged into — block B alone differs by
+129 `runs` and −112 silent between those two commits.  Every later report that says "against
the census base" inherits that ambiguity, and pinning the middle rung is what separates #1965
from #1966.

| span | who | block A moved | A: `runs` lost | **A: → silent** | B/C/D/E moved | BCDE lost | BCDE → silent |
|---|---|---|---|---|---|---|---|
| `1559d80c` → `c55269c9` | #1965 D155 | 222 | 0 | 0 | 134 | 0 | 0 |
| `c55269c9` → `1e81b0f3` | **#1966 D156** | 384 | 0 | **12** ← D211 | 966 | 0 | 0 |
| `1e81b0f3` → `88f21245` | #1969 D203–D206 | 3,102 | 0 | 0 | 2,644 | 0 | 0 |
| | **all three** | **3,708** | **0** | **12** | **3,744** | **0** | **0** |

**These spans are between FIXED commits, so they are historical and are NOT invalidated by later
merges** — #1968 and #1970 have landed since and change nothing above. Only a LIVENESS claim
("D211 is still silent") is about a moving head; that one is re-run per head and is re-confirmed
at `16d5c6e7` (seed 1,456,371), where all 12 cells are still `check-clean invalid wasm` with a
byte-identical validator message despite #1970 moving 4,482 census cells forward.

Every figure above is CELL-MATCHED — `delta.py` over two gradings of ONE generated cell
directory — not a difference of two per-class histograms.  The distinction is not academic:
block A's #1966 row shows 0 `runs` lost and 12 cells into a silent class simultaneously, and
its loud-emit column moved by −180 (168 out to `runs`, 72 in from invalid wasm, 12 out to
invalid wasm), so the 12 are arithmetically invisible in any column delta.

**#1966's whole-census effect is 12 backward cells, and all 12 are in block A.**  B/C/D/E are
clean in both directions for it (966 cells moved: 840 `loud emit reject → runs`, 121
`invalid wasm → runs`, 5 `invalid wasm → loud emit reject`).  Block D moved nothing at all.
That is exactly why block A mattered — it is 60% of the census and the only block carrying the
`cont=nestedmap × annpos=dest × pval=nullfield × rep=nul` corner D211 lives in.

**#1965 is clean everywhere** (222 cells in block A, 134 in B — C, D and E move ZERO cells
for it — all forward), which is what clears it of
D211 over the whole block rather than over the 12-cell subset alone.  That distinction had to be
measured: without block A graded at `c55269c9`, a cell #1965 moved backward and #1966 moved
forward again would have been invisible inside the combined `1559d80c` → `1e81b0f3` span — the
same net-hides-the-move error, one level up.  There are none.

**INDEPENDENTLY CROSS-VALIDATED AGAINST #1970.**  That PR re-graded the whole census for D181
and published its own `1e81b0f3` column.  Two separately built seeds, two separately generated
cell directories, two runs — and every block agrees exactly:

| silent at `1e81b0f3` | A | B | C | D | E | total |
|---|---|---|---|---|---|---|
| #1970's table | 12,277 | 3,023 | 3,765 | 155 | 1,911 | 21,131 |
| this after-pass | 12,277 | 3,023 | 3,765 | 155 | 1,911 | 21,131 |

Agreement over a population that COULD have disagreed is worth more than either run alone: the
two used different seed files on disk and different generated cells, so a harness-side error
would have had to hit both identically.

**#1969's published figures reproduce EXACTLY**, independently, from seeds built here:
2,644 cells moved across B/C/D/E (898 + 1,169 + 88 + 489), every one `check-clean invalid wasm →
runs`, silent **8,854 → 6,210**, 0 backward, 0 into silent — and block A adds 3,102 more, also
all forward.  #1969 measured from `1e81b0f3`, which genuinely WAS its merge base; its report is
accurate and its "0 into a silent class" now holds over the whole census rather than four
blocks of it.

## coverage.py — the guarantee, re-derived from the generated manifests

```
cells generated across 5 blocks: 250238

== levels present per axis ==
  store      5  callres capture global local param
  escope     4  fn lambda mod nested
  declness   3  anon byname nodecl
  twin       5  armtwin exact late none samearity
  union      3  nounion unused used
  claim      3  0 1 2
  cont      12  bare forin list list3 list_of_map listlist map3 map_of_list mapval nestedmap structfield structfield2
  annpos     5  binding dest none readsite retann
  deliv      7  boundlocal calleedeliv closurearg direct generic std structread
  pval       6  empty mixed nestedempty nullfield single two
  order      2  norm rev
  rep       16  arm bool f32 f64 f64lit i32 i64 list map nul numlit obj scalar str string strlit

== pairwise coverage over the levels actually present ==
  covered 2185 / 2217 pairs   (32 missing)
  missing pairs:
     store=capture x escope=fn
     store=capture x escope=mod
     store=local x escope=mod
     store=param x escope=mod
     declness=anon x rep=scalar
     declness=anon x rep=string
     declness=byname x rep=scalar
     declness=byname x rep=string
     cont=bare x pval=empty
     cont=bare x pval=mixed
     cont=bare x pval=nestedempty
     cont=bare x pval=two
     cont=forin x pval=nestedempty
     cont=list x pval=nestedempty
     cont=mapval x pval=nestedempty
     cont=structfield x pval=empty
     cont=structfield2 x pval=empty
     pval=nullfield x rep=arm
     pval=nullfield x rep=bool
     pval=nullfield x rep=f32
     pval=nullfield x rep=f64
     pval=nullfield x rep=f64lit
     pval=nullfield x rep=i32
     pval=nullfield x rep=i64
     pval=nullfield x rep=list
     pval=nullfield x rep=map
     pval=nullfield x rep=numlit
     pval=nullfield x rep=obj
     pval=nullfield x rep=scalar
     pval=nullfield x rep=str
     pval=nullfield x rep=string
     pval=nullfield x rep=strlit

== full crossing of twin x union x claim x store ==
  225 / 225 combinations present

== full crossing of twin x union x claim x store x escope ==
  720 combinations present (20 of the 5x4 store x escope pairs have no spelling for 4 of them, so the ceiling is 720)

== full crossing of cont x annpos x deliv x pval ==
  2205 / 2520 combinations present

== full crossing of rep x cont ==
  192 / 192 combinations present
```

## siblings.py — which axes move an outcome

```
distinct coordinates: 247427 (from 250238 graded cells)
levels seen per axis: store=5, escope=4, declness=3, twin=5, union=3, claim=3, cont=12, annpos=5, deliv=7, pval=6, order=2, rep=16, annpat=5

== axis mobility: ordered pairs of coordinates differing in ONE axis ==
axis         compared  outcome-≠     rate    →silent    →loud
cont           851122     347128    0.408      52824    52824
rep            675570     262694    0.389      29886    29886
annpat          36000       9528    0.265        408      408
pval            74886      15604    0.208       3533     3533
deliv           74380      14914    0.201       2475     2475
annpos          46252       4862    0.105        957      957
claim          411562      42752    0.104       6160     6160
union          409866      39460    0.096      10370    10370
declness         9738        736    0.076        186      186
store          625664      41892    0.067       4861     4861
twin           829908      46992    0.057      18966    18966
escope         358078       1246    0.003        252      252
order           19028          0    0.000          0        0

== per-axis transition detail (top 6 each) ==
```

## rescue.py — silent cells grouped by which axis change rescues them (top 24)

```
silent coordinates: 21436 of 247427

== silent cells grouped by WHICH AXES can rescue them ==
rescuing axes                                     cells   example witness
claim                                              2254   scratch-silent/census/cellsA/a002167.vl (285 bytes)
      rescued by: claim=0 x2254
      constant  : cont=list_of_map, annpat=outer
cont                                               1992   scratch-silent/census/cellsB/b024546.vl (226 bytes)
      rescued by: cont=forin x893, cont=nestedmap x704, cont=mapval x687, cont=bare x671, cont=list x658, cont=map_of_list x505, cont=map3 x367, cont=structfield2 x351
      constant  : annpat=outer
union                                              1896   scratch-silent/census/cellsA/a038675.vl (233 bytes)
      rescued by: union=nounion x1896
      constant  : declness=byname, annpat=outer
claim,cont                                         1296   scratch-silent/census/cellsC/c039831.vl (282 bytes)
      rescued by: claim=0 x1296, cont=map_of_list x1296, cont=forin x1144, cont=list x1144, cont=mapval x1144, cont=nestedmap x1016, cont=map3 x984, cont=listlist x976
      constant  : cont=list_of_map, annpos=binding, deliv=direct, annpat=outer
twin,union                                         1252   scratch-silent/census/cellsA/a038540.vl (388 bytes)
      rescued by: twin=armtwin x1252, twin=none x1252, twin=samearity x1252, union=nounion x1252
      constant  : declness=byname, annpat=outer
cont,union                                          888   scratch-silent/census/cellsC/c002311.vl (305 bytes)
      rescued by: union=nounion x888, cont=list x888, cont=bare x838, cont=forin x792, cont=mapval x790, cont=map_of_list x510, cont=map3 x302, cont=nestedmap x302
      constant  : declness=byname, order=norm, annpat=outer
cont,twin,union                                     476   scratch-silent/census/cellsC/c000511.vl (348 bytes)
      rescued by: twin=armtwin x476, twin=none x476, twin=samearity x476, union=nounion x476, cont=bare x476, cont=forin x476, cont=list x476, cont=mapval x476
      constant  : declness=byname, annpos=binding, deliv=direct, pval=single, order=norm, annpat=outer
cont,pval,union                                     471   scratch-silent/census/cellsC/c002310.vl (311 bytes)
      rescued by: union=nounion x471, cont=list x471, pval=nestedempty x471, cont=forin x287, cont=mapval x287, cont=map_of_list x271, pval=empty x184, cont=bare x96
      constant  : store=local, escope=fn, declness=byname, annpos=binding, deliv=direct, annpat=outer
claim,cont,rep,twin,union                           368   scratch-silent/census/cellsC/c001191.vl (401 bytes)
      rescued by: twin=armtwin x368, twin=none x368, twin=samearity x368, union=nounion x368, claim=0 x368, cont=bare x368, cont=forin x368, cont=list x368
      constant  : declness=byname, annpos=binding, deliv=direct, pval=single, order=norm, annpat=outer
cont,rep,union                                      280   scratch-silent/census/cellsC/c030886.vl (377 bytes)
      rescued by: union=nounion x280, cont=bare x280, cont=forin x280, cont=list x280, cont=mapval x280, rep=map x280, rep=bool x200, rep=f64 x200
      constant  : declness=byname, annpos=binding, deliv=direct, pval=single, order=norm, rep=obj, annpat=outer
store                                               269   scratch-silent/census/cellsA/a034229.vl (278 bytes)
      rescued by: store=global x239, store=local x239, store=callres x75, store=capture x30
      constant  : annpat=outer
annpos                                              265   scratch-silent/census/cellsB/b010776.vl (240 bytes)
      rescued by: annpos=none x202, annpos=binding x63, annpos=readsite x54, annpos=dest x7
      constant  : annpat=outer
cont,rep                                            255   scratch-silent/census/cellsC/c034651.vl (331 bytes)
      rescued by: cont=bare x255, cont=forin x255, cont=list x255, cont=listlist x255, cont=map_of_list x255, cont=mapval x255, rep=bool x255, rep=f64 x255
      constant  : declness=byname, union=nounion, annpos=binding, deliv=direct, pval=single, order=norm, rep=arm, annpat=outer
cont,pval,rep                                       245   scratch-silent/census/cellsC/c034695.vl (362 bytes)
      rescued by: cont=forin x245, cont=list x245, cont=listlist x245, cont=map_of_list x245, cont=mapval x245, pval=nestedempty x245, rep=i32 x245, rep=str x245
      constant  : store=local, escope=fn, declness=byname, union=nounion, annpos=binding, deliv=direct, rep=arm, annpat=outer
store,twin,union                                    240   scratch-silent/census/cellsA/a040104.vl (303 bytes)
      rescued by: twin=armtwin x240, twin=none x240, twin=samearity x240, union=nounion x240, store=local x216, store=global x48, store=callres x24, store=capture x16
      constant  : declness=byname, annpat=outer
claim,cont,pval,twin,union                          239   scratch-silent/census/cellsC/c001860.vl (338 bytes)
      rescued by: twin=armtwin x239, twin=none x239, twin=samearity x239, union=nounion x239, cont=forin x239, cont=list x239, cont=mapval x239, pval=nestedempty x239
      constant  : store=local, escope=fn, declness=byname, annpos=binding, deliv=direct, annpat=outer
claim,twin,union                                    188   scratch-silent/census/cellsA/a038597.vl (309 bytes)
      rescued by: twin=armtwin x188, twin=none x188, twin=samearity x188, union=nounion x188, claim=0 x128, claim=1 x60, claim=2 x60
      constant  : declness=byname, deliv=direct, pval=mixed, order=rev, annpat=outer
cont,deliv                                          178   scratch-silent/census/cellsB/b008886.vl (218 bytes)
      rescued by: deliv=closurearg x85, cont=mapval x75, cont=bare x69, deliv=direct x63, cont=map3 x60, cont=nestedmap x46, cont=list x46, deliv=std x45
      constant  : annpat=outer
twin                                                156   scratch-silent/census/cellsA/a031791.vl (297 bytes)
      rescued by: twin=armtwin x156, twin=samearity x156, twin=none x130
      constant  : declness=nodecl, cont=map_of_list, annpos=none, deliv=direct, pval=mixed, order=rev, rep=f64lit, annpat=outer
cont,pval,twin,union                                144   scratch-silent/census/cellsC/c000510.vl (352 bytes)
      rescued by: twin=armtwin x144, twin=none x144, twin=samearity x144, union=nounion x144, cont=forin x144, cont=list x144, cont=mapval x144, pval=empty x144
      constant  : store=local, escope=fn, declness=byname, cont=listlist, annpos=binding, deliv=direct, annpat=outer
claim,cont,twin,union                               132   scratch-silent/census/cellsC/c001861.vl (332 bytes)
      rescued by: twin=armtwin x132, twin=none x132, twin=samearity x132, union=nounion x132, claim=1 x132, claim=2 x132, cont=bare x132, cont=forin x132
      constant  : declness=byname, claim=0, cont=map_of_list, annpos=binding, deliv=direct, pval=single, order=norm, annpat=outer
annpat,cont,rep                                     132   scratch-silent/census/cellsD/d006226.vl (222 bytes)
      rescued by: cont=bare x132, rep=bool x132, rep=f64 x132, rep=i32 x132, rep=list x132, rep=map x132, rep=obj x132, rep=str x132
      constant  : twin=none, union=nounion, claim=0, annpos=binding, deliv=direct, pval=single, order=norm
cont,pval                                           123   scratch-silent/census/cellsB/b024545.vl (259 bytes)
      rescued by: cont=bare x123, cont=forin x123, cont=list x123, cont=listlist x123, cont=map_of_list x123, cont=mapval x123, pval=nestedempty x123
      constant  : store=local, escope=fn, declness=byname, union=nounion, annpos=binding, deliv=direct, pval=nullfield, rep=nul, annpat=outer
annpos,cont                                         115   scratch-silent/census/cellsB/b009666.vl (219 bytes)
      rescued by: annpos=none x66, cont=bare x54, annpos=binding x51, cont=mapval x39, annpos=readsite x30, cont=map3 x22, cont=forin x18, cont=map_of_list x11
```

## rows.py — what the census says about the four open rows

```
row / control                                    silent    cells    rate
D155 arm-valued map from a CALL                     106     1934    5.5%
      classes: check-clean invalid wasm=106
      constant across its silent cells: store=callres, cont=mapval
D156 NESTED arm-valued map                         3326    20112   16.5%
      classes: check-clean invalid wasm=3326
      constant across its silent cells: (nothing)
D157 a std or generic CONDUIT                      1768    24732    7.1%
      classes: check-clean invalid wasm=1768
      constant across its silent cells: (nothing)
D158 the annotation is at the READ site             492     7357    6.7%
      classes: check-clean invalid wasm=492
      constant across its silent cells: annpos=readsite
[control] no twin anywhere                         2952    56204    5.3%
      classes: check-clean invalid wasm=2950, compiler trap=2
      constant across its silent cells: twin=none
[control] no union anywhere                        5490    82748    6.6%
      classes: check-clean invalid wasm=5488, compiler trap=2
      constant across its silent cells: union=nounion
[control] no twin AND no union AND no claim         772    18268    4.2%
      classes: check-clean invalid wasm=770, compiler trap=2
      constant across its silent cells: twin=none, union=nounion, claim=0, order=norm
[control] NO type declaration of the payload at all     3452    81395    4.2%
      classes: check-clean invalid wasm=3450, compiler trap=2
      constant across its silent cells: declness=nodecl
[control] no twin, no union, no claim, no declaration      120     7105    1.7%
      classes: check-clean invalid wasm=118, compiler trap=2
      constant across its silent cells: declness=nodecl, twin=none, union=nounion, claim=0, order=norm
```

## families.py — silent rate by container x nominal ingredients (top 30)

```
cont           twin  union  claim  decl    silent    total   rate
list_of_map    twin  union  claim  decl      2027     6274  32.3%
nestedmap      twin  union  claim  decl      1479     6530  22.6%
map3           twin  union  claim  decl      1431     5998  23.9%
structfield2   twin  union  claim  decl      1326     5198  25.5%
structfield    twin  union  claim  decl      1250     4932  25.3%
list_of_map    twin  -      claim  decl      1160     2432  47.7%
list_of_map    twin  union  claim  -          948     2386  39.7%
map_of_list    twin  union  claim  decl       884     4974  17.8%
listlist       twin  union  claim  decl       665     5998  11.1%
map_of_list    twin  union  -      decl       560     1792  31.2%
structfield2   twin  union  -      decl       492     1984  24.8%
structfield    twin  union  -      decl       452     1856  24.4%
list_of_map    twin  -      claim  -          384      848  45.3%
listlist       twin  union  -      decl       376     2304  16.3%
structfield    twin  -      claim  decl       344     1856  18.5%
map3           twin  union  -      decl       340     2304  14.8%
structfield2   twin  -      claim  decl       328     1984  16.5%
nestedmap      twin  union  -      decl       328     2560  12.8%
list_of_map    -     -      claim  decl       290      608  47.7%
forin          twin  union  claim  decl       266     5198   5.1%
mapval         twin  union  claim  -          256     1970  13.0%
list_of_map    -     union  claim  decl       244     1216  20.1%
nestedmap      twin  -      claim  decl       216     2560   8.4%
map3           twin  -      claim  decl       216     2304   9.4%
list_of_map    twin  union  -      decl       212     2432   8.7%
mapval         twin  union  claim  decl       205     6212   3.3%
list_of_map    -     union  claim  -          192      424  45.3%
forin          twin  union  claim  -          192     2728   7.0%
structfield    twin  -      -      decl       172      928  18.5%
bare           twin  union  claim  decl       171     4174   4.1%
structfield2   twin  -      -      decl       164      992  16.5%
```

---

## RE-GRADED 2026-08-27 on merged master `e04b1567` (seed 1,456,293) — D181's leg

The numbers above are `1559d80c`'s. **This file goes stale one-directionally**, so the whole
grid was regenerated and re-graded against master three commits later, and against the branch
that closes D181. Regenerate + re-run with the commands in `README.md`; the analysis is
`scripts/silent-sweep/d181/README.md`.

| block | cells | silent at `1559d80c` | at `1e81b0f3` | at `e04b1567` | on D181's branch |
|---|---|---|---|---|---|
| A | 150,224 | 12,673 | 12,277 | 8,983 | **6,520** |
| B | 28,590 | 3,141 | 3,023 | 2,115 | **1,604** |
| C | 43,200 | 3,885 | 3,765 | 2,596 | **1,616** |
| D | 9,000 | 155 | 155 | 67 | 67 |
| E | 19,224 | 1,911 | 1,911 | 1,422 | **894** |
| **all** | **250,238** | **21,765** | **21,131** | **15,183** | **10,701** |

`loud check reject` is 68,258 and `loud emit reject` 52,190 on BOTH `e04b1567` legs,
identical to the cell in every block — so the 4,482 cells that move do so from
`check-clean invalid wasm` to `runs`, with nothing lateral and nothing backward.
`runs but wrong value` and `trap_loads` are 0 on both; `compiler trap` is 2 on both (D179).

**DO NOT QUOTE A FAMILY SIZE FROM THIS FILE — RE-DERIVE IT.** `rescue.py`'s families moved
under every landing this week, in both directions, because the family key is the SET of axes
that rescue a cell and closing one axis moves cells BETWEEN families:

| family | `1559d80c` | `1e81b0f3` | `e04b1567` |
|---|---|---|---|
| `claim` | 2,254 | 2,254 | 2,254 |
| `cont` | 1,992 | 2,032 | 1,982 |
| `union` | 1,896 | 1,518 | 1,084 |
| `claim,cont` | 1,296 | 1,296 | 1,430 |

On D181's branch the `claim` family is **0** and `claim,cont` is **0**.

**THREE CAVEATS FOR ANYONE RE-RUNNING THIS FILE'S OWN INSTRUMENTS.**

1. `sabcensus.py`'s `check-clean invalid wasm` column is PERISHABLE and lost four specimens
   in one day: `iw_d155` at #1965, `iw_alias` at D181, and the two chosen to replace those —
   D182's and D186's witnesses — at #1969, before D181's branch could merge. It now carries
   D180's and D183's, and its own header says re-checking them is the maintenance instruction.
2. Two block-D cells (D179's `compiler trap` pair) report a different MESSAGE on any two
   compilers of different sizes, because their "message" is a wasm backtrace of the compiler
   and its function indices shift. They are not a behaviour change; a message-channel diff
   over the census will always show them.
3. `scripts/mono-tyaram-grid.sh` reported 157 OK / 104 REJECT once and 156 / 105 on every
   later run of the same byte-identical seed. `vl --compiler X` caches its Cranelift image in
   a `.cwasm` sidecar beside X, and a cold fan-out races to write it; prewarm serially before
   any parallel grading, which is what `scripts/silent-sweep/d181/twin181.py` does and why.
