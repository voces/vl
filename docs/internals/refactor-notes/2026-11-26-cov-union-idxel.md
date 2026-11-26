# A list element that is a map, read at a twin map's rep (lane COV-UNION, 2026-11-26)

## The refusal

A list of maps of an un-annotated function, where an annotated list holds a sibling map at a
pinned signature (D15759): `const xs = [m2]`, then `xs[0].get("a")`. The element is stored at one
map rep, and the read is asked at another, whose values are the same closure pinned or
open. None of the element read's views covered a map, so the IR refused
(`index element coercion`).

## The change

`mapTwin` joins the element read's views beside `recTwin`. A map element read at a map rep whose
values are stored alike (`mapRetag`, the case #10321 gave `irConvert`) or differ only in a closure's
openness (`cloHoleRetag`) is read as stored, then retagged (`RRetag`). That is the record twin's
path, and the verifier's retag rules already admit both cases.

## Not in this change

The class's two other rows have other mechanisms:
- **`unions/narrow-literal-list-builds-at-arm.vl` (D14871):** a record element laid out at one
  row and read at another (record #6 against #3). This is layout stage 2a's list literal at its
  row (COV-START).
- **`unions/narrowed-arm-unannotated-binding.vl` `fromNestedElement`:** a union box element
  narrowed by `is A` on a nested element place (`ys[0][0]`). Legacy leaves the box
  (`refListReadUnboxOf` answers -1 for a record arm) and unboxes it at the later call. Which rep
  the narrowed binding holds is a narrowing question, left open.

## Measured

Each arm runs from its own checkout: master `a084d009c` from a base worktree, and this tree. The
population is tests/cases, regen-10's COV-UNION programs and the distilled `d16121` cell.
- `index element coercion` 4 → 2. No other class moved.
- tests/cases: unclaimed distinct functions 190 → 189.
- The distilled cell `named/d16121_element_alias_in_closure_ann.vl` is fully claimed.
- `ir-identity.sh --cases`: differ 0.
- `VL_IR_REQUIRE_CLAIM=1` exits 0 on `maps/pinned-hole-fn-map-read-through-element-field-or-let.vl`
  and on the distilled cell, and their output equals master's under `VL_IR_STRICT=1`.

Q58 sweep: `tests/cases/maps/map-element-read-at-twin-map-positions.vl`.
- Positions: the element bound, called off the read, and read in a function.
- Master blocks a function (`index element coercion`). This tree has blockers none and matches
  under `VL_IR_SHADOW=6`, and `VL_IR_REQUIRE_CLAIM=1` exits 0.
- Two positions are left out because legacy fails them before the IR is reached: one map placed
  in both an annotated and an unannotated list (`ref valtype with no interned shape`), and a loop
  read (`a function-value call has no interned signature`).
