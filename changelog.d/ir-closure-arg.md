## Codegen, memory & runtime (Track B)

- **IR coverage: a `null` handed to a function value's nullable closure or map parameter.** A bare `null` argument on a closure call's general arm is now built at the parameter's rep, the null legacy writes there, instead of at its own `null` rep. On tests/cases, the 7 `closure argument coercion` functions leave the class: 2 functions and 3 start bodies match, and 2 move to other classes. Legacy's bytes don't change.
