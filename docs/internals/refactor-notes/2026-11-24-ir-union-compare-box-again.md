# IR: a union compare's narrowed or captured box, read again (2026-11-24, lane N10)

`unionConcreteCompare` reads its box twice: once for the tag test and once for the payload, as
legacy's `emitUnionConcreteEq` re-emits a place. A box held in a temp passes only when
`recvReadsAgain` says the lowering can write that read once more (`irReadAgain`). Two reads built
temps with no such entry, so the compare missed with `union compare box`:

| rung | read | what it records |
|---|---|---|
| `narrowedLocalRead`, `ba == "box"` | a union local narrowed to a smaller union (`if k == "a" … if k == "b"`, a literal `match`'s second arm) | `{ sgV: <the local> }`, the same box |
| `captureRead`, plain `!atOwn` env read | a captured union read inside a closure | `{ evSlot, evAt }`, the env slot read again |

The container rung beside the first already recorded its read this way. A third rung, the
nullable recover (`rcV`), landed the same way on master in #9796.

A `let` that a closure writes is held in a cell, so neither rung sees one. The shadow row's
`bumped` case (`k == bump()`, where `bump` assigns `k`) is covered on both seeds, has identical
bytes, and prints the same.

## Legacy tails the IR calls

None new. The compare's tails are #9749's and #9780's (`unionEqTagTail`, `unionEqPayloadTail`,
`unionEqCmpTail` and the null-leg pieces). The second read goes through `irHoistRecv` →
`irLReadAgain`, which writes the recorded rhs: a `local.get` of the narrowed local, or the
capture's `struct.get` of the env slot, as legacy's re-emit writes them.

## Readings (base 9fa2d27a, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| tests/cases `union compare box` (IR-only census) | 7 → 1 functions; start rows 1 → 1 |
| per rung | box rung 7 → 2 (`e`, `orp`, `rec2`, `matchTwoLits`, `wide-union-forty-arms::name`); capture rung 2 → 1 (`litunion-mixed-type-member-dispatch::__lambda_0`), plus `coalesce box place` 2 → 0 (`capture-forin-loop-var` `__lambda_4`, `__lambda_7`) |
| tests/cases missed functions / fully IR-only programs | 1,855 → 1,847 / 6,037 → 6,038 of 7,175 |
| distilled corpus, mode 4 | rows identical, base and head |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7755, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14453, differ 0 |
| legacy A/B (tests/cases + probes) | 7,823 programs, 0 moved |
| L2 self-compile fuel per PR | +0.00% on 124,882,133,481 |
| late demands / late tag rows | 9 (baseline 9) / 307 (baseline 307, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| `lint-self`, `gate.sh --fast` | clean, passed |
| IR tests / `vl_deep_nesting_test.ts` | 509 passed / 8 passed, 0 failed |
| shadow row `union-compare-narrowed-box-again.vl` | head 7 covered = matched; base 4, 3 `union compare box` |

`capd`'s lambda builds identical bytes under both seeds: the box is
`struct.get $6 0 (ref.cast (local.get $0))`, read for the tag and again for the payload.

## Left in the class

- `opt-chain-scalar-unbound-box::f`: the box is `r?.b`, an optional chain with no re-read
  entry (the optChain family).
- `inferred-nullable-mixed-litunion-return` `@init`: a top-level `const` narrowed past `null`,
  read on the `nonlocal` arm. Recording the re-read in `globalBoxAt` moved nothing, so that edit
  was dropped.
- Corpus `f64nul_eqlit_list_bind` start: the box is a list element's field (`lv1[0].r`), no place.
