## Codegen, memory & runtime (Track B)

- **IR coverage: a function value whose result is `never`.** The call is followed by `unreachable` and has no tail form, as legacy's `emitCall` writes it. A field or expression callee called as a statement keeps legacy's direct `emitCallRef` form, with no `unreachable`. `call of a non-declaration`, batch 3; the class closes. No legacy bytes moved.
