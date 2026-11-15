## Type system (Track A)

- **A literal `const` read beside a radix literal is typed by its value** (T2.4): `const x = 3000000000; 0xFFFFFFFF & x` is `3000000000` (was `-1294967296`), and an `i64`-spelled tree whose value fits `i32` reads at `i32`. The oracle follows T2.4, and D14990 for a radix-tree `const`, which it computes at each read's width.
