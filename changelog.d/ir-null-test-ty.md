## Codegen, memory & runtime (Track B)

- **IR: the rewrite's desugared null test is typed:** the `l != null` a `??` or optional-chain desugar builds records `boolean` (`mkNullTestNe`), so the IR builds the null test and its join instead of missing as `rep ?`.
