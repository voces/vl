## Codegen, memory & runtime (Track B)

- **IR builds `xs.get(i) ?? d` whose receiver is a call:** legacy stages a receiver it cannot re-read once in its `.get` stash and evaluates it before the index (D1677, D3756). The IR missed it (`coalesce listGetOr staged operand`). It now builds a receiver that is a chain of temps, writes it once into a local of its list ahead of the index, and hands that local to legacy's head at each of its reads; legacy's staging of the receiver stands down for that head. Once-slots gain a holder tag, so a nested holder of the same valtype never shares one.
