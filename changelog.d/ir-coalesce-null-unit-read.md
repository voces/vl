## Codegen, memory & runtime (Track B)

- **IR: a `??` whose left is typed `null` writes the left's effect where its value is read** (D17421): `print(n() ?? g())`, `print(u.tags ?? g())` and `(u.tags ?? g()) == s` build the bytes legacy builds (`RAfterEffects`), and `return u.tags ?? g()` keeps legacy's tail call.
