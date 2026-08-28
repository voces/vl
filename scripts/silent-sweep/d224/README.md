# The D224 grid — DE-CONFOUNDING the `twin` axis, and the message pairing

`silent-class-inventory.md` **D224** was refused for a price of 199 block-B cells that
census block B **cannot attribute**: block B crosses `twin` only at its three CORNERS
(`none/nounion/0`, `exact/unused/1`, `armtwin/used/2`), so every `twin=armtwin` cell in it
also carries `claim=2` and `union=used`. A per-class column delta over that block cannot say
whether the arm twin, the container aliases or the used union is the ingredient, and the
per-row grids (D88/D100, D112, D156, D139) contain none of these cells at all — the change
moves **0** on every one of them.

This grid takes the exact coordinate of each of the 65 cells the arm rung's lift moved
backward on `474b6a1b` and of D211's 4 `twin=armtwin` wins, and crosses `twin × claim × union`
FULLY against each, holding the other nine axes at that cell's own values. 69 seed
coordinates × 4 × 3 × 3 = **2,484 cells**, every `armtwin` cell with an exact `none` /
`samearity` / `exact` sibling.

```sh
python3 scripts/silent-sweep/census/gencensus.py /tmp/cellsA --block A     # the win coords
python3 scripts/silent-sweep/d224/gen224.py      /tmp/gridT  /tmp/cellsA

JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridT <master.wasm> /tmp/T-base.json
JOBS=6 python3 scripts/silent-sweep/census/gradecensus.py /tmp/gridT <branch.wasm> /tmp/T-branch.json
python3 scripts/silent-sweep/d224/pairs224.py /tmp/gridT /tmp/T-base.json /tmp/T-branch.json
```

What it said for the shipped change, on `21f48747` (and, in brackets, on `474b6a1b` — the
grid is unchanged, the compiler under it is not):

* **334 moved, 138 backward [310], 196 forward [24], 0 `runs` lost** — and every moved cell is
  `twin=armtwin`. Zero at `none`, `exact`, `samearity`; zero anywhere at `union=nounion`.
* **`claim` is causal for the size and not for the class**: 15 backward at `claim=0` [25], 27
  at `claim=1` and at `claim=2` [65] — and the same counts are ALREADY `check-clean invalid
  wasm` at `twin=none` on master.
* **138 of 138** backward cells land on the byte-identical validator sentence (offsets
  normalised) their own `twin=none` sibling already produces on master. The loud message they
  lose is `emitProgram: bare null needs a struct-typed context` — the declining predicate's
  own refusal, not a diagnosis of the program.
* **The law**: under the change `armtwin` grades identically to `twin=none` on **621 of 621**
  cells and to `samearity` on 621 of 621. Master disagrees on 334 of each — on BOTH compilers.

The twin-free half of that pairing is filed as **D300** (`census/d300-twinfree.json`), and it
is why the price is not a property of this edit: it was 65 on `474b6a1b`, #1984 closed 38 of
those siblings from the other side, and the same unchanged cut now costs 27. Closing the rest
takes it to 0.
