## Testing

- **Inventory D17052: `x is S[]` over `i32[] | string[]` answers each arm inverted.** A string literal set's list shares the `i32[]` arm's box tag. Found while writing the listAcross rung's `tests/cases` program, and filed with its witness and an ablation.
