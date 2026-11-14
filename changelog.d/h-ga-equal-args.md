## Type system (Track A)

- **A recursive generic alias re-applied at an equal argument reuses its instance (D16068).**
  `type L<T> = { v: T, next: L<T | null> | null }` re-wraps `i32 | null` into a structurally
  equal type under a new arena index at each unfolding. The alias memo compared indices, so
  every level was a new instance, and D12131's backstop refused it. An application whose
  arguments equal an open one's now resolves to it, so the alias behaves like the regular
  recursive alias (D3328).
