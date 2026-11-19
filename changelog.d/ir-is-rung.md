## Codegen, memory & runtime (Track B)

- IR: an instance's `is` test over a union box lowers by the box's tag, narrowed or not, and an
  `if` guarded by a tag the box cannot hold writes no then arm, as legacy does; about 500 more
  corpus functions are claimable (30,703 → 31,207 of 45,675).
