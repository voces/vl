## Type system (Track A)

- **A top-level call of a function whose callees take un-annotated parameters checks it first
  when its result is pending:** as an early function's body does. `const h = frReturned()`
  before a `frReturned` building closures over un-annotated `inc0` and `half` trapped and now
  prints `11.5`; three more declaration-order movers stop moving (D16301).
