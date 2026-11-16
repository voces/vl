## Codegen, memory & runtime (Track B)

- **IR cutover C2a, the list frame is shared:** the IR lowering writes its locals vector with
  legacy's own writer, and grows the lazy list frame through legacy's own find-or-append, rather
  than copying legacy's frame after the fact. With `list` admitted, claims no longer fall back
  (before: 399 corpus cells), and no emitted byte moves.
