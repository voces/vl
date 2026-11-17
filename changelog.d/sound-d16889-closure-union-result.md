## Codegen, memory & runtime (Track B)

- **D16889 closed:** a call through a closure whose result is a scalar-plus-record or scalar-plus-list value union runs when no producer of that closure type exists, for example in an uncalled function taking `p: {f: (i32) => {a: i32} | f64}`. It also runs when the closure is an indexed element of a list such as `(() => (i64 | boolean)[] | i32)[]`, whether pushed, stored by index, returned or named. Both were refused at emit after `vl check` passed them.
