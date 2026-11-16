## Type system (Track A)

- **One storage decider, sealed holders:** the check-time set-binding shadow no longer reads a list literal's set through a binding that is written or handed on, except by `.length`, an element call, a `for`, a list-method callback, a `const` alias, or a push of a function the list already holds. `$VL_IFACES`'s `setbind` line now also compares the set ids each side would have the tag decision try. Over 6,502 `@run` programs, check-only calls fall from 63 to 55; at the set grain, 999 agree, 30 are check-only and 202 elaboration-only.
