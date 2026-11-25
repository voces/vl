# The start body's global initializer arms (2026-11-25, lane COV-START)

The orchestration reset gave this lane start bodies and their global initializers. The 2026-11-20
census's start figures are stale, so this note re-measures before and after on today's master.

## The census on master 7eddff27 (fixpoint of the seed-latest refresh)

`census.sh`'s probe over every program of four populations, claiming on (`$VL_IR_SHADOW=5`):

| population | distinct functions claimed | start bodies claimed |
|---|---:|---:|
| distilled `cells/` + `named/` | 23,888 / 23,911 (99.9%) | 9,705 / 9,770 |
| `tests/cases` | 44,370 / 45,442 (97.6%) | 7,707 / 8,179 |
| capability probes | 644 / 650 (99.1%) | 265 / 281 |
| witnesses filed `runs` | 11,417 / 11,599 (98.4%) | 4,957 / 5,201 |

The open types this lane also owns are nearly gone on every population: `open temp type` keeps 23
units (functions and starts), `open local type` 6, `open parameter type` 0.

A start body misses on about 150 classes, most of them other lanes' (`index element coercion`,
`is box not a local`, `push operand coercion` and the rest). This batch takes the global
initializer arms, which only start bodies reach.

## The mechanisms, one commit each

- **The alias, holder and atom arms** (`startInitArmOf`). These were whole-arm skips:
  - the alias of a generic function used only as a direct callee is the capture-free closure core
    (`RMakeClo`, empty environment, rooted at the statement so no name-read recovery follows);
  - the annotated read of a bundle holder is the holder's member pick (`RHolderPick`);
  - a literal atom at a `string` cell is delivered there, so the delivery writes the decode.
- **A widened value join.** It is claimed unless it nests a join typed other than the whole, which
  legacy builds at its own type and converts whole (D16496). `widenJoinKeepsInner` walks the join
  with `ast.vl`'s tail walkers.
- **A list cell declared at its initializer's instance list.** `const k = keep([mkcall()])` with
  `k[0]` read at a wider record: the global section declares the cell at the instance's list.
  `cellDeclStores` now admits a closed list type. The cell's storage type (`globalStoreTy`) is that
  list, and a read of it goes through `globalStoredRead`.
- **A nullable map cell's `Map()`** stores into the map's ref niche. The verifier's global store
  rule admits a reference into its own niche (`vfNicheTakes`). Self-tests:
  `record-into-its-niche-global` (holds) and `other-record-into-niche-global` (refused, rule 2).
- **A narrowed arm's initializer** is delivered at the cell, and the unbox is the delivery's own.
  The blanket `arm unbox` skip is gone. D15719 matches. The other three name narrower classes
  (`box pass`, `ref if arm rep`).

## Measured, master → head

Same programs and probe both sides; the head's seven sweep files are not in the list.

| reading | master | head |
|---|---:|---:|
| start bodies claimed, tests/cases | 7,707 | 7,727 |
| start bodies claimed, witnesses | 4,957 | 4,966 |
| start bodies claimed, distilled | 9,705 | 9,710 |
| `global initializer *` start misses, tests/cases | 39 | 13 |
| `global initializer *` start misses, witnesses | 17 | 5 |
| `global initializer *` start misses, distilled | 1 | 0 |
| functions newly unclaimed, any population | | 0 |
| armed shadow (`$VL_IR_SHADOW=1`) mismatch, fail and fallback rows, all 27,421 programs | 26 | 26, the same rows |

Nine starts move to another lane's class: `array element coercion` 3, `box pass` 2, and one each of
`member record`, `index element coercion`, `rep unsup`, `ref if arm rep`, `box ladder` and
`expression if arm prelude unwalked`.

## Left in the family

- `global initializer atom assignment` (9 programs): the IR's start body uses a local the start
  frame does not declare, so the claim fails validation and falls back.
- `global initializer variant coercion` (2), `nulnone if` (2), `rep` (2) and `widen join` (2, the
  adoption case D16496).

## Legacy tails the IR calls

- `monoGenericAliasFe` (`emit_mono.vl`), the alias arm's function.
