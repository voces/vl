## Type system (Track A)

- **Filed D17034:** inside a generic, `is` narrowing to the arm of a recursive union that refers back to the union (`{ kids: Tr<T>[] }`) does not narrow, so the arm's field is refused; the concrete, non-recursive and discriminant spellings run.
