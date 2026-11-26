## Codegen, memory & runtime (Track B)

- **IR push and element store convert through `irConvertStored`:** a value whose rep is not the element's goes in through the one converter into a cell (#10315), replacing the sites' own retag chains. `push operand coercion` falls 5 → 0 and `store operand coercion` 4 → 0. Four programs are fully claimed, and the rest name the conversion or the parameter they still lack (`convert closure -> closure`, `parameter rep unsup`). Claimed and claims-off builds are byte-identical on all of them.
