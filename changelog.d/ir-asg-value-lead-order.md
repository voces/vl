## Codegen, memory & runtime (Track B)

- **D17109 closed:** an assignment used as a value after an earlier operand that reads the same variable no longer sees the stored value early. `two(b, b = 2)` printed `22`, as did a record field, an array element and `==`. The IR now declines the function, and legacy writes the operands left to right.
