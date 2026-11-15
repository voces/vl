## Type system (Track A)

- **D16390 closed** (owner ruling on spec question 4.2, reversing D14990's `f64` clause): a radix
  constant tree at an `f64` destination or beside an `f64` peer computes at 64 bits, then
  converts, so `let x: f64 = 0xFFFFFFFF + 1000` is 4294968295.
