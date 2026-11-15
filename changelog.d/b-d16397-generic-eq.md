## Codegen, memory & runtime (Track B)

- **D16397 closed:** `==` and `!=` in a generic body, at an instance comparing two records of one field set stored apart, compare per field pair at the instance. Before, they were refused at emit, or built an invalid module for nullable records. Filed D16450: operands that are field, call or element reads still refuse.
