## Infrastructure (Track F)

- **The checker's rollback site sets are named compositions** (engineering review Small 7): each
  `RB_*` set in `check_rollback.vl` is the `|` of the families its comment names, over one
  `RB_CSTR` for "every constraint family", instead of a bare sum such as `2799615`.
