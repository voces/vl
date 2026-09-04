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
    python3 scripts/day-one/sample.py --control              # the five controls

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
| `render.py` | plan + axis faces → one program; `make_pair` is the unit |
| `sample.py` | draw, grade, tabulate, JSONL, `--replay`, `--control`, `--report` |
| `minimise.py` | greedy line removal to a minimal witness, then ablation BY AXIS |
| `file_row.py` | a minimal witness → an inventory row draft + a standing capability probe |

Grading is `scripts/capability-probes/run.py`'s, imported and not copied, so a day-one
cell and a hand-written probe are read on one scale.

## The controls are SYNTHETIC, on purpose

`--control` grades five pairs. Three are synthetic and rest on rules the design will always
enforce — a type error, a bounds-checked index, an exact output contract — and they are what
prove the sampler can still SEE and CLASSIFY a disagreement. Two are closed rows (D1473,
D1500) kept as AGREE pins.

**A control built on a live defect evaporates the day the defect is fixed.** This suite used
D1473 for liveness, D1473 closed two days later, its pair started grading `AGREE`, and the
gate read a closed row as a broken instrument for six CI rounds. A closed row belongs on the
agree side; liveness belongs on something nobody can fix.

## Adding to the grammar

Add a record to `VALUES`, `SOURCES`, `POSITIONS`, `SCOPES` or `SCENERY` — nothing else
needs touching, and `tests/vl_day_one_sampler_test.ts` will tell you if an axis you add
cannot be generated. Weight toward what a TUTORIAL would contain: the 1-in-20 rate came
from programs written to be ordinary, and the hit was the most textbook shape in the
batch. A grammar that optimises for coverage of the type lattice drifts exotic and the
rate falls.
