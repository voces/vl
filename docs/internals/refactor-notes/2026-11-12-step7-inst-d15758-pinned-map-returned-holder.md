# step7 inst: D15758 — a function returning a pinned map is a holder

Lane w321, D15758. The witness is a map `m4` of an un-annotated function, pinned at `(i32) => f64`
while an annotated list holds the same function at `(f64) => f64`. It is read through a call of a
function returning it, `function mk() { return m4 }; mk().get("a")`. Emit refused this with
`a function-value call has no interned signature`.

## Ablation

- A binding of the call already ran: `const v = mk(); v.get("a")`.
- The refusal needs the call to be read as the receiver of `.get`.
- With one signature, it runs.

The holder walk (D15757, D15759) followed bindings only. A call's result was nobody's holder.

## Change

All in emit_mono, with no helper added.

- **Function holders.** The holder walk in `monoPinMapSlot` now takes an un-annotated function
  every return of which reads a held binding as a holder. It retypes the reads of the function's
  calls through `monoRetypeMapReads`, which accepts a function declaration as its holder. The new
  path step `()` in `monoReadsSlotOf` means "a call of the function", resolved by `identDeclOf`.
- **Bindings of a call.** A binding of a call of a held function is a holder too. A first cut
  without this retyped `__deliver()` to the pinned map but left `const v = __deliver()` open, and
  lost `return_inferred`.
- **A bare `return` is no holder.** The neighbouring-matrix grid caught a compiler trap in
  `hole-fn-map-in-record-field`'s `early_return_guard`: a function with a bare `return`
  handed `retArg` -1 to `monoReadsBinding`, and `unwrapParen(-1)` read node -1. Every read the
  walk tests is now bound-tested first, including the `let`-write and bare-read tests that D15759
  (#7564) added.

## Grading

- The witness and the D15758 probe go from refusal to runs (`3`).
- `pinned-map-of-hole-fn-read-through-a-holder.matrix.vl` (4 new returned cells), base #7564's
  head:
  - runs 72 of 78 graded, with runs → not-runs 0 and → silent 0;
  - 4 cells go from refusal to runs: `returned`, `returned_two_returns`,
    `returned_no_params_two_returns` and `returned_read_in_function`.
- The holder families left, now ablated and filed:
  - **D15940:** a push or `set` into an annotated holder at one signature while another holder
    needs another. The literal spelling runs.
  - **D15941:** an un-annotated map of maps of such a map, which is refused even with one
    signature.
- Fixture: `tests/cases/maps/pinned-hole-fn-map-read-through-returned-map.vl`.
