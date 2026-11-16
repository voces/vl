## Type system (Track A)

- A cast of a float constant to an integer is a typed value, not a constant: `const x: i64 = (2.0 as! i32) * 2000000000` wraps at `i32` (prints `-294967296`) instead of computing exactly at `i64` (D16670).
- A constant integer division or remainder by zero is refused at check time when the tree holds a radix literal too: `0xFF % 0` is `division by zero in a constant expression`, not a run-time trap (D16673).
