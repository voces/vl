## Infrastructure (Track F)

- **The oracle fuzz separates a filed refusal from a miscompile.** A compile that fails with a refusal a
  `scripts/oracle/known.txt` row names (`D<id>  <fragment>`, one line per row) is `REFUSED-FILED`,
  counted per row. A trap or a wrong value is still `COMPILED-BAD`. A 1,000-case `hof` run:
  627 AGREE, 371 REFUSED-FILED (D16412 357, D16411 14), and 2 COMPILED-BAD, both now filed as
  D16493, a compiler trap.
