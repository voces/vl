# IR B4b: the returned value `if`, 2026-11-18

Lane IR2. This step follows the design note `2026-11-18-ir-b4b-tail-if-design.md`. The returned
value `if` is the same `SIf` in return position: no new node, and no second builder path.

## What landed

- **`tailIf`/`tailArm`** build `return if …` and a body's tail value `if` as the statement `SIf`:
  - each arm's prelude is built as statements;
  - its last value is the `SReturn` a `return <value>` builds;
  - a nested value `if` recurses, and an `else if` is the next link.
- **The control the coordinator asked for:** `if c { return x + 1 } else { return 0 }` as a last
  statement was already covered and matched, so `irBodyLeaves` gives that form its end. A
  *returned* `if` is the one place legacy writes an `unreachable` after the `end`. The builder
  adds it there as `STrap`, which lowers to exactly that byte.
- **Source-map rows follow legacy's.** A tail arm's prelude goes through `emitStmtIn`, which banks
  no row of its own, and its tail value banks none either. A body's tail `if` is a body statement
  and banks one.
- **`tailIfPlainWhy`**, beside `emitIfTail`, names the shapes left to legacy:
  - a static `is` condition, or its `!`;
  - an integer `match` chain;
  - the union return sink;
  - no `else`.

  Beyond those, the builder also leaves to legacy a returned `if` whose result bears `null` (its
  `null` pad) and a dead tail arm.

## Coverage

Fixpoint seeds of master ee793f8b and of this step.

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched = claimed | 11,962 | 12,305 | **+343** |
| corpus covered = matched = claimed | 30,485 | 30,486 | +1 |

| first miss | self-compile | corpus |
|---|---|---|
| `return of a value if` | 596 → 0 | 175 → 0 |
| `tail if guard` | 0 → 161 | 0 → 8 |
| `returned if null pad` | 0 → 11 | 0 → 2 |
| `tail if union sink` | 0 | 0 → 10 |
| `tail if switch` | 0 → 1 | 0 → 1 |

The else-less nullable tail is a first miss nowhere in either population, so it is no large
door.

Next doors (blocker census, one class alone):
- `is guard` 677;
- `map read inline` 320;
- `expression if` 267;
- `index ref` 244;
- `map store` 219.

Net compiler lines are +103: 3.3 self-compile functions per line.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; master's seed builds this source to it byte for byte; armed self-build identical |
| corpus identity | 0 differ, plain and `--names`; self-compile identical; mode 3 identical |
| `--claims` | 30,486 claimed, ok |
| `--cases` | identical 7,439, fail under both 69, differ 0 |
| `tests/cases` and probes, armed | 35,751 covered, 35,751 matched |
| L2 self-compile fuel | 96,989,637,460 to 96,925,151,402 (−0.07%) |
| pin helpers, phase-state, ladder-sets, lint | 904, ok, ok, clean |
