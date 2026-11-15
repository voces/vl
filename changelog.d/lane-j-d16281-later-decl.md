## Type system (Track A)

- **A re-pointed `let` of generics declared below it narrows at each write:** `let f = gA`,
  `f = gB`, `g = f`, then `f(2)` and `g(true)` printed `2` and `1` when `gA` and `gB` were
  declared after the calls; it now prints `2` and `true`, as with them first (unfiled: D16281).
  Six of the 21 declaration-order cells with no slot fact, and seven clause-1 movers in all,
  stop moving (D16301).
