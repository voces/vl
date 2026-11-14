# G3: write leaves per place path, and an uncalled function builds no instance (D15136, D15190), 2026-11-14

Lane M. Group G3 of lane B's census of the un-annotated-function-in-a-container family.

## Change

- **`fnTagWriteLeavesOf`** (check_elab_cap.vl) reads every widened container, not only list
  bindings: each record field `elabFnFieldTy` widens is recorded beside `fnFieldWidened` with its
  place path from the binding and its joined element type (`fnFieldWidenedPath`,
  `fnFieldWidenedElem`). One helper, `fnWriteLeavesAt`, takes a container's writes at its path.
  `fnWriteOnlyInto` takes the path and accepts a write only where its target is that place (a
  `push` counts as the element). No reader changed; no mono-side derivation was added.
- **`fnArgOnlyFrom`**: a parameter of a function nothing calls and that is not exported hands
  no list, since such a function builds no instance of what it calls. The emitted module for
  D15136 holds one instance of `put`.
- **`ucCompute`** (check_unconsumed.vl): a never-called candidate still keeps its own result,
  but no longer marks its tail callees' results consumed. Without this, D15136 failed to
  validate inside `put` once the leaf was taken: `hand`'s expression body made `put` return its
  assignment's value, typed as `half`'s closure, while the leaf emits an id.

The "per instance" in the brief came down to this: the only other instance of `put` was the
uncalled `hand`'s, and that body builds none, so the producer needs no instance key.

## Grading

Fixpoint seeds on both sides (`--before` master `a5624eb2`, its seed rebuilt byte-identical; the
after seed is byte-identical on a second refresh).

- Both witnesses print `1.5`. Ablations: without `hand`, and with a bare list instead of the
  field, both print `1.5`, on master and here.
- The three `error-*-write-through-param` fixtures now run with the right values and are run
  fixtures: `4`/`1.5` (list read before the write, beside the uncalled `hand`), `4`/`1.5` (record
  field read before), `1.5`/`4` (two elements, one written). Late demands fall 8 → 5: those three
  demands existed only on the refusing build.
- New matrices, before → after RUNS of 46, 0 runs→not-runs, 0 silent each:
  `fn-list-written-through-param-beside-uncalled-hand` 0 → 15, its `-generic` 0 → 45,
  `fn-list-written-two-distinct-through-param-beside-uncalled-hand` 0 → 15,
  `fn-record-field-list-written-through-param` 0 → 16, its `-generic` 0 → 19,
  `fn-record-field-list-written-two-distinct-through-param` 0 → 16. Each equals its closed
  sibling's count (`fn-list-written-through-param` 15, `fn-record-field-list-written` 16, generic
  19), so the remaining cells are the family's.
- Unchanged, 0 runs→not-runs, 0 silent: `fn-list-written-through-param` (15), `-generic` (45),
  `fn-record-field-list-written` (16), `-generic` (19), `fn-nested-record-field-list-written`
  (16), `fn-record-field-alias-written` (16), `fn-map-written-two-results` (15), `fn-list-alias`
  (46), `element-write-value` (50 of 50), `field-write-value` (50 of 50).
- Seed size +1.2% against the baseline.

## Residue

- D16230 (clause 1, check-clean invalid wasm): the same write's value really held,
  `const g = put(xs)` with no call through `g`, still fails to validate inside `put`, as on
  master. A call through `g` runs.
