# The day-one sampler — ordinary programs, generated in PAIRS

Every other instrument in this repo samples a population somebody already named. A
capability probe is one hand-written program per KNOWN gap. The distilled corpus is
generated over FIXED axes. The position matrix takes a template. **None of them can find a
shape nobody thought of** — and on 2026-09-03 twenty ordinary hand-written "day-one"
programs found one in the first ten (D1473).

This directory generates that population instead of writing it.

    python3 scripts/day-one/sample.py --seed 1 --count 40
    python3 scripts/day-one/sample.py --seed 1 --count 400 --out run.jsonl
    python3 scripts/day-one/minimise.py run.jsonl
    python3 scripts/day-one/file_row.py run.jsonl --index 7 --title "…"
    python3 scripts/day-one/sample.py --replay run.jsonl     # the regression half
    python3 scripts/day-one/sample.py --imports-report run.jsonl   # D1514's timing shape
    python3 scripts/day-one/sample.py --control              # the controls

Full rationale, the axes, what it cannot sample, and the first sample's numbers:
**`docs/internals/day-one-sampler.md`**.

## The unit of generation is a PAIR

Two spellings of ONE program, differing along ONE axis, both printing a value the
generator computed in Python. The primary verdict is **agree / disagree**, not
runs / refuses, and that is what makes a hit self-validating: the spelling that RUNS
proves the other one is legal, so nobody has to judge whether the design permits it.

It also triages itself. One spelling runs and the other does not → a **defect with its
control attached**. Both fail identically → a **missing feature or a design question**,
listed separately for a human. Both run → no signal, but the line still records what was
varied, because an `agree` with no delta recorded cannot be told from an axis the sample
never reached.

## The files

| file | what it is |
| --- | --- |
| `grammar.py` | the ordinary shapes, as DATA — values, reads, positions, sources, scopes, scenery, axes |
| `modules.py` | the `modules_split` axis's OWN grammar — one program as one file and as two |
| `imports.py` | the `imports_pair` axis's OWN grammar — one std import against two in a module |
| `render.py` | plan + axis faces → one program; `make_pair` is the unit |
| `sample.py` | draw, grade, tabulate, JSONL, `--replay`, `--control`, `--report`, `--imports-report` |
| `minimise.py` | greedy line removal to a minimal witness, then ablation BY AXIS |
| `file_row.py` | a minimal witness → an inventory row draft + a standing capability probe |

Grading is `scripts/capability-probes/run.py`'s, imported and not copied, so a day-one
cell and a hand-written probe are read on one scale.

## The controls are SYNTHETIC, on purpose

`--control` grades eleven pairs. Four are synthetic and rest on rules the design will always
enforce — a type error, a bounds-checked index, an exact output contract — and they are what
prove the sampler can still SEE and CLASSIFY a disagreement. The rest are AGREE pins: closed
rows (D1473, D1500, D1593, D1595, D1596) and one per generator axis, proving its renderer
still builds both faces.

**AN AGREE PIN'S CONTRACT IS WRITTEN OUT, NEVER TAKEN FROM THE RENDERER IT PINS.** The
`imports_pair` pin first read its `want` from the same `render` call it was grading, and a
sabotage that made the two-import face drop its second import passed — both faces rendered
the same program AND the same expectation. Spelled by hand, the same sabotage names it.

**A control built on a live defect evaporates the day the defect is fixed.** This suite used
D1473 for liveness, D1473 closed two days later, its pair started grading `AGREE`, and the
gate read a closed row as a broken instrument for six CI rounds. A closed row belongs on the
agree side; liveness belongs on something nobody can fix.

## A GENERATOR AXIS BRINGS ITS OWN GRAMMAR

Most axes flip one face on a plan drawn from `grammar.py`'s tables. `modules_split` cannot:
its two faces differ by the NUMBER OF FILES, and the shapes worth generating there — a
module's loop variable colliding with the importer's block `const`, a hole parameter called
across the import, an exported `type` read annotated and un-annotated — are not a face of
any single-file plan. So its record in `AXES` carries `"generator": "modules"`, `render.py`
delegates to `modules.make_pair`, and its split face is one source string carrying
`// file:` markers — the same spelling `scripts/check-filed-witnesses.py` grades a two-file
witness with, so a hit can be pasted into an inventory row without being re-typed.

`imports_pair` is the second, and what it varies is the IMPORT LIST: one std module against
two in the same file (D1514 — `std:fs` 18 ms alone, `std:array` 40 ms alone, both together
5,006 ms). Its TIMING half needs a third program, the second module ALONE, which no pair can
carry — so `--imports-report` re-renders alone(A), alone(B) and together(A,B) from a saved
sample's spec, times `vl build` on each, and flags a pair above 3× the sum.

## Adding to the grammar

Add a record to `VALUES`, `SOURCES`, `POSITIONS`, `SCOPES` or `SCENERY` — or to `modules.py`'s
`UNITS` / `REPORTS`, or to `imports.py`'s `MODULES` — nothing else needs touching, and
`tests/vl_day_one_sampler_test.ts`
will tell you if an axis you add cannot be generated. Weight toward what a TUTORIAL would contain: the 1-in-20 rate came
from programs written to be ordinary, and the hit was the most textbook shape in the
batch. A grammar that optimises for coverage of the type lattice drifts exotic and the
rate falls.
