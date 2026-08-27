# The D52 grid

The 9,450-cell grid that closed `silent-class-inventory.md` D52 (and D66 with it) and filed
D81 / D82 out of its residue. Kept because the closing numbers in that document — **180
moved, 0 backward** — are only a claim if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d52/gen52.py /tmp/d52cells
python3 scripts/silent-sweep/d52/sweep52.py /tmp/d52cells <master-seed.wasm> /tmp/master.tsv
python3 scripts/silent-sweep/d52/sweep52.py /tmp/d52cells <branch-seed.wasm> /tmp/branch.tsv
python3 scripts/silent-sweep/d52/delta.py  /tmp/master.tsv /tmp/branch.tsv
python3 scripts/silent-sweep/d52/pivot52.py /tmp/branch.tsv cons,cont,route
```

`sweep52.py` takes the seed as an argument rather than reading `build/vl-compiler.wasm`, so
both sides are measured with ONE host binary and no tree switching — the difference between
the two runs is then the compiler and nothing else. Default `--jobs 4`.

**The expectation is computed by the generator, not by the compiler.** Every cell stores `7`
into `{ r: … }` and prints exactly that field back, so a module that loads and answers wrong
grades `wrong_value` rather than `runs`.

## Why these axes

`decl` (arm / plain / nodecl) exists because a previous 900-cell grid declared the union in
all 900 files — a constant, not an axis — and missed D41 for it. `consumption`'s `pass` level
hands the value to a callee whose PARAM is annotated and whose RESULT is not, because a
1,514-cell grid held callee delivery fixed and missed a loud→silent move; that level is what
found the parameter storage class of D52's own seam. Nothing sits in a shared prelude that is
not itself an axis level.

1,800 of the 11,250 combinations are structurally unrepresentable (`otherarm` needs a union;
`order` needs a declaration block to reorder). They are skipped, counted, and printed —
a silently truncated axis reads as "covered everything" when it did not.
