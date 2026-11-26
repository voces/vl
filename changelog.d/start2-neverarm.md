## Codegen, memory & runtime (Track B)

- **IR claims a reference `if` whose arm is a never-returning call:** the call is the arm's statement, and its lowering already ends in `unreachable`, as legacy writes it. `ref if never arm` falls 2 → 0: `match/never-first-arm-nullable-record-binding.vl` (`h`) and D3354's witness are fully claimed. Claimed and claims-off builds are byte-identical.
