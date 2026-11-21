## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` arm tag test over a box value.** `v is T` over a union box that is not a local's own slot (a call result, an element) is the receiver's value and legacy's shared tag compare (`boxTagIsTail`), which the IR's `RTest` lowers through. A record's box field stays a named miss.
