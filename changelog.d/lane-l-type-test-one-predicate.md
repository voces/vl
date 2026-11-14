## Type system (Track A)

- **D1118, D2677, D4085 closed:** `is`, `as` and `match` answer a type test by one rule. A `match` arm naming a type parameter covers that member (`match y { T => y, null => x }` over `T | null`), `as? S` over `R | S | null` picks `S`, and `b is A`, `b as? A` and a `match` arm `A` over `b: B | D` where every `B` and `D` is an `A` all run, testing `B | D`. A tested record whose contained members share a tag with a member it does not contain is still refused at emit (D16320).
