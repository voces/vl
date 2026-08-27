# CENSUS RESULTS — master `1559d80c`, seed 1,452,766 bytes, 2026-08-27

Every number below is the verbatim output of the script named above it, re-runnable with
the commands in `README.md`.  Cell programs and per-cell results are not committed
(250,238 files, ~180 MB); they regenerate.

## Per block

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

## RE-GRADED 2026-08-27 on master `1e81b0f3` (seed 1,453,931) — D181's leg

The numbers above are `1559d80c`'s. **This file goes stale one-directionally**, so the whole
grid was regenerated and re-graded against master two commits later, and against the branch
that closes D181. Regenerate + re-run with the commands in `README.md`; the analysis is
`scripts/silent-sweep/d181/README.md`.

| block | cells | silent at `1559d80c` | silent at `1e81b0f3` | silent on D181's branch |
|---|---|---|---|---|
| A | 150,224 | 12,673 | 12,277 | **9,814** |
| B | 28,590 | 3,141 | 3,023 | **2,564** |
| C | 43,200 | 3,885 | 3,765 | **3,115** |
| D | 9,000 | 155 | 155 | 155 |
| E | 19,224 | 1,911 | 1,911 | **1,539** |
| **all** | **250,238** | **21,765** | **21,131** | **17,187** |

`loud check reject` is 68,258 and `loud emit reject` 52,482 on BOTH of the 2026-08-27 legs,
identical to the cell in every block — so the 3,944 cells that move do so from
`check-clean invalid wasm` to `runs`, with nothing lateral and nothing backward.

`rescue.py` re-derived on `1e81b0f3` reports the SAME family sizes as the published run —
`claim` 2,254 at the same witness (`cellsA/a002167.vl`), `claim,cont` 1,296 at
`cellsC/c039831.vl`. On the branch the `claim` family is **0** and `claim,cont` is **320**
(filed as D189, and reproducible with no alias in the program).

**TWO CAVEATS FOR ANYONE RE-RUNNING THIS FILE'S OWN INSTRUMENTS.**

1. `sabcensus.py`'s stated counts had already drifted on master: two of its three
   `check-clean invalid wasm` specimens no longer fire — `iw_d155` stopped at #1965 and
   `iw_alias` was D181 itself. Both were replaced (by the inventory's D182 and D186
   witnesses) and the file reproduces its counts exactly again. A sabotage whose stated
   counts it does not reproduce is worse than none, and that is this file's own rule.
2. Two block-D cells (D179's `compiler trap` pair) report a different MESSAGE on any two
   compilers of different sizes, because their "message" is a wasm backtrace of the compiler
   and its function indices shift. They are not a behaviour change; a message-channel diff
   over the census will always show them.
