## Codegen, memory & runtime (Track B)

- **IR coverage: a hole function's field called off a maker call** (D17163): `mk(inc0).f(3)` and `mk5(inc0).a.b.c.d.f(4)` read the field at the type the IR builds the call at, byte-identical to legacy; 5 of the 6 `start: field read coercion` cells of family H are now IR-only.
