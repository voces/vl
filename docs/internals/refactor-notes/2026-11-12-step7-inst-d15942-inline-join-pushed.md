# step7 inst: D15942 — an inline value join pushed onto an annotated holder delivers its maps

Lane w321, D15942 (clause 1). This program passed `vl check`, loaded, then trapped with
`indirect call type mismatch`:

    const xs: ({ [string]: (a: f64) => f64 })[] = []
    xs.push(if k { m2 } else { fnMap })

Here `m2` and `fnMap` are maps of un-annotated functions. Bound first (`const j = if …; xs.push(j)`)
the program ran.

## Mechanism (probed)

- **Disassembly.** In the trapping module, `half` was the uncalled stub `(func $half)` with no
  parameters, and its closure trampoline was `(structref) -> ()`. In the bound spelling, `half`
  was `(param f64) (result f64)`. The call through `xs[0]` at `(f64) => f64` therefore hit a
  mismatched table entry.
- **Why no delivery.** The maps' slot fact closed at `(f64) => f64` in both spellings. But
  `elabSlotDeliveries` for `m2` was empty inline and `(f64) => f64` bound, so mono served the
  slot as uncalled.
- **The stamp.** `elabReadStampsAt` reads the delivery type the check stamps on a read. The check
  stamps a bare push argument (`j`) with the list's element type. It does not stamp the `if`
  argument, and its branch reads carry only the join's open type.

## Change (emit_elab)

- `elabPushedOnto` climbs a branch's value (`CW_UP_ARM`) and a `??` operand (`CW_UP_COAL`) to the
  expression they are the value of, as the delivery climb already does.
- `elabReadStampsAt` adds, for a read pushed onto or set into an annotated holder, the holder's
  element type (list) or value type (map). This is the type the check stamps on a bare argument.

## Grading

- The witness and its ablation spellings go from trap to runs (`1.5`). With `inc0` in the chosen
  branch the program prints `4`, which is correct.
- `value-join-of-maps-of-hole-fns.matrix.vl`, base master and head this branch: `array_push`
  (both faces) and `map_set` (annotated) go from TRAP (program) to runs. Runs → not-runs 0,
  → silent 0, → program trap 0.
- Neighbouring matrices and the corpus: see the PR body.
- Fixture: `tests/cases/maps/hole-fn-map-value-join-pushed-inline.vl` (push, a second function,
  `set`).
