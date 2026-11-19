## Codegen, memory & runtime (Track B)

- **Compiler structure:** which lowering a `??` over a boxed operand takes (a boolean-pop binding, a nullable value-union binding or list element, or a call, `as?` or `if` operand) is one closed decision both emitters read, `coalBoxArmOf`; no program's output changes.
