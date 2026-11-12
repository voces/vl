# step7 inst: D15759 — the pinned map's holder walk follows elements, fields and `let`s

Lane w321, D15759, ablated out of D15758's grading list. Take a map `m4` pinned at
`(i32) => f64` while an annotated list holds the same function at `(f64) => f64`. When `m4` was
read and called through one of these bindings, emit refused with `a function-value call has no
interned signature`:

- a list element (`const v = xs[0]`);
- a field (`const v = w.f`);
- a field of an element (`rs[0].f`);
- a `let` (`let v = m4`, reassigned or not).

## Ablation

Seven spellings were delta-debugged against the witness.

- Each holder above refuses.
- Each runs with one signature, or when read through the holder without the binding. The second
  of those has run since D15757.
- A binding of a call (`const v = mk()`) already ran. The returned holder that stays open,
  D15758, is the call read as a receiver (`mk().get`), which is a different mechanism.

## Change

The holder walk in `monoPinMapSlot` (emit_mono, no helper added) now loops to a fixpoint over the
frame's bindings. For each binding it decides whether the binding holds a held map, in one of
three ways:

- **Bare read.** The initializer names a held binding as `monoReadsBinding` resolves it. That
  resolution matters for a read in a nested frame: a first cut resolved through
  `monoReadLetFrame` and lost `fn_body_capture`.
- **Element and field steps.** The initializer is a chain of constant-index element steps and
  field steps from a binding. The walk peels the chain, then replays it on that binding's literal
  and any inner literals, down to a read of a held binding.
- **`let`.** For a `let`, every whole write must also store a held binding.

A holder found this way takes the map's type, and its reads are retyped.

## Grading

- The witness and seven ablation spellings go from refusal to runs.
- `pinned-map-of-hole-fn-read-through-a-holder.matrix.vl`, with base #7550's head and head this
  branch:
  - 6 cells go from refusal to runs: `struct_field_init`, `array_element`, `local_assign`, and the
    new `list_element_field`, `let_reassigned` and `element_alias_in_closure`;
  - runs → not-runs 0, → silent 0.
- Still refused, in D15758: `returned`; `array_push`/`map_set` (annotated, `monoPinMapValues`);
  `map_value`/`map_set` (un-annotated, `unsupported map value type`).
- Fixture: `tests/cases/maps/pinned-hole-fn-map-read-through-element-field-or-let.vl`.
