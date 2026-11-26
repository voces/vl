# IR: a never-returning argument into a function-value call (2026-11-26, COV-CALL)

**Mechanism.** `callRefArgPlain` decides whether the IR writes a function-value call's argument as
legacy's plain arm does. It had no case for an argument that never returns (`f(__trap__())`).
That argument is legacy's general arm with no scalar width, so `callRefPlainKey` was empty and
the call missed `call of a non-declaration`. Such an argument stops before the call, so it is
written as itself at any scalar parameter (`keyScalarRep`).

Legacy reads `callRefArgPlain` only to note which arguments the IR writes as it does; its own
bytes do not move.

**Census delta.** The classes are regen-10's `call of a non-declaration: argument general Call at
i32` (1 row) and `callee signature` (4 rows), both COV-CALL's.

- Three of the four `callee signature` programs already build on current master.
- The fourth, `d16261_never_lit`, had moved to the `argument general Call` class.
- It is now claimed. All eight `scripts/silent-sweep/distilled/named/d16261_*.vl` cells build under
  `VL_IR_REQUIRE_CLAIM=1` (rc 0).

**Q58.** `tests/cases/functions/never-argument-into-closure-call-positions.vl` covers:

- a local lambda (`i32`), and lambdas at `f64` and `i64`;
- a parameter;
- a record field.

Each argument is a never-returning call (`__trap__()` or a `never` function), on an untaken path.

| build | result |
| --- | --- |
| merge-base probe | `k` and `viaParam` miss `argument general Call at i32` |
| branch, `VL_IR_REQUIRE_CLAIM=1` | builds (rc 0) and prints legacy's output |
| branch, the path taken | traps at `unreachable`, as legacy does |
