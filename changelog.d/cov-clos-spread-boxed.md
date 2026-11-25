## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-CLOS): a spread literal whose elements are each boxed into a union element (`const us: (i32 | string)[] = [...ints, "x"]`, legacy's `emitArrSpreadBoxed`) is now built by the IR. Each group is built as itself, then brought to the union-box row by the same tail legacy writes (`spreadBoxedGroupTail`). The `array spread boxed` miss falls from 20 rows to 0 over the 464 programs with a spread, no claim is lost, and claimless output is byte-identical.
