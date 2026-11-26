## Codegen, memory & runtime (Track B)

- **IR claims a global whose union-arm cell is initialized from a plain record of the arm's fields:** `const gn: Node = mkM()` where `mkM(): Node & { v: i32 }` and `Node` is an arm of a union, the record retagged to the variant row as a local's initializer is (`recRetag`, #10210). `global initializer variant coercion` falls 2 → 1 on its programs.
