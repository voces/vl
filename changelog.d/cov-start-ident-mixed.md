## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): `===` / `!==` over a union with function arms is built by the IR, both over record and function arms and over two function types; `x === null` on such a union now takes legacy's per-arm compare in the IR too.
