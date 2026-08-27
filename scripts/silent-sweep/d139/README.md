# The D139 grid — the axis neither the D88 nor the D112 grid varies

A 36-cell grid over **where the map is BOUND**. Small on purpose: it exists to vary one
coordinate every other grid in this family holds constant, not to discover a class.

```sh
python3 scripts/silent-sweep/d139/gen139.py   /tmp/d139cells
JOBS=6 python3 scripts/silent-sweep/d139/grade139.py /tmp/d139cells <base.wasm> <branch.wasm>
```

`JOBS` defaults to **6** and nothing here raises it. Every cell prints exactly `7`, and the
expectation is the generator's, not the compiler's — a module that loads and answers wrong
grades `wrong_value`, never `runs`.

## Why it exists

#1962 (D131) found its real discriminator only after four filed one-line controls had all
been confirmed and none of them separated anything: a PARAM, a module GLOBAL and a CALL
result as the receiver all ran, and only a LOCAL failed. Its lesson, in that PR's words, is
that a passing control can prove nothing — it may agree by accident.

The analogue at this layer is the map's own binding. **Every cell of the 2,850-cell
D88/D100 grid and of the 1,114-cell D112 grid builds the map as a function LOCAL.** So does
every filed control on D88, D100, D112, D123 and D124. This grid varies it.

Axes: `decl` (`arm` / `armdiff` / `armtwin`) x `bind` (`local` / `global` / `callres`) x
`cont` (`mapval` / `nestedmap`) x `route` (`none` / `std`).

## What it reported (base `89d01c97` vs the D123/D124 branch)

| side | runs | loud emit reject | check-clean invalid wasm |
|---|---|---|---|
| base `89d01c97` | 3 | 10 | 23 |
| D123/D124 branch | 15 | 10 | 11 |

**12 cells moved, every one `check-clean invalid wasm` → `runs`, 0 backward** — and they
are **4 at each of `local`, `global` and `callres`**. That is the finding for D123: its fix
is storage-class INDEPENDENT, so the axis the grids do not cover does not change its
answer, and no cell moves backward at a coordinate no other grid would have shown.

**For D139 the same axis IS the discriminator**, which is what makes the grid worth keeping.
At `armtwin x mapval x route=none` the LOCAL binding **RUNS** while the GLOBAL and the
CALL-RESULT bindings are `check-clean invalid wasm`, on base and on the branch alike. And
the two programs are not different at the mint: probed, both intern the SAME two mv slots
over the SAME two ref-list rows (`rl=0 nm=Circle heap=1 wrap=9`, `rl=1 nm=Dot heap=0
wrap=11`) and emit BYTE-IDENTICAL type sections. What differs is which slot the binding's
`Map()` constructor resolves — `struct.new 15` (the `Circle`-vals map struct) at function
scope against `struct.new 16` (the `Dot`-vals one) at module scope.

**So D139's "wrap it in a function and it runs" control does NOT show that the slot split is
absent there.** It is present, identically. Read as "the mint is scope-dependent" it would
be exactly the agreement-by-accident #1962 warns about; read correctly it says the residue
is a BINDING-RESOLUTION problem as much as a mint one, and names the cheapest next probe:
why does the module-scope binding resolve the render's slot where the local resolves the
arm's?

The 10 `loud emit reject` cells are `arm`/`armdiff` x `route=none`, where no declared struct
names the layout and the mv layer's `-3` floor fires. They are identical on both sides.
