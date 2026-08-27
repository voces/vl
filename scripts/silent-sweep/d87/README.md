# The D75 / D81 / D82 grid, and its ablation

The 3,144-cell grid that closed `silent-class-inventory.md` **D75, D81 and D82**. Kept
because the closing numbers in that document — **456 moved, 0 backward, silent 264 → 0** —
and the four-way root split are only claims if the population cannot be re-run.

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
  generic's argument.

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

The verdict here, base `N` = master plus the two inert refactors and the new pass registered
with no legs enabled:

| compiler | what it adds | runs | loud emit | invalid wasm | moved |
|---|---|---|---|---|---|
| `N`  | nothing (inert)                    | 2454 | 426 | 264 | — |
| `B3` | the `exprVariantIndex` pin rung     | 2730 | 324 |  90 | 276 |
| `C3` | `synthDstPinAnn` leg 1 (global)     | 2490 | 408 | 246 |  36 |
| `D3` | `synthDstPinAnn` leg 3 (param)      | 2490 | 408 | 246 |  36 |
| `E3` | `synthDstPinAnn` leg 2 (local)      | 2562 | 372 | 210 | 108 |
| `G`  | all four                            | 2910 | 234 |   **0** | 456 |

All six pairwise intersections are EMPTY and 276+36+36+108 = 456 = |G moved|, set-identical
— so no leg closes another's cells and, unlike D39/D40/D41, **no cell needs two patches**.
`N` vs master is 0 cells and 0 MESSAGES, which is what makes the refactors provably inert.

**`ablate87.py` diffs MESSAGES, not just outcome classes.** D57's stage B moved 36 cells from
one `check-clean invalid wasm` mechanism to another; the outcome-class grader scored them
unchanged and the stage diff showed nothing at all. Every comparison here also reports cells
whose outcome is equal and whose message is not (there are none on this branch, which is a
measured fact rather than an absence of measurement).
