## Infrastructure (Track F)

- IR object-field deliveries. A join of record literals delivered at a declared record is now
  built at that record's row, as legacy writes it (D15719). A box narrowed to a record arm goes
  into a record field the way an argument takes it. `object field arm unbox` goes 8 → 0 and
  `object field coercion` 3 → 1, with 0 claims lost.
