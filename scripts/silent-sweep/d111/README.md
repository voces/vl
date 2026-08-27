# The D111 / D117 grid, and its ablation

The 1,710-cell grid that closed `silent-class-inventory.md` **D111** and **D117** and filed
**D131** out of its residue. Kept because the closing numbers in that document — **72 moved,
0 backward, 0 message-only** — and the two-root / three-edit split are only claims if the
population cannot be re-run.

```sh
python3 scripts/silent-sweep/d111/gen111.py /tmp/d111cells
python3 scripts/silent-sweep/d52/sweep52.py /tmp/d111cells <seed.wasm> /tmp/tsv/<name>.tsv --jobs 6
python3 scripts/silent-sweep/d111/ablate111.py /tmp/tsv <base> <full> <name>...
```

`sweep52.py` is reused verbatim — it takes the seed as an argument and reads `manifest.tsv`,
so it is generic over the cell directory, and using ONE grader across this family is what
makes the residues comparable. **Its expectation is computed by the generator, never by the
compiler**: every cell prints exactly one line the generator already knows, so a module that
loads and answers wrong grades `wrong_value` rather than `runs`. (This grid's first pass used
a home-made rc-only grader and could not have seen a `wrong_value`; there are none, but that
is now a measured fact rather than an unasked question.)

## Why these axes

- **`decl`** — the declared CLAIMANTS for the layout `{r: i32}`: `nodecl` / `plain` (one) /
  `plaintwin` (two) / `arm` (the layout is a union member, so `collectS` skips its `sNames`
  row) / `armtwin` / `armdiff`. D100's axis is the SECOND claimant and **D111's is the
  FIRST**, so a grid holding `decl` fixed cannot tell the two rows apart — which is how D111
  came to be filed out of D100's close rather than with it.
- **`route`** (`plain` / `gen` / `std`) — `gen` is the coordinate where the guard fix ALONE
  goes backward, and the whole reason this grid exists in the shape it does. The `std` leg
  reaches the monomorphizer through an IMPORT rather than a local declaration.
- **`value`** (`allnull` / `mixed` / `empty` / `single` / `nestedempty`) — THE PROBE VALUE,
  and this axis exists because D117 was found by one: its defect is invisible to every value
  but `allnull`, and ten cells of an earlier PR read as backward moves until a non-null value
  separated them. Vary probe VALUES, not only shapes.
- **`nul`** — the `bare` (`T[]…`) rows hold a `null` in a NON-nullable list and are LOUD CHECK
  rejects by construction. They are the grid's own assertion that the checker still refuses
  what it should; that set is byte-identical between master and the branch.
- **`depth`** — 1-D is the control: every 1-D niche form already ran on master, so a fix that
  moved one would be moving something it has no business moving.

## The ablation, and what it is for

`ablate111.py` (the `d94` reader, retitled) takes one TSV per candidate compiler and reports
the per-candidate moved set split BY DIRECTION, every pairwise intersection, whether the union
of the singles is set-identical to the full branch's, and cells whose OUTCOME is unchanged and
whose MESSAGE is not.

Measured against master **`e67347aa`** (fixpoint 1451054 bytes). Every compiler in this
table was REBUILT on that base rather than carried over from the `7b600b57` run this
grid was first taken on — #1960 landed in between and moved 882 cells across two other
grids. **Stripping all three patches out of the merged tree reproduces `e67347aa`
byte-for-byte**, which is what says the three are the whole compiler delta and that the
`base` column below is master and not an approximation of it. Every number is unchanged
from the pre-merge run, cell for cell.

| compiler | what it adds | runs | loud emit | invalid wasm | moved | to `runs` | to SILENT |
|---|---|---|---|---|---|---|---|
| `base` | master `e67347aa`                              | 1085 | 88 | 24 | — | — | — |
| `A1`   | `monoAnnPinName`'s bare inline-shape rung       | 1093 | 80 | 24 |  8 |  8 | 0 |
| `A2`   | `letAnnIsUninternedShape`'s D53 bridge          | 1101 | 64 | 32 | 24 | 16 | **8** |
| `B`    | `recordElemRepArrayLit`'s array-element descent | 1125 | 48 | 24 | 40 | 40 | 0 |
| `FULL` | all three                                       | 1157 | 16 | 24 | 72 | 72 | 0 |

All three pairwise intersections are **EMPTY**, and 8 + 24 + 40 = 72 = |FULL moved|,
set-identical. **The composition is a DIRECTION, not a cell count**, which is the one thing a
"union of the singles" check does not by itself say: `FULL` disagrees with `A2` on exactly the
8 cells `A2` moves to `invalid_wasm`, and every one is `d111_*_ann1_local_gen_*`. A2 alone is
a loud→silent trade and is not licensed; A1 is what makes it a loud→`runs` one. `A1`'s own 8
are `ann2 × global × gen` — a MODULE-SCOPE nullable inline shape, where the `LetDecl`-local
guard A2 fixes never fires at all.

`loud_check_reject` is **513 on every one of the six compilers, cell for cell** — the
checker's refusals are untouched.

## The residue, filed rather than left

Each item says which KIND of thing it is, because a documented DECLINE and an unfiled
DEFECT read identically in a residue paragraph and one of them is a row somebody owes.

- **A ROW — 24 `invalid_wasm`, all `d111_*_ann1_field_*`**, unmoved by every one of the
  five candidates and by the #1960 merge (the same 24 cells by name before and after):
  a nested-struct FIELD read RETURNED from an un-annotated function. Filed as **D131**.
  It is not the inline shape (a nominally-typed field reproduces it) and not the twin
  (it fires at `decl=nodecl`).
- **A DOCUMENTED DECLINE — 16 `loud_emit_reject`, all `ann2 × std`**: `emitProgram: a
  nullable-{r:i32} list element has no rep; use a non-null element type`, reached by this
  grid's own `std` harness line (`const xs: ({r:i32} | null)[]`) rather than by the row
  under test. `collectA`'s kind-2 arm rejects it on purpose — *"has no list rep: the box
  lowering would emit the element's raw value (invalid wasm). Reject cleanly"* — and the
  message carries the remedy.
- **DOCUMENTED DECLINES / GRID CONTROLS — all 513 `loud_check_reject`s**: 189 are
  `cannot compare X with null` on the `bare` rows, which is the grid asserting that the
  checker still refuses a `null` in a non-nullable list; 108 are `'mk' infers the nullable
  return type {r: i32} | null`, the checker's documented decline for an inferred nullable
  inline-shape return and the reason `ann2 × ret` never reaches the emitter; the rest are
  the `bare` field/return assignability refusals. The set is **513 on all six compilers,
  cell for cell**.

## Re-graded populations

A backward count is a property of the GRID that produced it, so the two larger populations in
this family were re-run against the same pair of seeds rather than carried over:

| grid | master `e67347aa` | branch | moved | backward | message-only |
|---|---|---|---|---|---|
| D52, 9,450 cells  | 7424 runs / 2026 loud / **0 silent** | 7620 / 1830 / **0** | **196** | 0 | 0 |
| D87, 3,144 cells  | 3126 runs / 18 loud / **0 silent**   | 3126 / 18 / **0**   | **0**   | 0 | 0 |

Both were re-run against the merged pair of seeds, not carried over; both are identical
to the `7b600b57` run.

D52's silent population has been empty since #1957 and stays empty; 196 more of its loud cells
close. D87's grid moves nothing at all, which is what says the change is inert where it is not
the answer.
