## Codegen, memory & runtime (Track B)

- **D17564 closed (check-clean invalid wasm under `VL_IR_STRICT=1` → runs):** a call through a function read from a `Map()` (a tagged set's dispatch) after an earlier operand, as in `print("i=\{f(5)}")`. The IR now stages the earlier operand below the dispatch's set-id stash (`tagStashFrom`), as legacy writes it, and declines where a box over the dispatch leads it (`dispatchBoxFrom`). The concatenation, a call's argument, a list element and a record field miss cleanly; binary arithmetic and an unboxed argument claim byte-identical.
