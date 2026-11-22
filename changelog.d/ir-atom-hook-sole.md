## Codegen, memory & runtime (Track B)

- **IR coverage, a one-literal place at an atom destination:** a place typed by one literal that
  legacy's atom hook narrows to its member's id builds through the IR, by the tail legacy writes
  it with. No emitted byte moves.
