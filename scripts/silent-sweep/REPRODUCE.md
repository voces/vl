# Reproducing the silent-class sweep

Everything here regenerates from source; the cell programs and the per-cell result files are
deliberately NOT committed (28,880 files / 118 MB). `main2.csv`, `G.csv` and `sab.csv` are
the graded records of the runs the inventory reports.

Findings live in `docs/internals/silent-class-inventory.md`.

## Resource discipline

`sweep.sh` fans **exactly four** concurrent `vl` invocations (`xargs -P4`) and nothing here
raises that. `vl check` peaks around 650 MB RSS; do not widen it.

## Run it

From the repo root, after `bash scripts/agent-setup.sh`:

    # main grid: rep x nullability x position x construct x runtime input  (9,126 cells)
    python3 scratch-silent/gen.py       scratch-silent/cells2
    bash    scratch-silent/sweep.sh     scratch-silent/cells2 scratch-silent/res-main2
    python3 scratch-silent/grade.py     scratch-silent/cells2 scratch-silent/res-main2 \
            --csv scratch-silent/main2.csv

    # declaration-ORDER grid  (219 cells)
    python3 scratch-silent/genorder.py  scratch-silent/cellsG
    bash    scratch-silent/sweep.sh     scratch-silent/cellsG scratch-silent/res-G
    python3 scratch-silent/grade.py     scratch-silent/cellsG scratch-silent/res-G \
            --csv scratch-silent/G.csv

    # grader sabotage — MUST report 12 wrong_value / 8 wrong_evalcount / 6 trap / 4 correct
    python3 scratch-silent/sabotage.py  scratch-silent/sab
    bash    scratch-silent/sweep.sh     scratch-silent/sab scratch-silent/res-sab
    python3 scratch-silent/grade.py     scratch-silent/sab scratch-silent/res-sab \
            --csv scratch-silent/sab.csv

## Read it

    python3 scratch-silent/counts.py scratch-silent/main2.csv scratch-silent/G.csv
    python3 scratch-silent/final.py  scratch-silent/main2.csv scratch-silent/G.csv
    python3 scratch-silent/verify.py scratch-silent/main2.csv scratch-silent/G.csv
    python3 scratch-silent/pivot.py  scratch-silent/main2.csv rep pos nul=1,leg=A
    python3 scratch-silent/pivotG.py scratch-silent/G.csv

## The hand-written probe rounds

Each `mkprobes*.py` / `mkrepro*.py` writes a directory of small programs; run them with the
same runner and read them with `summ.py`:

    python3 scratch-silent/mkrepro.py      # then mkrepro2/3/4, mkprobes..mkprobes5
    ls scratch-silent/repro/*.vl | xargs -P4 -I{} \
        bash scratch-silent/runcell.sh {} scratch-silent/res-repro
    python3 scratch-silent/summ.py scratch-silent/res-repro

`mkrepro.py` holds the minimal repro + working control for each filed defect and the
confirmation probes for the shapes retired in the inventory's "Not a defect" section.
`probe1.vl` is the rep-vocabulary validation: every representation the grid uses, spelled
once, so a spelling error is caught before 9,000 cells inherit it.

## Invariants the harness holds

* **One result file per cell** (`runcell.sh` writes `<cell>.res`, never appends to a shared
  file), so `-P4` cannot tear a record.
* `grade.py` prints `cells=N result_files=N MATCH=OK` and counts a missing result as its own
  column — a truncated sweep is loud, not a smaller population.
* Cells are graded on the **run value**, never the build verdict.
* `runcell.sh` runs a third `vl build` stage only when the run stage failed, to separate a
  COMPILER trap (no module written) from an emitted-program trap (module written).
