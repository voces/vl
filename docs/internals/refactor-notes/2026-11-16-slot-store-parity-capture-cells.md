# Slot store parity 2: capture cells (lane SLOT, 2026-11-16)

The second engine-parity rule for [D16768](../inventory/D16768.md). Mono's readers are still on the
delivery walk, so it changes no output. It is graded by `tests/cases` byte identity with master.

## What changed

- **`eplSrcHolder`**: a temp the capture rewrite minted for a closure's write to a captured binding
  (`cboxWriteCells`) answers as the cell's binding, as the walk's holder lookup does.
- **`eplSlotPlace`**: a binding the capture rewrite made a shared cell is asked at path `e/...`
  (the cell's one element). The classes place the binding as written, so a leading `e` is dropped
  for a cell binding (`cboxCellDecls`).

## Readings

READINGS

**Gap list** (the class-reading part D candidate on `slot-2b3-d`, `tests/cases` byte compare): 6
remain after this rule and the loop-exit rule. Two of them are per-instance capture cells in
generics (`nested-generic-written-into-capture-cell-at-two-instances`,
`capture-cell-annotated-written-with-generic-by-shared-closure`). In those, `elabSlotPerInstance`
compares the write cell under its `e` prefix, which is what this rule leaves for the next step.
