## Codegen, memory & runtime (Track B)

- **IR coverage: a boxed `U | null` read narrowed to one variant.** A disc-4 nullable box local
  that a narrowing delivers at one variant's record is read as the box it holds and unboxed to
  that variant, as legacy's `emitVariantCoerce` box arm writes it; the IR claimed only a plain
  box local there. No emitted byte moves.
