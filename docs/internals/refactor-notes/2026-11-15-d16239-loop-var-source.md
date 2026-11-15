# D16239: one classifier for what a `for` loop's variable reads

Two producers answered which place a `for` loop's variable reads, each with its own rules:

- **The write scan:** `cwSlotPath`, `cwForInBinderOf` and `holeSlotCallPath` read a loop's first
  variable as `[]` below `cwPeel(fiIter)`. A map walk's second variable was added in #8458.
- **The elaboration's slot store:** `eplEdgeAt`'s `CW_UP_ITER` arm stepped by
  `eplStepOfRecv(iter)` and chose `fiDecl1` or `fiDecl2` itself.

Neither knew `.values()`. A fix to the write scan alone left the slot store disagreeing, and the
bare-function face moved to an internal emit sentence.

`cwLoopVarSource(lp, d, lt, step)` in check_write_scan.vl is now the one answer. It reads only the
AST and a type: the iterable's final node type on the check side, or the slot store's own instance
type of it (`elabNodeTy(u, k)`, as `eplStepOfRecv` read). It returns:

- the receiver a variable is one step below, and the step: `e` for a list's or set's element, `v`
  for a map walk's second variable or a `.values()` element;
- -1 for a list walk's index, a map walk's key, or `.keys()`.

The write scan's three loop sites read it through `cwForInRecvOf`. The slot store's ITER arm calls
it once per variable, and its own step choice is deleted. `eplStepOfRecv` stays for `Index`, `.get`
and the other projections.

This also corrects one-variable map walks. In `for x in m`, `x` is the key, and both sides had read
it as the map's value.

Left alone, on purpose: `eplPlaceOf`'s projection list (`pop/get/at/find/shift`) and copy list
(`slice/filter/reverse/concat`). They describe reads, not loop iterables. They are the next place a
second answer lives.

The phase-state surface of emit_elab.vl rises by one, 337 to 338: the classifier's import, which
replaces the slot store's re-derivation. The baseline is re-written in this PR.
