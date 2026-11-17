## Codegen, memory & runtime (Track B)

- **D12466 closed:** a `K | null` call result delivered into a box that also holds an `i32` (`(K | null | i32)[]` literal element, a scalar binding, a record field, `.push`) boxes the atom as its member string and `null` under the null tag. On master each refused at emit (`literal-union string widening with no members`).
