## Type system (Track A)

- **An unwritten collection fits every `is` of its kind (D16047, owner ruling (a1)).** An empty
  `[]`, `Map()` or `Set()` no write pins, in an inferred union return or a local join, answers
  `is T[]` (`is {[K]: V}`, `is Set<T>`) true for every `T`; a write through such a narrowing pins
  its element program-wide, as a direct write does. The inferred union returns D16047 floored lower.
