## Type system (Track A)

- **D16742 closed:** a list of lists of lists (or deeper) of un-annotated functions whose results differ runs, bound, walked, returned or handed to a parameter; each inner literal of a smaller set is built at the whole set's ids.
- **D16748 closed (clause 1):** in a function with an un-annotated list parameter of function lists, a binding of an element (`const y = xs[1]`, `const y = x[0]` in a loop) called through (`y[0](3)`) dispatches on its member instead of trapping.
