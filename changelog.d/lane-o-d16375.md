## Type system (Track A)

- **D16375 closed:** a constant tree under `>>>` whose left side is negative folds its exact operands, so `(-7 % (65536 * 65536)) >>> 1` prints `2147483644` instead of trapping on a divide by zero; the `>>>` computes at the operands' default i32, or at an i64 destination's width.
