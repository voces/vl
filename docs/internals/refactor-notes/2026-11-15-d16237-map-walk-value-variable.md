# D16237: a map walk's value variable is an element of the map

`cwSlotPath` (check_write_scan.vl) is how a call through a read reaches the slot the read names. A
`for` loop's element variable is one step, `[]`, below what the loop walks. `cwForInBinderOf` named
only a loop's first variable, which for a map is the key. So the value variable of `for k, e in m`
was a root of its own, and `e.f(3)` reached no slot of `m`. The field write `r.f = dbl` through
`const r = m["a"]` lands at `m` / `[]` / `f`, so nothing pinned `dbl`.

The change, +4 lines, one function: the second variable of a walk over a map is its value. A list
walk's second variable is its index and stays a root (`for i, x in xs` binds the element first).

Not covered, and filed as D16239: a walk over `m.values()`. A check-side step for the `.values()`
call pins records of functions. For bare functions it moves the refusal to an internal sentence in
`monoStoredSlotFnTy`, because the elaboration's delivery side has no such step. Both halves go in
one change.
