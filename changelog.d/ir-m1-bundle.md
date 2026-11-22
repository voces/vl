## Codegen, memory & runtime (Track B)

- **IR coverage: returned bundle records held at module scope.** A call legacy returns a bundle record from is of its callee's `resultTy` (`fnRetHeldAsBundle`), a holding global's cell is its `holderRecordTy` and its reads take that record (one `holderReadTy` for local and module holders, #9536's route): tests/cases function bodies +12, start bodies +10, programs fully IR-only 4,278 → 4,284.
