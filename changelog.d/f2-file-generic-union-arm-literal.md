## Type system (Track A)

- **Filed D17032 and D17033:** inside a generic, a record literal built at the union arm that holds the type parameter is refused by the checker (its discriminant widens to `string`); built at the arm free of it, the program checks but fails emit with an internal error (clause 1).
