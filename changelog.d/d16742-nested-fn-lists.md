## Type system (Track A)

- **D16744 closed (clause 1):** a `for` loop over an un-annotated list parameter of functions with different results no longer traps. The loop's element, called directly, through a copy, through an inner loop or as an element chain's root, is read as `xs[i]`, so the set is dispatched on its members. Filed beside it: D16745, D16746 and D16747 (open).
