# Oracle: a refusal is never agreement (2026-11-15, lane O)

#8430 found generators whose every program `vl check` refused, and all of them read as AGREE.
`judge` mapped a check refusal to AGREE whenever the oracle did not fault. This PR shuts that
door twice.

## Verdict

A refusal is AGREE only when the oracle faults too. A refused program the oracle runs, to output
or to a trap, is REFUSED, unless its output matches a corpus expectation (ORACLE-RUNS-REJECTED,
as before). The report counts REFUSED in its own column. It is not a disagreement, so the exit
code is unchanged.

`oracle.ts distilled` on master `55151b054`'s seed: 415 cells move from AGREE to REFUSED, leaving
AGREE 10741, REFUSED 415, ORACLE-RUNS-REJECTED 521, SKIP 466, 0 new disagreements.

## Generator ceiling

Every generator's header says its programs pass `vl check`. `fuzz.sh` now counts, per
generator, the cases whose compile failed with `type error` or `parse error`. It fails the run
when that share passes the generator's ceiling. The default is 2% (`REFUSAL_MAX_PCT`).

`--seeds 10 --count 200 --gen all`:

    oracle: refused ar 1183 of 2000 (59%, ceiling 62%)
    oracle: refused da 0 of 2000 (0%, ceiling 2%)
    oracle: refused ho 104 of 2000 (5%, ceiling 7%)
    oracle: refused rep 0 of 4000 (0%, ceiling 2%)

The arith share is 59% at 2,000, 2,200 and 2,400 cases, and it was the same before the flag day.
Its refusals are mostly constant subtrees the checker folds and refuses:
- a float that is not whole at an integer;
- a constant outside `i32`;
- a shift count out of range or negative;
- a zero divisor;
- `f64` delivered to `f32`.

Only 41% of arith cases test anything. The arith and hof ceilings are debts, to be lowered as the
generators are fixed: arith by not emitting what the checker folds and refuses, hof once its 5%
is triaged as either a generator bug or a clause-2 refusal.

Control: the data generator from `55151b054` (before #8430) gives
`refused da 200 of 200 (100%, ceiling 2%)` and exit 1.

## known.txt

At `--count 200`, hof cases `ho_s1_0156`, `ho_s3_0148`, `ho_s7_0162` and `ho_s9_0129` trapped the
compiler with `ho_s3_0015`'s stack (D16493); runs at `--count 100` never reached them. On master
after #8398, all six cells are loud D16412 refusals (REFUSED-FILED), so none is listed:

    REFUSED-FILED D16411: 25 cell(s)
    REFUSED-FILED D16412: 746 cell(s)
    oracle: 2000 cells, 2000 in subset (100.0%), AGREE 1125, REFUSED 104, REFUSED-FILED 771; 0 new disagreement(s)
