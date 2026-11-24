## Type system (Track A)

- **D17480 fixed:** a generic body's method call on a receiver-overload set no longer adds a wrong "matches more than one … rename one import with `as`" refusal when its instance is pinned at `<error>` (a redundant cast or an undeclared argument); only the real error is reported.
