## Codegen, memory & runtime (Track B)

- **Slot store stage 3:** the gate mono applies before pinning a map's value type moves unchanged into `compiler/pin_gates.vl`, so the elaboration can run the same gate before mono (D16768).
