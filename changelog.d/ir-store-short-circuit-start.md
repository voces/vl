## Codegen, memory & runtime (Track B)

- **IR: a map or record field store whose value is a boxed binding's `??` builds in the IR**: the receiver and key are staged below the `??`'s tag test, as below a valued `if` (#9844's staging arms). tests/cases `map store short-circuit operand` and `field store short-circuit operand` 3 functions → 0 (plus a third program on to a later blocker); #9844's matrices' 14 start cells → 0.
