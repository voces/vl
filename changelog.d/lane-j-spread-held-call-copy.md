## Type system (Track A)

- **D16445 closed:** a spread of a `const` holding a maker's one call of a fresh record list, beside a part at a wider record (`const s = mk(); [{ x: 2.5 }, ...s]`), builds the maker at that record and runs. Before, the check refused it. Filed D16446: a maker called more than once still refuses.
