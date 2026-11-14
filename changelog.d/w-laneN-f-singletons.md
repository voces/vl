## Type system (Track A)

- **D2508 closed:** a `for` over an empty list literal binds its loop variables at the read-only
  default and runs its body zero times, instead of refusing a read of the loop variable.
