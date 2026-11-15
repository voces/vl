## Infrastructure (Track F)

- **The oracle agrees with the last five red arith fuzz cells and one trap**, in four families, all oracle-side:
  - an `f32` join folds its float constant arm at `f32` (4.3, Q9);
  - Q8's constant-count rule holds beside an `i32` peer;
  - `as f32` rounds an integer constant (4.1);
  - a radix `/` traps on `INT_MIN / -1`.

  On a 6,000-cell arith fuzz, 96 cells move, all improvements, and only the known D16472 still differs.
