# IR: a map variable's keys() and values() (2026-11-21, lane IR-N3)

`method keys` and `method values` were the IR's misses on `m.keys()` and `m.values()`. Legacy's
writers (`emitMapKeys`, `emitMapValues`) emit the receiver expression three times: before reading
the keys or vals backing, the live flags, and the entry count. They then copy the live entries into a
fresh list of the key or value rep. A Set's `.values()` is its keys.

## The change

- The writers are split at each receiver read. `mapKeysStep` and `mapValsStep` take the step
  number and write what follows that read. `mapValuesAreKeys` is the Set test both sides ask. The
  legacy writers loop over the three steps, so their bytes are unchanged.
- `RMapIter` (`miV`, `miAt`, `miVals`): the builder takes it only when the receiver builds to a
  variable with no statement of its own, so writing that variable three times is legacy's three
  reads. A global, a field, or a recovered read stays the named miss `map iter receiver`.
- The lowering asks legacy's scratch-frame flag (`fnUses.mapKeys`, `mapVals`) and writes the
  variable before each step.

## Witness

`tests/ir-shadow-rows/map-keys-values.vl`: `keys()` of a string-keyed map, `values()` of an
`i32`-keyed map walked by `for`, and a Set's `values()`.

## Also: the span of an index read of a tagged call

A tagged call's receiver builds as a tag stash statement and then the call, so `g(x)[0]` banked its
element-read row after the stash, where legacy's row starts before it. `idxRowOpenNote` now takes
an `SEffect` of `RTagStash` as the row's opening statement, beside `SCoalBox` and a valued `SIf`. A
callee held in a global is read before its stash, so that read opens the row (`tagStashLeads`).
The `index of a tagged call` named miss is gone. `tests/ir-shadow-rows/tag-dispatch-ref-result.vl`
now expects its functions matched and no mismatch, a global callee's start function included.

## Measured (fixpoint seeds of master 41144724 and the change)

- tests/cases armed shadow: covered and matched +11, start +1. `uncovered method keys` 12 → 0,
  `method values` 7 → 0, `index of a tagged call` 5 → 0 (start 5, 4, 2 → 0). The named
  `map iter receiver` takes 5 (start 8): a global, field or recovered receiver. No new `fail` or
  `mismatch` row.
- Corpus: `method keys` 5 → 0; no-blocker 44,449 → 44,454 of 45,678. Armed self +1 matched.
- Legacy: tests/cases A/B identical 7,309 (differ 0), `--names` identical, mode-3 self
  byte-identical. L2 fuel 106,901,466,260 → 107,005,813,458 (+0.098%).
