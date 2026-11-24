## Codegen, memory & runtime (Track B)

- **IR coverage, `atom cell local rep`:** a `const` joining two const-bound literals, which legacy holds as the joined set's atom though the checker types it `string`, is declared at that set (`letAtomCellTy`, built from `letBindIsAtom`'s own rungs), so its reads that want its text decode it as legacy does; a compare over it misses by name. In tests/cases, `uncovered atom cell local rep` 19 → 2; no legacy bytes moved.
