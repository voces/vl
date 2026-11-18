## Codegen, memory & runtime (Track B)

- **IR B4b, the returned value `if`:** a returned value `if`, and a body whose last statement is
  one, is the statement `if` the IR already builds, each arm's tail value returned and a returned
  one followed by legacy's `unreachable`. `tailIfPlainWhy`, beside `emitIfTail`, names what it
  leaves to legacy. The self-compile ships 343 more functions from the IR. No emitted byte moves.
