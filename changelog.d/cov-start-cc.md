## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): under the test-only `--test-emit-refusal` hook, the IR now writes the constant cells around the refused one, as it does in any build; the last three programs that reached legacy's `emitExpr` from a constant cell no longer do.
