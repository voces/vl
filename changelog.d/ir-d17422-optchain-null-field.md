## Fixes

- **A `?.` read of a field typed `null` builds and runs (D17422):** `u?.tags ?? g()`, the nested `w?.u.tags ?? g()`, and a standalone `u?.tags` passed as an argument, returned, compared or printed were refused at emit with `vl check` clean. Such a read is `null` whatever its receiver, so it now evaluates the receiver for its effect and gives `null`. The `??` default runs only then, once.
