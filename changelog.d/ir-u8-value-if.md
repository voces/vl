## Codegen, memory & runtime (Track B)

- **IR coverage: a `u8`-typed value, such as a value `if` pushed onto a byte list.** In `out.push(if d < 10 { 48 + d } else { 87 + d })` onto a `u8[]`, the `if` and its arms are typed `u8`, which no IR rep held, so the builder missed at `rep u8`. Legacy holds a byte value in an i32 and leaves truncation to the packed store. The builder now does the same: `byteHeld` reads a byte type as `i32` where a node's own type has no rep, for an i32 temp, and for the value `if`'s out variable.
