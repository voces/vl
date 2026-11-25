## Codegen, memory & runtime (Track B)

- **IR claims an `is` test and narrowed read of a captured union box inside a closure** (`const c = xs[i]; const f = () => if c is i32 { c + 1 } else { .. }`), lifted or reading its environment, nested two frames deep, over a value or record union.
