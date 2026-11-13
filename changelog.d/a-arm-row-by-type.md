## Type system (Track A)

- **A union arm's row is the row its type already has (step 7).** `internArmShapeRow` asks `repStructRowOfTy` before minting, so an arm that is a layout twin of another declared record no longer shares that record's row by its rendered label; it mints under the label only when its type has no row.
