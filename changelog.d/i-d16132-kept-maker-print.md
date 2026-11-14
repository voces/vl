## Codegen, memory & runtime (Track B)

- **D16132 closed (clause 1):** printing a kept maker's union field at its own one-member type (`const dA: J = mk2(); const v = mk2(); print(v.f)`) prints the value again, where #7690 emitted invalid wasm; the print plan asks the union's name when its type's sets hold fewer than two members. The 37 previously silent matrix cells are the named distilled set `d16132-kept-maker-print`.
