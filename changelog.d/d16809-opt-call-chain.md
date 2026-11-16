## Type system (Track A)

- **D16809 closed:** a `?.` call through a chain more than one field deep (`e?.r.f0(3)`, `m.get("a")?.r.f0(3) ?? 0`) runs; the receiver is evaluated once, where emit used to refuse it with "bind it to a name first".
