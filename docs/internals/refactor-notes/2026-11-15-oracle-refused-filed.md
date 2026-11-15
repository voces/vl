# Oracle fuzz: REFUSED-FILED (2026-11-15, lane O)

The oracle's `diff` verdict had no way to tell a loud, filed compile refusal from a miscompile:
both were COMPILED-BAD. Since #8318, fuzz.sh fails on every COMPILED-BAD cell known.txt does not
list, so the `hof` generator's D16412 and D16411 refusals would red the nightly by cell id.

## Rule

- known.txt keeps cell lines (`<cell>  # comment`) and gains row lines:
  `D<id>  <fragment of the refusal's sentence>`, one line per row.
- `oracle.ts diff`: a cell is REFUSED-FILED when the judge would say COMPILED-BAD, the compile
  failed with an `emit error`, and its error contains a row's fragment. The report prints one count
  per row, not one line per cell.
- A compiler trap or a wrong value never matches a row, so it stays COMPILED-BAD and needs its
  cell ids listed.
- fuzz.sh takes the first word of each known.txt line as its id.

## Measurement

`scripts/oracle/fuzz.sh --seeds 10 --count 100 --gen hof` on master `d31ab4440`:

    REFUSED-FILED D16411: 14 cell(s)
    REFUSED-FILED D16412: 357 cell(s)
    oracle: 1000 cells, 1000 in subset (100.0%), AGREE 627, COMPILED-BAD 2, REFUSED-FILED 371; 0 new disagreement(s)

Exit 0. The two COMPILED-BAD cells (`ho_s3_0015`, `ho_s9_0097`) are a compiler trap, filed as
D16493 and listed by cell id. Without the two row lines the same cases give COMPILED-BAD 373, 371 of them unlisted, and fuzz.sh exits 1.

The D16411 fragment is that row's full sentence, so another arm of the same "called at two
signatures" refusal stays COMPILED-BAD until a row names it.
