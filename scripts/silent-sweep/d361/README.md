# d361 — the spelling census block E cannot reach

D361's witness and the census cell it is a respelling of differ by one word. Every block-E
read is an ELEMENT read (`(gN[0]).r`), and at `cont=map_of_list × pval=mixed` that read hits
`armRecvHoldsBareArm`'s ref-list-element decline, so the family grades a LOUD emit reject
there. Bind the element first — `const e0 = gN[0]`, then `e0.r` — and the decline never
fires, the module is written, and the disagreement the list literal minted reaches the
engine instead: `vl check` rc 0 and `expected (ref null $type), found (ref $type)`.

`genbind.py` makes that population out of the census's own cells:

```sh
python3 scripts/silent-sweep/census/gencensus.py /tmp/cellsE --block E
python3 scripts/silent-sweep/d361/genbind.py /tmp/cellsE /tmp/gridB
JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridB <seed.wasm> /tmp/g.json
```

1,424 cells — every `pval=mixed` cell of block E that has a `(gN[0]).` read to respell. On
`1e598e2b`: 828 `runs`, 492 loud emit reject, **104 check-clean invalid wasm**. On D361's
landing: 932 `runs`, 492 loud emit reject, **0 silent** — 104 moved, `runs` LOST 0, → silent 0.

## What this grid is for, and what it is not

It is the READING instrument, not the tripwire. The committed named set is
`scripts/silent-sweep/census/d361-landed.json`: the **96** cells of block E ITSELF that the
landing moves, which is the whole of that block's silent column (96 before, 0 after). Those
are census cells, so they re-grade from the census generator with no second generator in the
loop — `d243/mkset.py` materialises them and they are carried by the standing gate as
`d361-landed`. This directory's 1,424 cells exist to show that the class is four times
larger than the spelling the census happens to carry, and that both spellings move together.

## The ablation warning this grid earned

**Block E grades all four of D361's ablations identically** — 96 → runs whether the rung
keeps its `>= 2 elements` bound, its all-elements-are-object-literals requirement, its
same-row requirement, or none of them. So does this grid. What separates them is the
`tests/cases` corpus `cmp`: dropping the all-object-literals requirement moves 3 modules and
stops `arrays/inferred-list-objlit-beside-ident-arm.vl` compiling, dropping the same-row
requirement moves 9 and stops `unions/anon-objlit-list-elem-beside-arm.vl` compiling, and
dropping the two-element bound moves **nothing on any population measured**. The first of
those separators is a fixture this PR added, because nothing in the corpus covered it. A grid
that measures the landing is not automatically a grid that can price its parts.
