## Type system (Track A)

- **D16444 closed:** a spread of a call's fresh record list beside a part at a wider record (`[{ x: 2.5 }, ...mk()]`) is copied element by element into that record and runs, at every position of `spread-literal-call-record-list-wider.matrix.vl`. Before, the check refused it. Filed D16445: a spread of a `const` of such a call still refuses.
