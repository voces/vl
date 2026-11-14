## Type system (Track A)

- **`===` has exact `==` parity on function values (D15975):** an identity compare is now an equality node with an identity flag, so generic and un-annotated function values compare by `===` wherever they compare by `==`; a union whose arms are all functions has an identity.
