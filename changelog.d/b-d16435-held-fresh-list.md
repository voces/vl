## Type system (Track A)

- **D16435 closed:** a fresh record literal joined beside a held record adapts to the held record's type where its fields fit, in a list literal, an `if` and a `match`, with or without a destination: `[ra, { k: "b" }]` with `ra: { k: "a" | "b" }` runs (it was refused as `RA is not {k: string}`).
