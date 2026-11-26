## Codegen, memory & runtime (Track B)

- **IR claims a short-circuit over a decided `is`:** `a is T && …` / `!(a is T) || …` whose test legacy decides as a constant is a valued `if` whose ruled-out arm is `unreachable`, as legacy writes it. `decided is short-circuit` falls 3 → 0: `unions/hole-is-list-niche-never.vl` (`both`, `either`, `armAnn`) is fully claimed. Claimed and claims-off builds are byte-identical.
