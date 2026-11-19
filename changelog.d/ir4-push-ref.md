## Codegen, memory & runtime (Track B)

- **IR coverage, a push onto a ref list or a packed byte list:** `pushPlainWhy` no longer
  refuses them, since the IR's push lowering already takes the slot's own scratch base and legacy's
  append tail. The self-compile ships 53 more functions from the IR. No emitted byte moves.
