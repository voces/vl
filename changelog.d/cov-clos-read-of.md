## Codegen, memory & runtime (Track B)

- IR coverage, captured and function-name reads (lane COV-CLOS): a hole function's name read where a closure is owed, a range loop's variable inside a hole instance, and a lambda that carries a capture for a nested function it calls are now claimed. The I8 census class `read of <name>` falls to 0 on tests/cases, the witnesses and the probes (from 27, 9 and 0 functions and start bodies); `closure env capture` falls from 5 to 4 on tests/cases and from 3 to 2 on the witnesses.
