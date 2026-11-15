## Type system (Track A)

- **D16476 closed:** a read of a deep `is` receiver in the right operand of the test's `&&`, or of an `||` after its negation, runs (`g is string[] && g.length > 0` over a `Json`); it was refused at the re-check. A read after a guard that leaves when the test fails is filed as D16477.
