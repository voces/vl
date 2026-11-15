## Type system (Track A)

- **The hybrid return rule (flag day):** a function's block body returns a value only through
  `return`; an expression body and an `if`/`match` arm in value position keep their last
  expression (DECISIONS, "A function's block body returns a value only through `return`" and
  its 2026-11-15 details). The tree is migrated. A value tail where a value is wanted is the
  error `missing-return`, a discarded pure tail the warning `discarded-tail-value`, and a value
  slot refusing a `void` call of a function that discards its last call names that function;
  `vl check --fix` writes the `return` for all three, which is the migration of a repository
  outside this one (AE-001).
