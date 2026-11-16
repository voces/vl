## Codegen, memory & runtime (Track B)

- **IR N2a, a delivered `null`:** a `null` literal returned or passed into an `i32 | null`-style
  value is boxed by legacy's own box writer through the IR's value hole. The writer may leave an
  IR immediate unread (a `null`, or a literal it writes at the destination width), and the IR
  verifier now checks that an immediate never stands for an expression with an effect. The IR
  covers 495 more corpus functions, every one matched. No emitted byte moves.
