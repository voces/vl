## Codegen, memory & runtime (Track B)

- **IR I8b+N1 part 1, boxed nullables:** an `i32 | null`-style boxed nullable is an IR value rep,
  and a value the checker records boxed at a delivery goes through `RToBox`, lowered by legacy's
  own box writer with the IR supplying the value (the value hole). The IR covers 411 more corpus
  functions, every one matched. A union result built in legacy's return sink stays a named miss.
  No emitted byte moves.
