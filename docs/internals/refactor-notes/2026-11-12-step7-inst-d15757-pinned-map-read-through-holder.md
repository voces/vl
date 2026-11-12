# step7 inst: D15757 — a pinned map's reads are retyped through a list or alias holding it

Lane w321, D15757. Take a function `half` held by a map in an annotated list at `(f64) => f64`.
It is also called at `i32` through a second map, `m4`, which is reached through an un-annotated
holder: a list (`[m4]`) or a `const` alias. Emit refused this with
`ref valtype with no interned shape` (list) or
`a function-value call has no interned signature` (alias).

## Mechanism (probed)

Both maps already pinned correctly, with `et` = `nt`. Two things were missing:

1. The holder list's slot fact was closed, but nothing annotated it. Its maps are called, so the
   map-element arm of `monoPinListElems` (D15756) skipped it.
2. A read through the holder (`ys[0].get("a")`, or `al.get("a")` after `const al = m4`) stayed
   open. The reason: `monoRetypeMapReads` matches a pinned map's reads only by the map's own name.

## Change

All in emit_mono. No helper is added, because the pin layer is a ratchet.

- **List holders.** The map-element arm of `monoPinListElems` also takes a list whose maps are
  called, provided every element names a binding already pinned (`letType` set) whose slot fact
  is the list fact's element. It then retypes the reads of those maps' values through the list.
  This uses `monoRetypeMapReads` with the new path step `[]`, which `monoReadsSlotOf` reads as
  "an element of the list binding".
- **Alias holders.** `monoPinMapSlot` gives each un-annotated `const` alias of the pinned map the
  map's type, and retypes its reads. It does the same for aliases of an alias, transitively, which
  is what a closure capture generates. A first cut that took only direct aliases lost six
  capture/alias-of-alias cells. That is why the walk is transitive.

## Grading

- D15757's witness goes from refusal to runs (`3`); so does the alias spelling.
- New matrix `pinned-map-of-hole-fn-read-through-a-holder.matrix.vl`, run before (master) and after:
  - runs 54 of 64 graded, with runs → not-runs 0 and → silent 0;
  - 11 cells go from refusal to runs: `binding`, `block_if`, `block_while`, `block_bare`,
    `fn_body`, `list_element`, `list_two_elements`, `list_index_read`, `const_alias`,
    `alias_in_function` and `list_in_function`, all un-annotated.
- Still refused on both seeds: `returned`, `struct_field_init`, `array_element` and `local_assign`
  (un-annotated), `array_push`/`map_set` (annotated), and `map_value`/`map_set` (un-annotated).
  They are filed under D15758, whose witness is the returned spelling, with a probe.
- Neighbouring matrices and the corpus: see the PR body.
- Fixture: `tests/cases/maps/pinned-hole-fn-map-read-through-list-or-alias.vl`.
