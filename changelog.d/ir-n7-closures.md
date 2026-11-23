## Codegen, memory & runtime (Track B)

- **IR coverage, closures:** a `for` over a list of closures, a `.map`/`.filter` whose callback captures, and a cached closure environment holding the frame's own capture now build through the IR, byte-identical to legacy. tests/cases +82 covered = matched; fully IR-only programs 5,431 → 5,477.
