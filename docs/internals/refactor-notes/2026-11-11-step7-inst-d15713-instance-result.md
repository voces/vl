# Step 7 inst: an un-annotated instance's result is its own values' where they widen the template's, 2026-11-11

Lane w321, D15713's remaining half, after w316's registry half (#7278). In
`function pick(d) { (m.get("z") ?? d).f }` with `m` holding `{f: i32}`, the template's `??` is
`{f: i32}`, so its result is `i32`. At `pick` with `d: J = {f: i32 | null}` the `??` is
`{f: i32} | J`, and `.f` is `i32 | null`. With #7278 the body built that box. But the instance's
signature still read the template's `(result i32)`, and the module-scope `pick(j) ?? 0` read the
call at `i32`. Validation failed in `pick`, then in the top-level code.

## Changed

- `elabRetOf` gives an un-annotated instance the type its own values have there
  (`elabValuesResultOf`), when that type widens the template's result to a union that holds it
  (`elabTyWidensTo`: `r | null`, or a union with `r` as a member).
- `nodeTyAt` at module scope reads a call's instance result where the instance widens the
  checker's type the same way. It already did so where the checker's type was open (D15628).

## Measured and left out

A first cut took the instance's values' type whenever it closed and differed from the
template's, and read it at module scope for every call. The full sweep against #7278's tip lost
11 programs, with 8 new compiler traps. Among them were `std/idtable-basics.vl`,
`conditionals/tail-if-field-assign-arm.vl`, `literal-unions/generic-return-null-arm-atom-join.vl`
and D2037's and D9020's witnesses. In those, an instance's values are narrower than, or
otherwise unlike, the template's result, and the emitter builds at the template's. The widening
rule keeps every one of them.

## Proof

- D15713's witness prints `2`. On a tree with #7200 merged and its `storeHoleDefaultApart`
  refusal removed, `d15318_pin_J` prints `4` and `d15318_two_pins` prints `4` then `4`.
- **Full local sweep**, fixpoint seeds, base master `f63c5c6d`, 23,923 programs: 23,923 same,
  0 bytes-only, 0 output movers, 0 runs → not-runs, 0 new compiler traps. The witness's row and
  the two cells' runs come with #7200: on master the cells refuse at `storeCoalescesResolve`.
- **Locally:** `cases_wasm` 7,441 passed. Its 3 failures are master's #7273 × #7285 collision, fixed by #7292.
  `regress.vl` reports no runs lost. rep-fuzz is exact. lint-self is clean, with its budgets. The
  `--findings` forms pass: dead-export at 0 and render-parse at 35 / 60. These also pass:
  `mono-tyaram-grid.sh`, seed-size (+0.5%), late-demands (6) and check-filed-witnesses
  `--strict`. Its one MOVED row is D14804, the same collision.
