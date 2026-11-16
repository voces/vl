## Type system (Track A)

- **D16743 closed:** a map written records whose function field holds un-annotated functions of different results, called through `?.` on an entry (`m.get("b")?.f0(3) ?? 0`, `m["b"]?.f(3)`), runs; each call runs the member the entry holds.
