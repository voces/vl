## Type system (Track A)

- **D16974, D16977 closed:** an un-annotated parameter records the container operations its body applies, and each call resolves them against the argument's kind. `.has` takes a Set, and `c[1]` takes an i32-keyed map as well as a list or string. The array-vs-map ambiguity refusal is gone.
