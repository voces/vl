## Infrastructure (Track F)

- **The oracle fuzz separates a filed refusal from a miscompile.** A compile that fails with a refusal a
  `scripts/oracle/known.txt` row names (`D<id>  <fragment>`, one line per row) is `REFUSED-FILED`,
  counted per row. A trap or a wrong value is still `COMPILED-BAD`. A 1,000-case `hof` run:
  627 AGREE, 371 REFUSED-FILED (D16412 357, D16411 14), and 2 COMPILED-BAD, both now filed as
  D16493, a compiler trap.
- **The oracle reads `0xFFFFFFFF as% i64` as `4294967295`**, per D3053's ruling (A) (a bare radix
  literal or a negation chain over one). Another radix tree under `as% i64` is a SKIP: the compiler
  reads those two ways depending on the operator, filed as D16494 for a ruling.
- `known.txt` drops `ar_s26_0112` (D16472 closed by #8314; a host built from master agrees).
