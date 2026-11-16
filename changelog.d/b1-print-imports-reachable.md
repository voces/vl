## Codegen, memory & runtime (Track B)

- **A module that never calls `print` declares no wide-scalar print import:** `__print_i64__`, `__print_f64__` and `__print_f32__` are reserved only when a `print` call exists. A plain build that imports `std:buffer` and never prints declares 4 print imports instead of 7. `-O` builds are unchanged: binaryen already drops imports nothing reaches (emoji-sheep-tag).
