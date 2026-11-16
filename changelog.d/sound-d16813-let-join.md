## Type system (Track A)

- **D16813 closed:** a top-level `let` that holds two un-annotated functions (`let g = hid; g = kid`) no longer pins them at the first call's type. `kid(1.5)` followed by `hid(100)` runs in either order, as it already did inside a function body. A call through `g` still joins the functions it holds.
