## Type system (Track A)

- **A list of a record row is found by its element type, and a forced ref list keys its row by type (step 7).** `arrLitRowOfInnerRows` no longer looks the list up by its rendered name, and `forceRefListOfTy` hands over its element type. Every program builds the same bytes.
