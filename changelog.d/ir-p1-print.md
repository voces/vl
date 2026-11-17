## Codegen, memory & runtime (Track B)

- **IR P1, `print`:** legacy's `print` takes its arm from one shared decision (`printArmOf`),
  and its string and scalar tails are shared. The IR builds a `print` statement of a string or
  a scalar through those tails, so the host's own float formatting stays the writer. No emitted
  byte moves.
