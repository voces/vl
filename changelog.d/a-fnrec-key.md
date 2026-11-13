## Type system (Track A)

- **A record holding a function keys its ref-list row by its type (step 7).** `rlKeyTyOf` no longer declines a closed record or list that holds a function, so its list and map-value rows key by the element type instead of re-resolving the spelling. Its function-value sets still choose its struct row (D16040).
