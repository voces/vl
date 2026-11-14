## Type system (Track A)

- **D4087 closed:** a `match` arm, an `as? B` and an `as! B` naming a record one union member may be by its fields' values test as `is B` does, the member's tag and then its fields, so all three spellings agree: `match r { B => … }` over `r: A | C` prints `B` for `{ x: 1 }` and falls through for `{ x: 7 }`. A nullable operand (`A | C | null`) is tested the same way in all three. A field read straight off `as! B` is still refused (D16322).
