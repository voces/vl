## Type system (Track A)

- **D16828 (part):** `x?.f ?? d` and `x?.f(…) ?? d` over a binding only ever `null` (`const a = null`) take the fallback `d`; the call's arguments are not evaluated.
