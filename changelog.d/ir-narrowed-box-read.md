## Codegen, memory & runtime (Track B)

- **IR: a union-box local read at a narrower or nullable union's box is the same box (`narrowed read`).** A `R | i32 | null` local narrowed past its record reads at `i32 | null`'s boxed nullable, and a box read into a `… | null` destination reads as itself. Both are the union box struct, and legacy reads the local as it stands. The builder's box rung (`boxNarrowArmOf`) now takes any box-shaped rep on both sides (`heldAsBox`), not only a union's own box, and the verifier admits that staged view. Legacy bytes are unchanged.
