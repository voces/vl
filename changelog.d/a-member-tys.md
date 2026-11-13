## Type system (Track A)

- **Union box kinds and membership read the member's type, not its spelling (step 7).** Six `wasmEmit` sites take a member's box kind from `boxAtomKindOfMemberTy`. `boxWidenAtomFor` and `boxNarrowAtomFor` test membership by type (`memberTyIn`), so the box retag and narrow plans carry member types only.
