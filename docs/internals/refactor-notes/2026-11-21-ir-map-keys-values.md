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
an `SEffect` of `RTagStash` as the row's opening statement, beside `SCoalBox` and a valued `SIf`.
The `index of a tagged call` named miss is gone. `tests/ir-shadow-rows/tag-dispatch-ref-result.vl`
now expects its three functions matched.
