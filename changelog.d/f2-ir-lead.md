## Codegen, memory & runtime (Track B)

- **IR coverage:** a `.push` whose value is a short-circuit or other valued `if` onto a list held in its own local is built by the IR, which reads the receiver by index after the value as legacy does (self-compile: 41 more functions covered).
