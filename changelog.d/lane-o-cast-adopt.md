## Infrastructure (Track F)

- **The oracle follows four cast and adoption rules it skipped** (T's discovery list):
  - A radix pattern wider than 32 bits is `i64` at an `i32` use (T2.3).
  - A constant that does not fit its `i32` peer widens the peer (D3043).
  - A constant stored into a declared container is typed at its element.
  - `as%` to a float, and a constant cast that can never succeed, are refusals (E8.4, E8.2).
- Distilled corpus: AGREE 11142 → 11149; arith fuzz subset 1593 → 1648, all AGREE.
