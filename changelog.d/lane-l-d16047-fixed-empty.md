## Type system (Track A)

- **D16047 refined (owner ruling 2026-11-15):** an empty list whose annotation fixes its element type, or an empty literal delivered straight into a union, is tested by its arm: an empty `i32[]` in `i32[] | f64[]` is not `f64[]`. Maps and sets already answered so. D4915, D4939, D4949, D4953, D4954 and D15711 re-graded to the new answers.
