## Codegen, memory & runtime (Track B)

- **D10351 closed:** a `.map`/`.filter` call read straight off its result under an `is` test, an `as` conversion or in a `match` arm runs: `print([1].map((i) => f(0, 7, "s"))[0] is i32)` prints `true`, where it was `emitProgram: .map/.filter scratch frame not reserved`. The scratch-frame scan now descends into those three forms.
