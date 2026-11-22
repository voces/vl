## Codegen, memory & runtime (Track B)

- **IR coverage: a bundle record taken at its one member.** A local holding a returned bundle's record and used at one signature takes that member (`holderMemberTy`), and a closure destination of a record call takes the member legacy picks (`bundleResultPickOf`, lowered as the new `RResultPick`): tests/cases function bodies 68,801 → 68,817, start bodies 5,954 → 5,961, programs fully IR-only 4,284 → 4,292, `open local type` 17 → 5.
