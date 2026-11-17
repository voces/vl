## Type system (Track A)

- Ten call-checking walks in `check_calls.vl` (callee slots, join operands, handed functions, field and alias copies, element hole binds, enclosing declarations) visit each node, binding or type once instead of stopping at a fixed depth.
