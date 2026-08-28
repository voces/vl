# d188 — the two grids #1992 was decided on

Both grade on the RUN, both print a `{cell: outcome}` JSON on stdout, and both take one
argument: the seed to grade.

```sh
python3 scripts/silent-sweep/d188/aliasgrid.py build/vl-compiler.wasm > /tmp/a.json
JOBS=6 python3 scripts/silent-sweep/d188/isgrid.py build/vl-compiler.wasm > /tmp/i.json
```

They exist because **the distilled corpus cannot see either question** and the census can
see only half of one. `isgrid`'s whole population is outside the census — 161,556 census
and corpus programs reach none of `vbHeapIdxOfKind`'s ten guards — and `aliasgrid`'s
alias-vs-inline PAIRING is what makes its cells readable at all: the interesting quantity
is not "does the alias leg run" but "does the alias leg land on its own inline control's
verdict", and no population that carries only one of the two spellings can ask that.

## `aliasgrid.py` — 322 cells

23 array-spine leaf kinds × 7 annotation positions × {alias, alias-free control}. Read it
by comparing the `/alias` and `/inline` halves of each row, not by counting `runs`.

* **D188** (closed, #1992): the inline-object-shape leaf, 63 cells forward.
* **D362** (open): the leaf that is itself a declared ALIAS — a litunion, a declared union,
  a canonicalized intersection. `loud check reject` at the six reading positions where the
  inline control runs, and **check-clean invalid wasm** at `unread` for the intersection.
* It is #1992's ABLATION population. Grade a stripped build against a full one: stripping
  the parser rung reproduces master exactly, and stripping the transparency arm while
  KEEPING the parser rung takes nine cells from a loud check reject to check-clean invalid
  wasm — the two rungs are one landing.

## `isgrid.py` — 720 cells

10 receiver unions × 6 checked primitives × 2 positions × 3 mint states × {read the
narrowed binding in the then-branch, print a constant}.

The last two axes are the ones D228's control table did not have, and each changed a
claim: without the READ every admitted non-variant `is` runs on every compiler ever built,
and the MINT state decides whether an identical two-line program builds. Cell-matched,
`e44ef5e6` → `4bdfcc67` moves exactly 28 cells (#1972's price) and #1992 moves 72.

Compilers for a historical commit are built by exporting that commit's `compiler/` and
`std/` and self-compiling them with a current seed — `git archive <sha> compiler std`, then
`vl build compiler/entry.vl --compiler <current seed>`. That is what turned D228's "it ran
on `16d5c6e7`" from a claim into a bisect: `e44ef5e6` sat between the two commits the row
quoted and had never been graded.
