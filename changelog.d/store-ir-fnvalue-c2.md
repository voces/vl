## Codegen, memory & runtime (Track B)

- **IR function values, step 2:** a lifted callee's captures may be the caller's own `let`/`const` bindings as well as its parameters (`liftCapDecl`, through the function's own-binding set built once per function), and a plain closure call takes string and record arguments (`callRefPlainKey`, with legacy's armed agreement covering the new arms). Byte-identical.
