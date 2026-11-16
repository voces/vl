# Slot store parity 3: an instance's clone of a capture write temp (lane SLOT, 2026-11-16)

The third engine-parity rule for [D16768](../inventory/D16768.md). Mono's readers are still on the
delivery walk, so it changes no output. It is graded by `tests/cases` byte identity with master.

## What changed

- **`eplSrcHolder`**: a node an instance cloned from a capture write temp (`declOrigOf` names the
  temp, `cboxWriteCells` the temp's cell) answers as the cell's binding. Parity 2 covered the temp
  itself; the walk's `elabSlotPerInstance` also looks the clone's origin up.

## Readings

Fixpoint seeds: master `4e48a976` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, byte for byte | 0 of 7,847 differ |
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 `runs -> not-runs` |
| L2 self-compile fuel | 93.647e9 against the 92.876e9 baseline: +0.8%, under the 1% bar |
| seed size | 6,433,582 against 6,433,489: +93 |
| `lint-self` | clean |
| `scripts/gate.sh` | all gates pass |

## Gap list

Measured on `slot-2b3-d` with master merged, by `tests/cases` byte compare. This rule, together
with two per-instance rules that need the class-reading part D helpers (`eplSlotDeliveredTys`,
`eplSlotFnSigAt`) and so land with the flip, closes three programs:
`nested-generic-written-into-capture-cell-at-two-instances`,
`capture-cell-annotated-written-with-generic-by-shared-closure` and
`generic-choice-in-generic-body-at-each-instance`. The per-instance rules: a slot is asked per
instance when its delivered type lists differ between instances, or when it holds a function
declared in the instanced function around it (each instance holds its own copy).

Four remain:

- `list-seeded-by-hole-param-slot-written-with-named-fn` (fails to build)
- `generic-list-written-fixed-fn-called-in-generic-body-widens` (fails to build)
- `fn-record-returned-to-two-bindings-one-written` (different module)
- `generic-returned-fn-param` (different module, one fewer `app2` instance, same output). The
  candidate's own three rules removed, it still differs, so it moved with the master merge.
