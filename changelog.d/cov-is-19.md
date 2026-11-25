## Codegen, memory & runtime (Track B)

- **IR claims an operand followed by a box that leads its own span** (an assignment boxed into a union, `two(b, b = 2)` or `"\{b} \{b = 2}"`, and a tagged function set's dispatch in an interpolation hole, D17564's spelling). The lowering writes the earlier operands first, as legacy does. The `value-after-a-lead-*` programs and D17564's fixture now match in full.
