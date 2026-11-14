## Type system (Track A)

- **Two warnings for members one type (owner ruling, in place of nominal variants):** a union formed in a `type` declaration or an inline annotation warns where two members spelled apart are the same record type (`` `Denied` is the same type as `NotFound` ({msg: string}); this union has one member. help: add a discriminant field ``), and an `is` or `match` arm naming one of them warns that it cannot tell them apart (`` `is NotFound` also matches `Denied`; this test can't tell them apart ``). Lint codes `same-type-members` and `test-cannot-tell`.
