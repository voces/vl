## Codegen, memory & runtime (Track B)

- **The IR shadow's detail mode names a `rep` miss's node.** Under `VL_IR_SHADOW=2`, a miss at a node whose type has no rep also prints `detail rep <what> of <node kind> in <function>` (`detail rep ? of string in mat`); the miss class itself, which the census keys on, is unchanged.
