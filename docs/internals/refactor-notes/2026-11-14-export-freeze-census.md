# Freezing exports at the module boundary: the population it moves, and whether a `const` copy is visible, 2026-11-14

Lane K. This note measures, and changes no compiler code. It informs the owner's provisional
ruling D: an exported `let` takes its type from its own module, and an exported `const` is
generalised over its literal types, so each importer instantiates its own copy. The fallback is
B, freeze both. The rule it would replace is DECISIONS.md, "Record adoption crosses module
boundaries" (2026-10-07). Master `b9d20e5c4`.

## 1. Which programs have an importer that widens an exported un-annotated binding

**The instrument** is a scratch compiler, never refreshed into `build/`. It notes every exported
top-level `let`/`const` with no annotation before the first check pass. After the pins it
prints each one's final type, rendered structurally (alias names expanded), with its module
path. Each program is checked as an entry. Each imported module that holds such a binding is
also checked alone, as its own entry, which is the type that freezing at the boundary would
give it. A row moves when the two types differ. The instrument catches the mechanism's effect,
not one solver. A pin solver's rewrite (record adoption) and a hole filled by a write (an empty
list's element) both count.

**Controls.** Six two-file programs. The four positives move:

- an exported `let` record delivered to `{ x: i64, y: i64 }`: `{x: i32, y: i32}` → `{x: i64, y: i64}`;
- the same with `const`: same move;
- `export let xs = []` with `xs.push(2.5)` in the importer: `i32[]` → `f64[]`;
- `export let ps = [{ x: 1 }]` delivered to `{ x: i64 }[]`: `{x: i32}[]` → `{x: i64}[]`.

The two negatives hold:

- `export let level = 0` delivered to an `i64` parameter stays `i32` (`lbiCandAt` already ignores an importer's read);
- `export const ys = [1, 2]` delivered to `f64[]` is refused, not widened.

**The population** is every program that imports something. A sample of 400 non-importing files
from `tests/cases` and `distilled/` linked 0 modules. In this population, a program reads an
imported binding only if its graph holds a binding from another module that is exported and
un-annotated.

| corpus | importing programs | programs with such a binding | (program, binding) pairs, `let` / `const` | widened, `let` / `const` |
| --- | ---: | ---: | ---: | ---: |
| `tests/cases` (module dirs by `entry.vl`) | 566 | 21 | 3 / 95 | 0 / 0 |
| `tests/fixtures` | 20 | 1 | 0 / 9 | 0 / 0 |
| `scripts/silent-sweep/distilled/` | 155 | 3 | 0 / 27 | 0 / 0 |
| `scripts/silent-sweep/census/` (its tools) | 10 | 10 | 0 / 90 | 0 / 0 |
| `std/*.vl` as entries | 18 | 2 | 0 / 18 | 0 / 0 |
| inventory witnesses with `// file:` sections | 43 | 7 | 1 / 7 | 0 / 1 |
| `bench/` | 30 | 2 | 0 / 18 | 0 / 0 |
| `scripts/` (repo tools, outside silent-sweep) | 100 | 68 | 0 / 622 | 0 / 0 |
| `compiler/entry.vl` (the compiler's own graph) | 1 | 1 | 448 / 501 | 0 / 0 |
| **total** | **943** | **115** | **452 / 1,387** | **0 / 1** |

The pairs cover 452 distinct exported `let`s and 535 distinct exported `const`s.

**One of 943 importing programs moves.** It is D6751's witness, an inventory repro:

    // file: lib.vl
    export const pt = { f: 4, g: { h: 1, k: 2 } }
    // file: main.vl
    import { pt } from "./lib"
    let v = { f: 1.5, g: { h: 1 } }
    v = pt

Here `pt` is a `const`. Alone it is `{f: i32, g: {h: i32, k: i32}}`. In the graph it is
`{f: f64, g: {h: i32}}`: a record field's numeric width changed, and a nested field was dropped.
That program is a loud check reject today (D6751 is the skip's soundness row). So, of the
programs in this population that pass `vl check`, none has an importer that widens or adopts
the layout of an exported un-annotated binding. No numeric-width move and no list-element move
appear anywhere in the population, outside the controls.

**The census corpus.** The census itself (about 250,000 generated cells) is single-module except
for its `deliv=std` axis. Its content is graded through `distilled/`. Its std deliveries can
reach std's exported un-annotated bindings, and there are exactly nine of them: the `i32`
error-code `const`s of `std:fs` (`EACCES` … `EPERM`). None moves in any of the 115 graphs
that hold them.

## 2. Whether a program can tell two values are the same `const` record object

**Yes**, through four routes today. So D's per-importer copies of a `const` record or list would
change the output of a program that runs. Each witness is a plain program, run on master's seed.

| route | witness | prints today |
| --- | --- | --- |
| `===` (built) | `const p = { x: 1 }; const q = p; print(p === q); print(p === { x: 1 })` | `true` `false` |
| a field write through an alias | `const p = { x: 1 }; const q = p; q.x = 2; print(p.x)` | `2` |
| a list write through an alias | `const xs = [1]; const ys = xs; ys.push(2); print(xs.length)` | `2` |
| a write through a parameter | `function bump(r) { r.x = r.x + 1 }; bump(p); bump(p); print(p.x)` | `3` |

The same routes cross a module boundary:

- `r.vl`: `export const pt = { x: 1 }; export function show() { print(pt.x) }`. An importer writes
  `pt.x = 9; show()`. This prints `9`: the exporter sees the importer's write.
- Two importers: `a.vl` exports `bumpA() { pt.x = pt.x + 10 }`, and `main.vl` imports both.
  `bumpA(); print(pt.x)` prints `11`. Under per-importer copies it would print `1`.
- `r.vl` exports `same(o: { x: i32 }) { return o === pt }`. The importer's `same(pt)` prints
  `true`, and `same({ x: 1 })` prints `false`.
- `export const xs = [1]` with `xs.push(5)` in the importer: the exporter's `xs.length` is `2`.

**What cannot see identity:**

- `==` is structural: `p == { x: 1 }` is `true`.
- `Map`/`Set` keys are structural by ruling, and a record key is refused today ("`Map`/`Set` keys
  must be `string`, `i32` or `i64`").
- `IdentityMap`/`IdentitySet` are ruled but not built (`undeclared identifier 'IdentityMap'`).
- A scalar `const` has no identity: `o === N` on `i32` is a check error, "`i32` has none — use
  `==`".

Per-importer instances of a scalar or string `const` are therefore unobservable. Instances of a
`const` record, list or map are observable through `===` and any write.

**One neighbour, refused today.** An importer that adopts a `const` record into a wider layout
(`take(pt)` at `{ x: i64 }`), with the exporter's `same(o: { x: i32 })` still reading `pt` at its
own type, is a loud check reject. The message is: "`pt` holds only literals, so it is built as
the `W` it is delivered to; annotate it to keep its own type, and copy it for the other use".
Under today's rule (B of 2026-10-07), one object at the widened layout is what every module
sees.

## Reading

- Freezing at the boundary (D for `let`, or B) moves no program in this population that passes
  `vl check`. The one moving program is already refused.
- D's per-importer `const` copies are unobservable for scalar and string `const`s.
- D's copies are observable for a `const` record, list or map, through `===` and through every
  write to a field or element. A program that writes such a `const` from two modules prints
  differently under D.
- The population that would see the difference is every program where two modules both
  reference a `const` of a reference type and one of them writes it or compares it by `===`. It
  is not the 0-of-943 widening count above. I did not count it, because no program in the 943
  needed a widening to show it.
