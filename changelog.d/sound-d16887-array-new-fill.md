## Type system (Track A)

- **D16887 closed:** `__array_new__(n, fill)` builds a scalar, string or `null` fill at the union or nullable element of the list it is delivered to, as a literal of the same value is. So `const xs: (string | null)[] = __array_new__(2, null)` runs. An integer fill at a float element stays refused (D3539's ruling B′).
