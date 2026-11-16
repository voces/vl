## Codegen, memory & runtime (Track B)

- **IR I8b part 2, the union return sink:** a function whose union result legacy builds in one
  shared return sink is now lowered by the IR the same way, through legacy's own sink helpers. The
  IR covers 144 more corpus functions, every one matched. A boxed call stays a named miss until a
  divergence in legacy's box ladder is traced. No emitted byte moves.
