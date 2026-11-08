# A held list's rep row, and the set join one level deeper (2026-11-08)

Lane "D15552, and the set join at instanced signatures". It follows
[2026-11-08-generic-copy-shared-list-field](2026-11-08-generic-copy-shared-list-field.md) (#6794).

## D15552: closed by one miss, not three

The earlier note stacked three misses. Measured one at a time, only the second is load-bearing.
`[mk(1)]` with the set called at a literal is held at the rep `{fs: i32[], x: i32}[]`. Its readers
(`letRefListSlot`, `arrLitRowTyIn`) ask for that rep's ref-list slot. `collectA` interned a held
map's value row, but not a held list's element row, so the global's valtype had slot -1. The list
twin (`forceListLeafRepsOfTy` over the held rep) fixes it, and the witness runs `3`.

- Miss 1, the defer in `mintPinnedObjLit`, changes nothing once the twin lands (measured
  without it: all six spellings run), so it is not in the PR.
- Miss 3 does not arise. The readers resolve through the held rep's row, which is keyed by
  that closed rep. No row is keyed by the checker's holed type, as the ruling asks. The
  non-generic literal is not re-keyed; it never reaches this path.
- The twin is gated to a flat element (no field holding a record or a list). Ungated, it
  turned `d15296_deep_record` and `d15296_nested_list` into invalid wasm, because the forced row
  competes with the one the instance builds. A `rlSlotOfTy(he) < 0` gate did not stop that.

The ablation's `id`-at-two-instances row refuses with no list at all, so it is a separate defect,
filed as D15554.

## The set join at instanced signatures (D15226/D15510): parked

Measured, but not shipped. At check time every member of these sets types `(_) => _`, so the
checker has no signature to compare, and a gate on `a`/`b`'s signatures or the members' inferred
results declined D15226 too. The prototype:

1. `elabFnJoinDeepAt` recurses past `shape == 2` as shape 3, a list in a record in a list. With
   that alone, the checker types D15510's call `f64`, which is its grading list's ask.
2. An emit-side refusal at the inferred ref-list return (`emit_sections.vl`) walks the return type
   to shape 3 and compares each set member's result kind (`inferredRetKindCore`). D15510 then
   reads `... holds functions returning `i32` and `f64`, so no one list row holds them`.

Results: D15226 runs `6`/`4`. D15510 refuses by name. Three spellings that refused or built
invalid wasm now run: a lambda beside a named member, a generic `pick<T>`, and a `push` onto the
returned set. But `pick(n)` returning `[{ fs: [inc0] }]`, `[{ fs: [dbl] }]` and
`[{ fs: [inc0, dbl] }]` goes `runs → emit reject`. The first pairwise join mints a fresh set
index, and the third literal's own row no longer serves the result. A shape-3 guard that keeps
`j` when one side's set already is the union fixes the two-return form, but not the
three-return fold. The next step is to make the fold's later join reuse the subsuming literal's
type. Rebuilding the list and record over it mints new indices, so the leaf alone cannot do it.
A value `if` (`joinArmTys`) of the same shape moves from one loud message to another.
