# D17665: a tagged set's id into a closure slot, and a closure-stored tag-set callee (2026-11-26, lane COV-START)

D17665 (coordinator ruling: clause 1, ahead of layout stage 4) is `const xs = [{ r: inc0, s: dbl }]`
then `print(xs[0].r(6))`, which is check-clean invalid wasm. The element's row stores `r` as a
closure struct, but the checker types the name `inc0` there at a tagged set's i32 id, and legacy
writes that id (`fnTagLeafEmitted`, `i32.const 6`) into the closure slot.

## The mechanism

Both changes are in ir_build.vl.
- **`tagIdIntoClosure`:** at an object literal's field, a function name typed at a tagged set's id
  (`exprTypedTagId`), whose only pre-path is the leaf id it replaces, going into a slot of closure
  rep is built as the function's closure (`cloValue`).
- **`tagDispatchAt`:** a call through a tag set whose callee operand arrives as a closure is called
  through that closure (`closureCallAt`). It uses the signature key every member shares, read off
  the first named member (`tagSetCloKey`, `cloSigKeyExt`).

The IR then claims the start body. Legacy still writes its invalid module, so the program runs
through the IR's claim.

## Tried and dropped

The nested spelling `[{ r: { f: inc0 }, s: { f: dbl } }]` is now D17666.
- **The inner literal built at the outer field's rep.** It gets the IR past the build, but the read
  `.f` has no legacy field arm. The lowering takes its index from that arm (`fieldIdxAt`) and
  misses `field shape`.
- **A plain read for an unclassified field.** It meets the same lowering. Both were dropped.

## Measured

The seed of layout stage 2b's head against this tree's.
- **Per program, tests/cases:** no change. No corpus program has this shape.
- **`$VL_IR_REQUIRE_CLAIM=1`:** the witness exits 0 and prints `7`; the control exits 1
  (`object field coercion`).
- **Positions file:** `tests/cases/lists/record-of-two-unannotated-functions-in-list-positions.vl`.
  It calls `r` off the element, off the element bound first, and inside a function the list is
  handed to. The head prints `7 8 3` and is claimed; the control exits 1.
- **Legacy-wrong bookkeeping:** legacy still writes the invalid module, so an armed-shadow
  `vl check --codegen` of the positions file exits 70 and fails its chunk. Like the two programs
  already there, it is listed in `claims-off-skip.txt` and as an expected divergence in
  `scripts/ir-divergence-baseline.txt` (`__start__@1`, legacy-wrong).
- **Positions left out:**
  - calling `s` alone also runs on the head (prints `12`);
  - calling both fields in one program, or in a loop, makes legacy store the ids, and it already
    runs on the control, so neither is in the file.
