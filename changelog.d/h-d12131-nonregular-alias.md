## Type system (Track A)

- **A non-regular generic alias is refused, not a checker crash (D12131).**
  `type L<T> = { v: T, next: L<L<T>> | null }` needs a larger instance at every level of its
  expansion, and the checker recursed into it until its stack ran out (`vl check` exit 70). It
  now refuses at the first growing application, naming the alias and the larger application.
  It is a consequence of monomorphization, the type-level twin of D2721: such a type needs
  infinitely many instances. An alias nothing expands is not refused. The
  regular recursive alias is unchanged; its emit refusal is D3328.
