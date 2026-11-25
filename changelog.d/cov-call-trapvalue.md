## Codegen, memory & runtime (Track B)

- **IR claims `__trap__` read as a value:** an arm that exits inside a value `if` or `match` (`const y = if c { return -7 } else { null }`), whose value the rewrite spells `__trap__()`, and the bare `__trap__` bound as a function value. The call reached the numeric-intrinsic table and missed there as `intrinsic none`. It is now its message streamed, then legacy's `unreachable` (`trapCallRhs`, `RDeadNever`). A returned trap writes no `return` after it, as legacy writes none. `intrinsic none` falls from 11 rows to 0.
