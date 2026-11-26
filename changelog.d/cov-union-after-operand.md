## Codegen, memory & runtime (Track B)

- **IR builds a `??` after a waiting operand (lane COV-UNION):** a `??` along the optional-field, map-field, list `.get`, `.pop`, boxed and `boolean | null` join arms, built after an earlier operand (`10 + (h.p?.n ?? 1)`, `two(3, xs.get(i) ?? 8)`, inside an interpolation), goes by the IR, which stages that operand below it. A `boolean | null` or atom operand the `??` reads twice and cannot re-read (`m[k]?.ok ?? false`) is held in a local of its own.
