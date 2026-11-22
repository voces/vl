## Codegen, memory & runtime (Track B)

- **IR coverage, two more arms of the atom hook:** a literal-union value that is no place (a
  call) reaches an atom destination parked once and narrowed by legacy's staged tower, and a read
  of a `const` bound to a literal reaches one as that literal's id. Both build through the tails
  legacy writes them with. No emitted byte moves.
