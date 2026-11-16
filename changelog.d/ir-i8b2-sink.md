## Codegen, memory & runtime (Track B)

- **IR I8b part 2, the union return sink:** a function whose union result legacy builds in one
  shared return sink is now lowered by the IR the same way, through legacy's own sink helpers. The
  IR covers 144 more corpus functions, every one matched. The IR no longer takes a block body's
  last statement as its value (D16861): such a body runs past it to `null`, and is a named miss
  until the IR writes that `null`. No emitted byte moves.
