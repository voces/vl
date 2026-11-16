## Type system (Track A)

- **One storage decider, set-binding sources:** the check-time set-binding shadow now also follows calls through list elements and `for` variables over them, callees read through a parameter's element, field or `const` alias, calls through a set into its members, calls of a `const` lambda, and list-method callbacks. Over 6,477 `@run` programs, agreeing calls through a set rose from 907 to 1,570, and programs where only the elaboration sees one fell from 340 to 173. Hand-backs now agree exactly (64), from one test shared with the elaboration (`check_hand_back.vl`).
