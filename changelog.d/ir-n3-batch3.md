## Codegen, memory & runtime (Track B)

- **IR: a variadic push with a spread argument builds in the IR (`array spread unrecorded` closes).** The run literal legacy mints for `xs.push(a, ...ys)` keys its slots by the emission sequence, which the lowering reads at the same point; its temp holds the receiver's list type. Legacy bytes are unchanged.
- **IR: a record's function-valued field named `push` is its closure call again.** A record receiver no longer reaches the list push paths.
