## Type system (Track A)

- **The shape-spelling tests read the type or the row (step 7, D6).** An arm mint, the whole-shape row index and an anonymous pin's layout check no longer parse a record's brace spelling. They read the record type, or a per-row bit set when the row is minted as an inline shape. `nameIsWholeSpanShape` and `tyGroupWrapsWhole` are deleted, along with two unreached name rungs that resolved or refused a spelled shape. No behaviour change: all 24,218 sweep programs are byte-identical.
