## Type system (Track A)

- **D17074 closed:** `w is C` over a record union now tests the value where one arm's field shares values with the other's, even after a write narrowed `w` to the other arm; it used to fold to `false` (or refuse at emit for `is D`). A 78-program grid goes from 42 run to 78.
