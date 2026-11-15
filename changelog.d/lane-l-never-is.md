## Type system (Track A)

- **The D16047 never-match ruling implemented:** an `is` whose type can never match its operand's declared type is a warning, not a check error; the test is `false`, and the arm it guards (`if`, `while`, the right of `&&`) reads the operand as `never`. **D221** and **D228** re-graded to runs.
