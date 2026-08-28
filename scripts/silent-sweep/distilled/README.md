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

## Cost

```
full census   ~35 min   (~500,000 vl invocations)
distilled       ~8 s    (2,954 vl invocations, JOBS=6)
```

It is therefore IN the gate (`scripts/gate.sh`), not beside it.

## Using it

```sh
python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm
python3 scripts/silent-sweep/distilled/regress.py build/vl-compiler.wasm --write-baseline
```

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
misses in 17 trials, which is strong evidence and not a proof. Re-distilling after each full
sweep is what keeps that risk falling instead of growing.
