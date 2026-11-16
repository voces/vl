## Type system (Track A)

- **D16798, D16799 closed:** a call through a binding of an un-annotated maker's call (`const v = adder(2)`, `adder(n)` returning `(a) => a + n`) is typed at the binding the maker call pinned, so `v(3) / 8.0` widens and runs, a second binding at another pin (`adder(1.5)`) gets its own instance, and `const y: string = v(3)` is refused by `vl check`.
