## Type system (Track A)

- **Float constants fold in IEEE-754, as at run time** (owner ruling 2026-11-15, lane O's spec question 9, reversing the float half of ruling A): each float literal is its nearest double and each float operation of a constant tree rounds to the nearest double, so `0.1 + 0.2` prints 0.30000000000000004 and `1.5 % 0.1` 0.09999999999999992; integer constants stay exact. Spec E9.1, DECISIONS "Exact constant arithmetic" and the oracle follow. Two fixtures move; `1.5 % 0.1` at an integer destination is now refused as not whole.
