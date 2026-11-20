## Testing

- **The `ir claims` gate sees fallbacks outside the corpus:** `ir-shadow.vl -- --claims` also builds the nine `tests/cases` and probe programs whose claims fall back today (`claims-fallbacks.txt`: four verifier fallbacks, four `effect outside I1`, one `operand above a valued if's value`) and reds when any count rises; `--write-fallbacks` rewrites the counts as a fix lands.
