## Codegen, memory & runtime (Track B)

- **IR builds a `.map` / `.filter` whose callback is an expression that writes a statement (lane COV-UNION, coordinator ruling):** `xs.map(if c { inc } else { dbl })` splits at legacy's own store of the list into the call's source local. A head statement (`RMapFilterHead`) writes the list and that store ahead of the callback's statements, and the call then writes the callback and its loop. Before, the IR refused (`map callback expression`).
