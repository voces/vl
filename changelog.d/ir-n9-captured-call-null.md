## Codegen, memory & runtime (Track B)

- **A `null`-returning call written into a `null` binding is the `null` unit as a value:** `print(x = f())`, `id(x = f())`, `const z = (x = f())` and `(x = f()) == g()` over an annotated `let x: null`, or a captured never-filled `let x = null`, now run, with the call evaluated once, instead of an invalid module (D17303, D17424) or the "assignment used as a value" refusal.
