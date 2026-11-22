## Codegen, memory & runtime (Track B)

- **IR coverage: a closure global initialized by a call.** `const add2 = adder(2)` at module level missed its start body at `closure value of a call`. Legacy writes that initializer as the plain `emitExpr` of the call. `cloInit` now sends any initializer that is not a function literal or a name to `globalInitValue`, the route other globals take. tests/cases went from 107 functions to 0, and programs fully IR-only went from 4,021 to 4,079.
