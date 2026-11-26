## Codegen, memory & runtime (Track B)

- **IR widens a never-returning left operand from whatever its temp holds:** an operator whose left operand is a call that never returns, beside a wider operand, takes the call's temp at no value or at the `i32` legacy's never value takes. An operand that an inner operator already widened goes on from its own width, or stands as it is at the destination's. `(fail() + x) * 2.0`, nested comparisons and `i64` chains now run through the IR (D17064; `never operand not a call` 11 -> 0 units).
