## Codegen, memory & runtime (Track B)

- **D17068 closed:** a union `==` against an operand with effects (a call, a field read off a call) runs the operand once, in source order, whatever arm the box holds; it used to run only when the box held the operand's arm. A 252-program grid over seven arm kinds goes from 84 run to 252, and a nullable operand left of a call box now runs first.
