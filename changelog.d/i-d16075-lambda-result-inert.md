## Codegen, memory & runtime (Track B)

- **D16075 (clause 1):** a lambda returning a generic function at an annotated type (`const m: () => (x: i32) => i32 = () => inc`) no longer traps with `indirect call type mismatch`: value reach recognises a renamed lambda again, so the returned generic is not stubbed, and the program is now a loud emit reject.
