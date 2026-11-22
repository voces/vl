## Codegen, memory & runtime (Track B)

- IR coverage: a statement call through a tagged function set reads its callee as any expression (a list element, a captured cell, a record field, an `if`, a call), so the `tag dispatch callee expression` skip is gone (corpus 26 → 0; tests/cases +60 matched on the 77 files that hit it).
