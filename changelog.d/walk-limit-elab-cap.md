## Type system (Track A)

- `elabTyClosed` and the two parameter-copy walks in `check_elab_cap.vl` visit each type or binding once instead of stopping at a fixed depth; the two shallow `elabTyClosed(t, 16)` callers now ask the whole type, as documented.
