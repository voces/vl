## Codegen, memory & runtime (Track B)

- **IR claims a narrowed box re-boxed under a wider arm** (`if u is D { const q: Pet = u }` where `D` is wider than `Pet`'s arm `A`): the shared box plan's `narrowBox` arm boxes the same payload under `A`, as legacy writes it.
