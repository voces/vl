## Codegen, memory & runtime (Track B)

- **IR: a direct call's argument is delivered at the parameter type `calleeSig` reads.** Where the parameter's scope carries no type (a function-typed parameter of a higher-order callee), that is its annotation. Before, the argument site read the scope type alone, got no rep, and missed on `argument coercion`. 33 tests/cases files had their `start` stopped on that miss: all 33 now cover, verify and match.
