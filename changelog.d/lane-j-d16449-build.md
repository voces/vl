## Type system (Track A)

- **D16449 closed:** a spread of a fresh list `const` of nullable records beside a wider record part (`const s = [{ x: 1 }, null]; [...s, { x: 2.5 }]`) now runs. The `const` is built at the wider record, nulls kept, and its own reads (`s[0]`, `s[0] ?? d`) are typed there. The bare-record spelling's `s.pop() ?? { x: 0.0 }`, a check-clean `cast failure` trap before, runs too. A widening push onto `[...s, { x: 2.5 }]`, refused before, runs (D16614, filed and closed here). Filed D16613: the maker-call face `[...mk(), { x: 2.5 }]` stays loud.
