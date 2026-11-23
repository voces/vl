## Codegen, memory & runtime (Track B)

- **IR coverage: a `.map`/`.filter` callback yielded by a call** (a plain function value, `fnValuePlain`), such as a re-pointed hole function read through its cell. It is an ordinary operand, written after the receiver's store as legacy writes it. A callback chosen by an `if` stays legacy's.
