## Type system (Track A)

- **D16707 closed:** a write through a declared record parameter that misfits the record it is given (instantiated at that record, D3431) is refused naming the write and the layout — `` `f` writes `u.pet` a {legs: i32} on line 7, and its parameter `u` is this {pet: {legs: i32, purr: boolean}} itself … whose `pet` also stores `purr` `` — not with the capability sentence.
