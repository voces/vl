# IR cutover C2l: a list element store (coverage step), 2026-11-16

Lane IR-C. This is a coverage step under the `ir-design-2026-11.md` §10 exemption, sized with the
blocker census. On C2k's tree, `assignment target` was the corpus's largest single blocker, at 703
functions, and the self-compile had 314. A throwaway split put every corpus store and 206
self-compile stores on a list element `xs[i] = v`. `CLAIMED` stays empty, and no emitted byte moves.

## What landed

- **Legacy's element-store decision is shared.** `emitAssignIndex`'s list path splits into these
  pieces:
  - `idxStorePlanOf`: the `IdxStore` record, classified.
  - `idxStorePlainWhy`: names what the IR does not take. That is a ref, u8 or scalar-width list; a
    nested or union row; an atom or niche element seed; an atom value; or an arm unbox.
  - `idxStoreHoistOf`: the live loop hoist.
  - `idxStoreTail`: park the value, guard, then `array.set`.

  The builder asks legacy's `exprMap` first, as legacy does. Without that check, the plan recorded
  a refusal for a map store.
- **`SListSet`** is built after the value, with an `SBoundsCheck` over the same list and index in
  front of it, which the lowering fuses into the tail's guard. Rule 8 now pairs a bounds check with
  an element write as well as an element read. `SListSet` is in the `list` family. As `other`, mode
  3 never claimed it, and the first mode-3 run showed this as 5,013 claimed against 5,210 covered.
- **A scalar-width store is not in this step.** Its value goes through `emitWidened`'s `plain` arm,
  which sets the `numSeat` coercion seat around `emitExpr`. That seat waits for I8 (§10). It holds
  686 corpus functions alone (`store element`).

## Coverage

| reading | C2k | this step | gained |
|---|---:|---:|---:|
| corpus covered = matched | 18,809 | 18,825 | +16 |
| self-compile covered | 5,019 | 5,216 | +197 |
| self-compile matched | 5,013 | 5,210 | +197 |

Compiler lines are +147 / −34, 113 net. The corpus's element stores are almost all onto
scalar-width lists, which `numSeat` keeps out.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the C2k seed, 12,213 cells | 8,934 identical, 3,279 fail under both, 0 differ |
| shadow | corpus 18,825 of 18,825 matched; self-compile 5,210 of 5,216, six named unlowered |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,210 claimed and byte-identical; corpus 8,934 identical, 0 differ, 0 fell back |
| L2 self-compile fuel, C2k tree to this tree from one seed | 94,794,164,104 to 94,822,456,476 (+0.030%) |
| seed size | 6,465,215 to 6,466,781 (+1,566) |
