## Type system (Track A)

- **A top-level statement checks the later-declared functions it reaches first:** as an early
  function's body already did, except a function whose fact comes from that statement (an
  un-annotated parameter, a module `let` it reads, a call cycle). `print(k(1.5, gid)[0])` with
  `gid` declared after it built an invalid module and now prints `1.5` (D16413); the
  declaration-order movers fall from 165 to 85, the clause-1 ones from 17 to 6 (D16301).
