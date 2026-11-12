# step7 inst: D15756 — an uncalled list of maps of functions takes its slot fact

Lane w321, D15756. This program was refused at emit with `emitProgram: ref valtype with no
interned shape`:

    function half(a) { return a / 2.0 }
    const m4 = Map()
    m4.set("a", half)
    const ys = [m4]
    print(ys.length)

## Mechanism (probed)

A probe at `monoPinListElems` showed `ys` with three types:

- the elaborated node type was open;
- the checker's type was `{[string]: (_) => _}[]`;
- the elaboration's slot fact was `{[string]: (i32) => i32}[]`, which is closed.

`monoPinListElems` closes only function elements (path `["e"]`). A list of maps was therefore
annotated only where a call through it pinned one. With no such call, the list kept the open type,
and its module cell found no list row (`letCellSlot` -1).

## Change

A map-element arm of `monoPinListElems` (emit_mono) runs before the nested-list arm. It adds no
helper, since the pin layer is a ratchet (`budget_pin_helper_test`). It applies to a literal of maps
whose functions nothing calls (`elabSlotUncalled(at, ["e", "v"])`) and that has a closed slot fact.
It annotates the list at that fact and types its open elements at the fact's element. A list whose
maps are called keeps its current path: without this guard, `ys[0].get("a")!(3)` would become
invalid wasm. w317 was told before the edit.

## Grading

- The D15756 witness and the minimal program above go from refusal to runs. So does the same list
  inside a function, which used to report `` `.length` receiver's ref-list element does not
  resolve ``.
- The probe `map-fn-shared-by-annotated-and-plain-map-lists.vl` goes from GAP to runs.
- `two-map-lists-sharing-a-smaller-set`'s annotated face still refuses. There `ys` is read and
  called at `i32` while `v` wants `f64`. That two-signature remainder is filed as D15757, with a
  probe.
- Matrices and the corpus: see the PR body.
- Fixture: `tests/cases/maps/uncalled-hole-fn-maps-in-list-literal.vl`.
