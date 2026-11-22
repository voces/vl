## Codegen, memory & runtime (Track B)

- **IR: a direct call targets the function legacy names:** a direct call, a nested function inside a generic's instance among them, now builds in the IR at the function legacy's scope-chain lookup resolves (`userFnCallTarget`). Before, the IR matched its own lookup against the declaration. Byte-identical; the `call target` class falls from 121 to 0 on `tests/cases` and from 12 to 0 in the corpus.
