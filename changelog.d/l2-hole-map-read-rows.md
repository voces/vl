## Inventory

- **D16794–D16797 filed**: master builds three check-clean programs that fail. A parenthesised `??`
  over a hole map parameter's `get` builds an invalid module when read as `f64` (D16794) and traps
  the compiler as an arithmetic operand (D16795). The same read refuses at emit for `.length`
  (D16797). A hole parameter given a nullable record wider than its `??` default builds an invalid
  module (D16796). Found while grading the S3.4a lift of the read-only map floor.
