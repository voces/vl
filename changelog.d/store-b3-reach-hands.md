## Type system (Track A)

- **B3: a list copied through its adapter at one set is decided at check:** `ftParamStored`'s copied-list arm asks `ftReachHandsOne` at check as well as late, so its late-only guard goes; 1 late tag row moves to check (`closures/fn-set-list-of-hole-param-spread-into-closed-push.vl`, 373 → 372).
