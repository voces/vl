# The DISTILLED corpus — the census's behavioural content, at 1/169th the size

The census generates 250,238 programs and grades each one. It is a **discovery** instrument
and it did its job: it measured the silent surface at 21,763 cells and fed roughly forty
defect rows. But it was also made a pre-merge gate, and as a gate it cost **~35 minutes** per
merge — base pass plus branch pass, about 500,000 `vl` invocations.

That was the wrong instrument for the job, and the number that says so is the redundancy.

## What was measured

Nineteen graded snapshots of block A survive in the agent worktrees — nineteen different
compilers over the identical 150,224 programs. That is enough history to ask how much any one
program actually tells you.

| | block A |
|---|---|
| programs | 150,224 |
| distinct `(outcome, message)` answers the block can produce | **212** |
| entropy of the outcome distribution | **4.09 bits** per program |
| total raw signal in the block | **~75 KiB** |
| `runs` — one single answer | 60,197 cells, 40% of the block |

Two programs are **behaviourally distinguishable** only if some compiler in the history ever
gave them different answers. Group by that:

| block | cells | snapshots | classes | redundant |
|---|---|---|---|---|
| A | 150,224 | 19 | 343 | 99.77% |
| B | 28,590 | 19 | 526 | 98.16% |
| C | 43,200 | 18 | 339 | 99.22% |
| D | 9,000 | 24 | 171 | 98.10% |
| E | 19,224 | 18 | 98 | 99.49% |
| **all** | **250,238** | | **1,477** | **99.41%  (169x)** |

**Zero singletons in block A** — not one program has behaviour no other program shares. The
median equivalence class holds 20 cells; the largest holds 60,197.

## Why this is not the sampling argument the census README refutes

`census/README.md` computes, correctly, that a random sample cheap enough to be worth taking
cannot see a 12-cell family: catching D211 at 95% confidence needs 22% of block A. It then
concludes there is "no cheap sufficient subset."

That conclusion does not follow, and this corpus is the counterexample. A random sample and an
**equivalence-class collapse** are different objects. The sample is blind because it does not
know which cells are alike; the collapse is built out of exactly that knowledge. The 12 cells
of D211 are not 12 chances to get lucky — they are **one behavioural class**, and one
representative of it is in this corpus by construction.

## The validation — every transition in the history, not a sample of them

For every PAIR of graded snapshots in every block, take every cell that changed
`(outcome, message)` and group those cells by transition kind. Ask whether at least one
distilled representative is among them.

```
TOTAL transition events across every snapshot pair : 2699
covered by at least one distilled representative   : 2699  (100.00%)

  LOUD -> SILENT   (the D211 shape)                :  938/938
  RUNS -> not-runs (the blocking class)            :  856/856
```

And the harder question — does it catch a change it has never seen? Leave-one-out on block A:
distil from 18 snapshots, hold the 19th out, check the held-out compiler's transitions.

```
17 held-out compilers, 1468 distinct transition kinds, 0 missed (0.0%)
```

## The half a collapse CANNOT derive — `named/`

A collapse can only separate what its history separated, and there is a shape of regression it
provably cannot reach. **D272 is the worked example, and it says so from both directions.**

A candidate fix for D209 read **0 backward on 57,492 cells** — census block C, census block D,
a 140-cell adoption grid, `d156`, `d88`, `d112` — and the corpus `cmp` was byte-identical. It
then lost **72 running programs, 36 of them into a silent class.** The axis that found it was
`read` (bare / isnar / nullcmp / **tounion** / **tofld**), and the census does not have that
axis at all: its twelve are `twin union claim store escope annpos cont declness deliv order
pval rep`, and every one of them reads the field **bare**.

So no compression of the census could have caught it — not because the compression is lossy,
but because the population never varied the deciding dimension. Two candidate repairs were
measured and **both scored zero**:

| rule | reps | of the 72 named cells, covered |
|---|---|---|
| behavioural collapse of the D272 grid (1 snapshot) | 34 | **0** |
| axis floor over its four axes | 285 | **0** |
| an axis floor over the census's own 12 axes | 8,311 (5.6x, ~103 s) | would not apply — no `read` axis |

The reason is the same in every row: on today's compiler all 72 cells simply `run`, exactly
like thousands of neighbours. **What makes them worth keeping is not how they behave now but
what a specific candidate DID to them**, and no rule that reads current behaviour can see that.

`named/` therefore holds those 72 cells **whole**. They are `runs` on master, so a future
candidate that breaks one exits non-zero. `redistil.py` rebuilds `cells/` from scratch and
never touches `named/`.

### A second instance, the same day — this is the norm, not the exception

D224's refused candidate closes its witness and costs **207 block-B cells**, every one
`loud emit reject → check-clean invalid wasm`. Checked by name against the corpus: **0 of the
207 is a distilled representative.** Block B has 526 of them, and all 207 collapse into classes
whose representative is some other cell — because on today's compiler these 207 behave exactly
like their class-mates, and only that one candidate separates them.

Two independent instances in a day, from two different agents on two different families, is
enough to treat it as the standing shape rather than a curiosity. **Every refused candidate
that named its price is a named set**, and the price is the thing worth keeping: it is what
stops the next person paying it again without noticing.

These 207 are `loud emit reject`, not `runs`, so they can only ever produce the `→ silent`
REPORT and never the non-zero exit. That is the correct ranking — but a report nobody can
generate is not a report, and before this entry the gate could not generate it.

### The rule

**When a grid or a refused candidate NAMES a set, the set goes in `named/`** — not a collapse
of it, and not the whole grid. `CLAUDE.md` already said to keep named sets around; this makes
the standing gate the place they live, so keeping one stops being a thing someone has to
remember to re-run.

## Cost

```
full census   ~35 min   (~500,000 vl invocations)
distilled       ~7 s    (3,512 vl invocations, JOBS=6: 1,477 derived + 279 curated)
```

It is therefore IN the gate (`scripts/gate.sh`), not beside it.

## Using it

```sh
python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm
python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm --write-baseline
```

Both halves are graded, `cells/` and `named/`, and reported together.

Exit code is 1 **only** for `runs -> not-runs`. Everything else is reported and not blocking:
a program that did not work before and does not work now has not regressed in the sense a gate
should stop the world for. `-> silent` is still printed, and still matters — it is the class
this whole project exists to remove — but it is a thing to read, not a thing to block on.

`cells/manifest.json` carries the GENERATOR's expectation for each cell, never a compiler's,
so `runs` still means "printed what the generator said it should" and a wrong-value cell is
still visible as one. Grading reuses `census/gradecensus.py` unchanged rather than
reimplementing the outcome vocabulary — the two instruments cannot drift apart.

## What the census is still for

Finding new work. Run a full sweep when you want a new population measured — a new axis, a new
outcome, a suspicion that a family exists that nothing has named yet. Then re-distil:

```sh
# after a full census run, rebuild the classes from the new snapshots
python3 scripts/silent-sweep/distilled/redistil.py
```

The corpus is only as good as the history it was collapsed from. A change in a genuinely
untouched area could split a class that all 19 compilers agreed on; leave-one-out scored 0
misses in 17 trials, which is strong evidence and not a proof — and D272 is the instance where
the risk was real, since the deciding axis was not in the population at all. Re-distilling
after each full sweep, and adding every named backward set to `named/`, is what keeps that risk
falling instead of growing.
