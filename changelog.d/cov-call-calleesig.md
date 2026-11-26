## Codegen, memory & runtime (Track B)

- **IR writes a never-returning argument into a function-value call as itself:** a call through a lambda, parameter or record field whose argument never returns, such as `f(__trap__())` or `g(fail())`, at an `i32`, `i64` or `f64` parameter, now builds through the IR. Before, it missed `call of a non-declaration: argument general Call at i32`. The argument stops before the call, so it needs no conversion (class 1 row -> 0; `callee signature` 4 -> 0 on current master).
