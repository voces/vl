# The D93 / D94 grid, and its ablation

The 300-cell CLAIMANT-PAIR grid that closed `silent-class-inventory.md` **D93 and D94**.
Kept because the closing numbers in that document — **33 moved, 0 backward, silent 33 → 0**
— and the composition verdict are only claims if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d94/gen94.py /tmp/d94cells
python3 scripts/silent-sweep/d52/sweep52.py /tmp/d94cells <seed.wasm> /tmp/tsv/<name>.tsv --jobs 6
python3 scripts/silent-sweep/d94/ablate94.py /tmp/tsv <base> <full> <name>...
```

`sweep52.py` is reused verbatim — one grader across the D52, D87 and D94 grids is what makes
their residues comparable. Its expectation is computed by the GENERATOR: every cell prints
exactly one line combining each unit's read by place value, so a module that loads and
answers wrong grades `wrong_value` rather than `runs`.

## Why these axes

- **`pairing`** (0 / 1 / 2 extra claimant units) — **the axis both rows turn on and the one
  a per-program grid structurally cannot have.** D93's own row records that one unit alone
  RUNS at every spelling; the two refuted candidates on that row were refuted precisely
  because they fired on `pairing=0`, so keeping the single-unit control in the population is
  what grades a floor honestly.
- **`container`** (`nestedmap` / `mapval` / `structfield` / `listelem` / `listoflist`) — D93
  lives at the first, D94 at the third. The other three are the containers D47/D48/D49/D63/D64
  closed, kept as this grid's backward-move detector.
- **`twin`** (`none` / `exact` / `namediff` / `armtwin`) — what the SECOND claimant's leaf
  is. `none` makes the two units genuinely the same type (they MUST share a slot), so the
  grid contains cells a separating fix has to leave alone.
- **`spelling`** (`inline` / `alias` / `direct` / `inferred`) — the container type's INTERN
  STATE, which is the axis D47 is about: whether the alias row exists, and whether the
  binding names it, spells the shape beside it, or carries no annotation at all.
- **`order`** (`a` / `b`) — **and it is not decoration.** The residue after the mv-layer half
  of D93's fix was EXACTLY the 12 `order=b` cells, which is how the sixth un-hinted typed
  find was found. A grid with one declaration order would have reported that half as a
  complete fix.

180 of the 480 combinations are structurally unrepresentable (a single unit has no twin axis
and one order; a third claimant needs a declared twin family). They are skipped, **counted
and printed** — a silently truncated axis reads as "covered everything" when it did not.

## The ablation, and what it is for

`ablate94.py` reports the per-candidate moved set split by DIRECTION, every pairwise
intersection, whether the union of the singles is set-identical to the full branch's, and —
separately — cells whose OUTCOME is equal and whose MESSAGE is not. D57's stage B moved 36
cells between two `check-clean invalid wasm` mechanisms and an outcome-class grader scored
them unchanged, so the message diff is not optional.

The verdict, measured against master `8d070d46`:

| compiler | what it adds | runs | loud emit | invalid wasm | moved |
|---|---|---|---|---|---|
| master | `8d070d46`                                   | 252 | 15 | 33 | — |
| `LA` | D94's element-declaration preference           | 258 | 15 | 27 |  6 |
| `LB` | D93's nominal mv KEY + the slot's ARM SIGNATURE | 267 | 15 | 18 | 15 |
| `LD` | the sixth typed find's arm hint                 | 252 | 15 | 33 | **0** |
| `LBD` | `LB` + `LD`                                    | 279 | 15 |  6 | 27 |
| full | all three                                       | **285** | 15 | **0** | 33 |

Every pairwise intersection is EMPTY; the union of `LA` and `LBD` is set-identical to the
full branch's 33; the full branch agrees with each single on every cell that single moves.
**`LD` moves ZERO cells alone and is still load-bearing** — `LBD` − `LB` is 12 cells that
need both — so D93 is a COMPOSITION (the D39/D40/D41 shape) and not three disjoint roots
(D48/D63/D64's). D94 is its own root, disjoint from all of it.

**A leg that moves 0 cells is not thereby droppable, and a leg that moves 0 cells in
composition too IS.** Two further candidates were built and swept here: the rep-key VARIANT
rung at the map-value position (0 alone, 0 in composition — dropped as speculative) and the
same rung in `repElemKey`'s `TyObj` arm (closes the 12 order-b cells on its own and REDDENS
`generics/mono-callback-bound-arm-beside-layout-twin.vl`, loudly). Both are recorded on D93.

## The larger grids, re-graded

Both are 0-moved and 0-message-diff under the full branch on the merged base:
`d87` 3,144 cells (3126 runs / 18 loud emit / 0 silent, either side) and `d52` 9,450 cells
(7424 / 2026 / 0, either side). A backward-move count is only as wide as the grid's axes, so
the branch is graded against the two largest populations this programme has as well as its
own.
