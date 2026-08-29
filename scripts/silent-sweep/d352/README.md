# d352 — the paren-place grid

`parengrid.py`: **184 cells**. Where a `(` may stand in a narrowed PLACE, on both sides of
the guard, and whether the two spellings key the same place.

```sh
python3 scripts/silent-sweep/d352/parengrid.py build/vl-compiler.wasm > /tmp/p.json
```

7 read spellings × 3 guard spellings × 4 narrowing forms × 2 place depths, **plus a 16-cell
RETIREMENT block**. Graded on the RUN, never on an exit code — the retirement block's whole
question is whether a paren-spelled WRITE retires a narrowing, and a build that answers "no"
is check-clean and wrong rather than loud.

## Why the retirement block is the half that mattered

`placeKeyOf` (`compiler/typecheck.vl`) is the CHECKER's narrowing key and it read
`P.nodes[ix]` raw, so a `Paren` anywhere in a place answered `""` — no key, no overlay.
D222 fixed the EMITTER's twin (`memberPathKeyOf`) at #1991 and this one stayed paren-blind,
which is **D352**: `if t.v is Circle { print((t).v.r) }` is `field 'r' is not on every
member of Shape` while `t.v.r` and `(t.v).r` both print 7.

That is a LOUD row. The grid exists because `placeKeyOf` has **fifteen callers** and only
two of them are the member READ. The others set narrowings, retire them on assignment, bar
writes, and suppress the dead-`??` hint — and exactly one of those has a SILENT wrong
answer, which the read cells cannot see:

```
type Circle = { r: i32 }
type Sq = { s: i32 }
type Shape = Circle | Sq
type Holder = { v: Shape }
function f(t: Holder) {
  if t.v is Circle {
    (t).v = { s: 3 }     // keyed nowhere, so it retires nothing
    print(t.v.r)         // reads the STALE narrowing
  } else { print(0) }
}
f({ v: { r: 7 } })
// master 777f7848: vl check rc 0; vl run: wasm trap: cast failure
// delete the parens on the WRITE and it is a clean `cannot assign {s: i32} to Circle`
```

## What it measured

| seed | runs | check_reject | trap | note |
|---|---|---|---|---|
| master `777f7848` | 12 | 168 | **4** | the four traps are the retirement block |
| rung K alone (`placeKeyOf`) | 98 | 86 | 0 | 86 → runs, all four traps → loud |
| K + C (`placeCurTy`) | 126 | 58 | 0 | C adds the 28 ELSE-branch cells |
| K + C + H (the landing) | 126 | 58 | 0 | H moves nothing here — see below |

**0 `runs` lost and 0 → silent at every rung.** The 58 that stay refused are the 42 `while`
cells (a narrowing in a `while` condition does not reach the body — a separate gap, and a
control here: it must not move) and the 16 retirement cells, which are now correctly refused
at every paren spelling.

## Rung H scores ZERO on this grid and is the reason the other two can land

`placeHasOptionalHop` is the DECLINE that keeps an else-branch from refining a place behind
a `?.`. It is paren-blind in the same way, and with K and C peeling and H raw it answers
FALSE for `(x?.y)` — so the else branch refines a place that may be null because its
RECEIVER was. Measured on two witnesses, not reasoned:

```
type B = { y: i32 }
function f(x: B | null) {
  if (x?.y) is null { print(0) } else { print((x?.y) + 1) }
}
f(null)
// K+C, no H: vl check rc 0        <- the soundness rule is gone
// K+C+H:     [ERROR]: operator '+' is not defined for i32 | null and i32
//            — which is exactly what the unparenthesised control says
```

Both witnesses are kept whole at `distilled/named/d352opt_*.vl`; nothing else in any
population sees that rung.
