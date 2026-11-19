## Type system (Track A)

- **B3: a record literal adopted at a hole parameter's open field is decided at check, with every literal of its shape:** `ftOpenFieldHolds` runs in the check's retry and decides the sets every other record literal of the same field names holds at that field with the set in progress, since they share one row whose rep holds ids at all of them or none (D15641); a literal of that shape whose field is open (bound per instance) leaves them all to the decision after the elaboration. 3 late tag rows move (320 → 317).
