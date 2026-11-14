## Infrastructure (Track F)

- **One callee rule:** `calleeFnOfDecl` is the single place that resolves a binding to the function a call through it runs. The elaboration's and the monomorphizer's copies delegate to it. Output is byte-identical over the sweep population. D16072's remaining gap is filed as a pin-path gap, and D16073 lists 16 emit-time "is a lambda" tests that run after lambdas are renamed.
