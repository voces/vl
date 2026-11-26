## Codegen, memory & runtime (Track B)

- **IR builds a union compare whose operand legacy reads at its use (lane COV-UNION):** a nullable global beside a global box (`u == s`, both read again on the null leg), a function's closure beside a closure arm (`c === f0`), and a module `let` its initializer narrowed, compared at the box it is stored as (`v == held`). Before, the IR refused (`union compare operand`, `union compare operand rep`).
