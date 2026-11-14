## Type system (Track A)

- **D4055 closed:** postfix `++`/`--` on a field or an element runs: `c.n++` and `xs[0]++` increment the place once, and `const o = c.n++` yields the old value, where the parser refused any target but a name. **D16216 closed** with it: `print(y++)` on an `f64` or `i64` name, check-clean invalid wasm, prints the old value. A compound write used as a value whose index or receiver has an effect (`print(++xs[k()])`), which silently ran the effect twice, is now refused at emit (D16217).
