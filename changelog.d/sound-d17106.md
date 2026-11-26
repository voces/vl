## Type system (Track A)

- **D17106 closed:** a map storing bundles of different signature sets (`lap` at `f64` and `i32`, `lap2` at `boolean` and `i32`), and never read for a value, holds each store's record whole in a value slot that is the union of the records. Reading a value back is D17573, and a plain lambda stored beside a bundle is D17572.
