## Type system (Track A)

- **D16076 closed:** a maker's result bound at module scope and called through an alias inside a top-level lambda runs (was "a function-value call has no interned signature"): a quiet probe no longer notes a call through a slot, so its untyped arguments no longer refuse the slot's signature.
