## Type system (Track A)

- **D16443 closed:** a list literal made only of a spread of a fresh list `const`, delivered where a wider record list is declared (`const t: { x: f64 }[] = [...s]`, `f([...s])`), builds the `const` at that record and runs, at every position of `spread-literal-fresh-const-record-list-wider.matrix.vl`. Before, the check refused it.
