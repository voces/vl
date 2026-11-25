## Type system (Track A)

- **D17561 closed:** a hole function's `.map` whose callback returns `e ?? "m"` builds a string list at a `null` argument, as the callback's inferred signature types it (was check-clean invalid wasm).
