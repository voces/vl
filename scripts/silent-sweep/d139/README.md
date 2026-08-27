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

## What it reported at D139's CLOSE (base `54780e0b` vs the D139 branch)

The probe that paragraph named was run, and it answered in one column: the local's binding
already carried the deciding annotation (`letType=37`, `{[string]:Circle}`) and the global's
did not (`letType=-1`), because D81's `synthDstPinAnns` walked `fnStmts` only. The fix is
that pass's module run.

| side | runs | loud emit reject | check-clean invalid wasm |
|---|---|---|---|
| base `54780e0b` | 15 | 10 | 11 |
| D139 branch | 18 | 8 | 10 |

**3 cells moved, 0 backward** — `armtwin x mapval x none x global` check-clean invalid wasm
to runs, and `arm x mapval x none x global` + `armdiff x mapval x none x global`
**loud emit reject to runs**. THIS GRID IS THE ONLY ONE THAT SEES THE ROW: the 2,850-cell
D88/D100 and 1,114-cell D112 grids both move 0, because every cell of both builds the map as
a function LOCAL. That is the whole reason this grid exists, stated as a measurement.

The 10 remaining SILENT cells are filed with runnable witnesses, and they partition exactly:
**D155** is the 1 cell at `armtwin x mapval x none x callres` (now the specimen), **D156**
the 3 at `armtwin x nestedmap x none x {local,global,callres}`, and **D157** the 6 at
`route=std` (3 `mapval`, 3 `nestedmap`).
The 8 remaining LOUD cells are the documented `-3` floor and are unchanged: they are
`arm`/`armdiff` x `route=none`, where no declared struct names the layout, and a floor is
the outcome that row is supposed to have.

**The `bind` axis does NOT discriminate D155**, which is the second thing this grid bought:
that row is silent at `local`, `global` and `callres` alike, and the axis that does
discriminate it is whether the producing function's RESULT is annotated. So the grid
separated D139 from its residue and then said its own axis is not the residue's axis —
which is exactly what a grid built to vary one held-constant coordinate is for.

## What it reported at D155's CLOSE (base `1559d80c` vs the D155 branch)

The paragraph above says this grid's own axis is not D155's axis, and that stayed true —
the axis that IS D155's is where the deciding annotation sits, one SCOPE out. But the grid is
still the only one of the seven that contains the row, so it is the only one that can grade
it, which is the second job a small held-constant-coordinate grid does.

| side | runs | loud emit reject | check-clean invalid wasm |
|---|---|---|---|
| base `1559d80c` | 18 | 8 | 10 |
| D155 branch | 21 | 6 | 9 |

**3 cells moved, every one FORWARD, 0 backward, 0 to a silent class** —
`armtwin x mapval x none x callres` check-clean invalid wasm to runs, and
`arm x mapval x none x callres` + `armdiff x mapval x none x callres` **loud emit reject to
runs**. The other six grids move 0 cells and 0 messages: D52 (9,450), D75/D81/D82 (3,144),
D88/D100 (2,850), D111/D117 (1,710), D131 (1,732), D112 (1,114).

There is also **1 same-class MESSAGE move**, at `armtwin x mapval x std x callres`: the pin
now fires there and the cell stays silent because a SECOND root (inventory D163 — the list
literal's element row) holds it. An outcome-class count cannot see that; it is the "same
class, different message" disguise, and it is the reason the message diff is run on every
grid rather than only on the ones whose totals moved.

The 9 remaining SILENT cells are `armtwin x {mapval x std, nestedmap x *}` at all three
bindings — **D156** owns the six `nestedmap` cells, **D157**/**D163** the three
`mapval x std` ones. The 6 remaining LOUD cells are the documented `-3` floor at
`arm`/`armdiff` x `nestedmap` x `none`, unchanged.
