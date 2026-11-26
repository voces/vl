## Codegen, memory & runtime (Track B)

- **IR claims a returned or passed `if` typed one wider number** (`return if r != null { r } else { 2.5 }` into `i32 | f64`): the join is built at that number, each arm widened, and boxed once, as legacy writes it.
