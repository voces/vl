# The D282 grid — the ANONYMOUS claimant of a union arm's layout

The 324-cell grid that measured `silent-class-inventory.md` **D282** and priced **D281**.

```sh
python3 scripts/silent-sweep/d282/gen282.py /tmp/d282cells

JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d282cells <master.wasm> /tmp/g/base.json
JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/d282cells <branch.wasm> /tmp/g/branch.json
```

`grade88.py` is reused verbatim — it takes the seed as an argument rather than reading
`build/vl-compiler.wasm`, so both sides are measured with ONE host binary and no tree
switching, and one grader across the D88, D112, D156 and D282 grids is what makes their
residues comparable. `JOBS` defaults to **6** and nothing here raises it.

**The expectation is computed by the GENERATOR, never by the compiler.** Every cell prints
exactly `7`, so a module that loads and answers wrong grades `runs but wrong value`.

## Why this grid exists

D156's `twin` axis is BINARY — *is an exact layout twin DECLARED* (`type Dot = { r: i32 }`) —
and its `notwin` leg is read as "nothing else claims the arm's layout". That reading is
false. An interned `#anonN` row, minted by `collectAnonShapes` from an object literal no
context could name, claims exactly the same layout, and `repSlotOfTy` — the DECLARED-row
bridge `variantStructHeapTwinAt` keys on — cannot see it. So `twin=notwin` mixes *no
claimant* with *an anonymous claimant*, and every number taken over it is a mixture. This
grid's `claim` axis separates them, and all 24 cells it moved are `claim=none`.

## The second thing it found, which it was not built for

Its `use=boxarm` axis reads the value back out and boxes it into the union. **D281's row
states in writing that no population does that** — "it moves 0 cells on all four per-row
grids (5,188), 0 classes on the distilled corpus and 0 on census block B; none of those
populations boxes a plain declared struct into a union." This one does, and strips of D281's
rung cost **30 of these 324 cells** on master alone. Those 30 plus the 6 that D282's own
merge adds are kept whole at `scripts/silent-sweep/distilled/named/d282_*.vl`.

That is the general lesson worth more than either number: **an axis added for one row prices
the rung of another.** A grid holds constant the axes it was not chasing, and the rung whose
price nothing could see is exactly the rung a later grid should be asked about.

Their coordinates are `scripts/silent-sweep/census/d282-d281-price.json`:

```sh
python3 scripts/silent-sweep/d243/mkset.py /tmp/price \
    scripts/silent-sweep/census/d282-d281-price.json /tmp/d282cells
JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/price <seed.wasm> /tmp/p.json
```

The histogram must read `runs 36` and nothing else — 36 `vl` invocations rather than a grid.
`gen282.py` writes the `manifest.json` both that grader and `mkset.py`'s staleness check read;
the expectation in it is the GENERATOR's, never a compiler's.

## Axes

- **`prod`** — where the ANONYMOUS literal is produced and held, which is what mints the
  `#anon` row: `mapparam` (D282's own — a map filled through an UN-ANNOTATED parameter),
  `maplocal`, `listlocal`, `globalbare`, `fnret`.
- **`use`** — WHERE the one nominal claim on the arm sits: `plain` (nowhere), `readdef` (the
  `??` default — D282's coordinate, map producers only), `bindarm`, `paramarm`, `retarm`,
  `boxarm` (into the union then `is`-narrowed back — the DISCRIMINATION control, which is
  what a heap merge can break and a corpus `cmp` cannot show).
- **`claim`** — `none` (the anon row is the arm's ONLY layout-mate: the rung under test) or
  `decl` (`type Dot` also declared, so D280's rung answers and the new one must be inert).
- **`fld`** — the arm's field storage: `i32`, `two` (two i32 fields), `str` (i32 + string).
- **`order`** — declaration order of the type block.

## Skips

`use=readdef` needs a `??`, which only the map producers have: 36 cells.

## Resource discipline

`JOBS` defaults to **6** and nothing here raises it (`vl check` peaks around 650 MB RSS).
