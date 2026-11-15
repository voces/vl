## Type system (Track A)

- **D16391 closed:** `[...bs, null]` over a `u8[]` is refused at check with the u8-mix sentence, as every other element mixed with a `u8[]` spread is; it used to pass check and stop at an emit refusal.
