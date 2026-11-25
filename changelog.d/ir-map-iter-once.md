## Codegen, memory & runtime (Track B)

- **`m.keys()` / `m.values()` evaluate a call receiver once:** a receiver no read can repeat (a call, a field of a call, a method chain) was evaluated three times, once per step of the keys or values writer, so its side effects ran three times. The IR lowering now evaluates it once into a lowering-owned local (`irOnceRefSlot`, scratch code 56) and each step reads that; functions and start bodies that missed on `map iter receiver` are claimed. Recorded as a legacy-wrong divergence in `scripts/ir-divergence-baseline.txt`.
