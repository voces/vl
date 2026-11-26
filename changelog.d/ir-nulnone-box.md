## Codegen, memory & runtime (Track B)

- **IR coverage: a box over a `null`-typed value:** a `null`-typed value other than a call, a name or `null` itself (a valued `if` run for its effects) is run and dropped, then boxed as the null box; a `null`-typed call's box over a value holding a valued `if` goes late (the call held in an `anyref` once-slot, then the null tag). `box of a null-typed value` and `box of a valued if over a null-typed call` 0 on their programs; run output unchanged.
