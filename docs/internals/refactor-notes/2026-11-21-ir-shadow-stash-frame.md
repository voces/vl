# The door probe allocates from legacy's starting scratch frame (2026-11-21, lane IR-D1)

The `node-in` census over every I8 population found 6 `differ` rows at the list-literal door:
inventory D3190 and D3191, two `tests/cases/structs/` programs, and the self-compile's
`irMapCompactFnCode`. Ablated, they are one mechanism, and an artifact of the probe, not a
divergence. The door is armed-only, so nothing it writes ships.

- **Witness:** `const xs = [{ v: 2, f: () => 11 }]`, at the top level or in a function. With a
  plain field (`f: 11`) it matches.
- **The bytes** are identical except the order stash's local indices, offset by the number of
  slots the literal stashes: two fields read locals 1 and 2 under legacy and 3 and 4 in the
  fragment; three fields read 1, 2 and 3, and 4, 5 and 6.
- **Mechanism:** `objOrderStashSlot` allocates by pushing a row onto the function's lazy list
  scratch frame (`liKinds`, `liSlots`, `liBack`, `liFieldKind`). The probe ran after legacy had
  written the same literal, so it allocated past legacy's rows. A shipping door runs instead of
  legacy, from the same frame.

## The fix (shadow only)

Under the armed shadow, `emitArr` saves the frame before legacy writes (`liFrameSave`).
`irNodeInShadow` restores that frame for the probe, then puts legacy's frame back, so the probe
allocates exactly where a shipping door would. Unarmed, nothing is saved and no byte moves.

## Measured

See the PR: shipped bytes unchanged under `--names` and `--claimless`, and the 6 differs re-read
as matched. D3190 and D3191's armed `start bytes: prefix or locals` row, the claim audit's
shadow-only mismatch, reads `start matched` too.
`tests/ir-shadow-rows/node-in-stashed-record-in-list.vl` holds the witness. It fails on the
master seed and passes here.
