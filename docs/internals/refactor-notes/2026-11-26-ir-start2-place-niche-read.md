# START-2: `pre-path niche read` (2026-11-26)

Census restricted to the class's four programs, master 7d3f3e55: 7 → 0.
`unions/value-union-cell-elimination.vl` and `unions/value-union-boolean-survivor-null-test.vl`
are fully claimed; the two `narrowed-nullable-*-out-of-union-box-positions.vl` sweeps keep one
unit each on `read of w` (a capture, COV-CLOS's). `ir-parity --run-all`: all four byte-identical
claims-off.

Two mechanisms:
- `placeNicheRead`: the place built at its storage (`exprAtPre` past the pre-path, under
  `storageReadEnter`), then `RNicheRead` at the niche kind `placeNicheAtomKind` names;
- `getField` asks a storage-built read's field index under the same storage mark it lowers the
  tail under (`gfStored`).
