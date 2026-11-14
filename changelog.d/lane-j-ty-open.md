## Type system (Track A)

- **`TY_OPEN` names an open component:** the element of an unpinned `[]`, the key or value of an
  unpinned `Map()`, an open nullable's inner type. `assignableOrOpen` says "an open component
  fits" at `assignable`'s descents and at `assignableExprIn`, where `assignable`'s negative-type
  guard said it implicitly; behaviour unchanged (1,500 corpus programs build byte-identically).
