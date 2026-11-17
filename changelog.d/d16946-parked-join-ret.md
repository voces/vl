## Type system (Track A)

- **D16946 closed:** a generic whose `??` default is a list of another element, called from inside another generic, is refused at check where the outer call pins it to a non-`i32` element, as the direct call is; it built invalid wasm. The `i32` instance runs.
- **D12455 closed:** the list literal around such a call is now that check refusal rather than an emit reject.
