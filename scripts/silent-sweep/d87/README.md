# The D75 / D81 / D82 grid, and its ablation

The 3,144-cell grid that closed `silent-class-inventory.md` **D75, D81 and D82**. Kept
because the closing numbers in that document — **528 moved, 0 backward, silent 306 → 0** —
and the five-way root split are only claims if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d87/gen87.py /tmp/d87cells
python3 scripts/silent-sweep/d52/sweep52.py /tmp/d87cells <seed.wasm> /tmp/tsv/<name>.tsv --jobs 6
python3 scripts/silent-sweep/d87/ablate87.py /tmp/tsv <base> <full> <name>...
```

`sweep52.py` is reused verbatim — it takes the seed as an argument and reads `manifest.tsv`,
so it is generic over the cell directory, and using ONE grader for both grids is what makes
their residues comparable. Its expectation is computed by the generator, never by the
compiler: every cell prints exactly `7`, so a module that loads and answers wrong grades
`wrong_value` rather than `runs`.

## Why these axes

- **`decl`** (`arm` / `arm2` / `plain` / `nounion`) — the PRELUDE, and `arm2` is the 0/1/2
  **pairing** axis: it declares TWO unions containing `Circle`. A one-per-program grid
  structurally cannot see a pairing defect, which is how two earlier rows escaped. `plain`
  and `nounion` keep union-ness a level rather than a constant — a 900-cell predecessor
  declared the union in all 900 files.
- **`twin`** (`none` / `exact` / `two` / `namediff` / `armtwin` / `late`) — 0, 1 and 2 exact
  layout twins, a same-arity different-NAME twin, a twin that is itself an arm, and one
  declared after use.
- **`route`** (`fn` / `gen` / `std` / `eq`) — **`eq` is D75's coordinate and no previous grid
  in this family varied it.** D57's 770-cell grid found D75 by hand at a coordinate it did
  not vary; this axis is that omission closed.
- **`src`** — the STORAGE CLASS the value lives in: an anonymous literal, an annotated local,
  a module global, a parameter, a capture, a call result.
- **`dst`** — the DESTINATION it is delivered to: return, module-global assignment, callee
  param, annotated local binding, annotated local assignment, map value, list element, or a
  generic's argument. The map-value level is why this grid caught a destination that did not
  exist when it was written: on `8bf0f20f` those cells were a loud floor, and #1954 removed
  the floor while this branch was in review.

1,464 of the 4,608 combinations are structurally unrepresentable (a generic `==` has no
destination to vary; `arg` needs a generic to be an argument to; `mapIndexed`'s callback
arity is fixed). They are skipped, **counted and printed** — a silently truncated axis reads
as "covered everything" when it did not.

## The ablation, and what it is for

`ablate87.py` takes one TSV per candidate compiler and reports the per-candidate moved set,
**every pairwise intersection**, and whether the union of the singles is set-identical to the
full branch's. A resemblance in this family is refuted as often as confirmed (D39/D40/D41
split three ways and needed a composition; D48/D63/D64 split three ways and did not), so
"these are one root" is a measurement and not a reading.

The verdict, measured against master `922d52eb`, base `N9` = master plus the two inert
refactors and the new pass registered with no legs enabled:

| compiler | what it adds | runs | loud emit | invalid wasm | moved |
|---|---|---|---|---|---|
| `N9` | nothing (inert)                     | 2586 | 252 | 306 | — |
| `B9` | the `exprVariantIndex` pin rung      | 2898 | 138 | 108 | 312 |
| `C9` | `synthDstPinAnn` leg 1 (global)      | 2622 | 234 | 288 |  36 |
| `D9` | `synthDstPinAnn` leg 3 (param)       | 2622 | 234 | 288 |  36 |
| `E9` | `synthDstPinAnn` leg 2 (local)       | 2694 | 198 | 252 | 108 |
| `F9` | `synthDstPinAnn` leg 4 (map value)   | 2622 | 234 | 288 |  36 |
| `P`  | all five                             | 3114 |  30 | **0** | 528 |

All TEN pairwise intersections are EMPTY and 312+36+36+108+36 = 528 = |P moved|,
set-identical — so no leg closes another's cells and, unlike D39/D40/D41, **no cell needs two
patches**. `N9` vs master is 0 cells and 0 MESSAGES, which is what makes the refactors
provably inert.

**The base moved under the measurement, so it was re-run rather than carried over.** #1954
landed mid-review and this grid grades `922d52eb` at 306 silent where `8bf0f20f` gave 264 —
42 cells moved from a loud floor into the silent class, 18 of them a destination this branch
then grew a fifth leg for. Re-running the whole set against the new base is the only reason
those 18 are in the table at all.

**`ablate87.py` diffs MESSAGES, not just outcome classes.** D57's stage B moved 36 cells from
one `check-clean invalid wasm` mechanism to another; the outcome-class grader scored them
unchanged and the stage diff showed nothing at all. Every comparison here also reports cells
whose outcome is equal and whose message is not (there are none on this branch, which is a
measured fact rather than an absence of measurement).
