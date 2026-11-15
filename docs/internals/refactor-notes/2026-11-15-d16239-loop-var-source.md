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

It has five readers, each of which had its own copy of the choice:

- **The write scan's three loop sites,** through `cwForInRecvOf`.
- **The slot store's ITER arm,** once per variable. Its own step choice is deleted.
- **The delivery climb** (`elabSlotClimb`'s ITER arm and its receiver step, through
  `elabLoopViewDeliveries`). It reaches a loop from a receiver whose view (`.values()`) the loop
  walks, and nothing outside the classifier names the method.
- **`monoRetypeMapReads`,** which typed a loop's value variable at a pinned map value by choosing
  `fiDecl1` or `fiDecl2` itself.

`eplStepOfRecv` stays for `Index`, `.get` and the other projections.

This also corrects one-variable map walks. In `for x in m`, `x` is the key, and both sides had read
it as the map's value.

Left alone, on purpose: `eplPlaceOf`'s projection list (`pop/get/at/find/shift`) and copy list
(`slice/filter/reverse/concat`). They describe reads, not loop iterables. They are the next place a
second answer lives.

The phase-state surface rises by one each in emit_elab.vl and emit_mono.vl: the classifier's import,
which replaces each module's own re-derivation. The baseline is re-written in this PR. emit_mono's
function count is unchanged.
