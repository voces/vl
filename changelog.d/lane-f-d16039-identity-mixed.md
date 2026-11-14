## Type system (Track A)

- **`===` over a union of record and function arms (D16039).** Every arm has an identity under
  A15, so the checker accepts the mix and the compare takes each arm's own: `ref.eq` for a
  record, declaration and captured environment for a function, `null` apart from both.
