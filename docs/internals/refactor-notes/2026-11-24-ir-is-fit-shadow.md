# IR: an `is K[]` whose region reads the arm's empty `K[]` (2026-11-24, lane IR-N1)

`is empty fit shadow`: the last `is` family class, built along the redirect model the queue
pre-reviewed. `decided is fit shadow` is untouched.

## What landed

- **Builder rows** (`fitShadowVar`): a `shadow`-arm test (`emptyFitPlanOf`) whose
  `listFitShadowPlanOf` answers 1 adds one row per name, `K` and receiver local, in build order,
  which is legacy's emit order. A second test of the same row reuses its variable, as legacy
  reuses its local. The row's variable is a `local` of `K[]`'s list rep whose slot is unset.
- **Region reads** (`identRead`): a read matching a row (`listFitShadowReadsRow`, legacy's
  `listFitShadowRow` key) is that variable. Its consumers (`.length`, index, for-in, method
  receivers) take it as their operand through their lowerings unchanged. A capture read is a
  closure's own and never takes the outer row.
- **The test** (`RListEmpty.leFit`): the lowering first calls legacy's `listFitShadowSet`, which
  allocates the list-scratch local and stores the empty `K[]`, then sets the variable's slot to it
  (`listFitShadowLocalOf`) and writes the empty loop. A read of a variable at a slot the frame's
  shadow rows hold is followed by `ref.as_non_null`, as legacy's `fitShadow` read arm writes it
  (`listFitShadowHolds`), and `framedLocals` leaves that slot to the scratch the frame declares.
- **Named misses kept**: `is empty fit shadow grow` (a pushing arm's grow row),
  `is empty fit shadow capture` (a closure in the function reads the name), and
  `is empty fit shadow refused` (legacy refuses the receiver).
- `listFitShadowSet` is split (byte-neutral) into `listFitShadowPlanOf`, the store, and
  `listFitShadowLocalOf`.

## Legacy tails the IR calls

- `listFitShadowSet` (`wasmEmit`): the scratch allocation and the empty `K[]` store, in lowering
  order.
- `listFitShadowLocalOf`, `listFitShadowHolds` (`wasmEmit`): the stored row's local, and whether
  a slot is one.
- `listFitShadowPlanOf`, `listFitShadowTyOf`, `listFitShadowSameTy`, `listFitShadowReadsRow`,
  `liftedFnCaptures` (`wasmEmit`): the plan and row keys the builder asks.

## Proof against the pre-review's conditions

1. **Scratch order**: `tests/ir-shadow-rows/is-empty-fit-shadow-two-arms.vl` holds two shadow
   tests of different `K` in one function. Its claim-mode build is `cmp`-identical to legacy, and
   the disassembly shows the scratch locals (`$8`, `$9`, `$11` of one list, `$10` of the other)
   each stored and read through `ref.as_non_null` at legacy's indices.
2. **Reads before and after**: the same row reads the name before the test, in the region, and
   in a loop after it.
3. **Closures**: `tests/ir-shadow-rows/is-empty-fit-shadow-capture.vl` expects
   `uncovered is empty fit shadow capture = 1`, and the program prints the right value.
4. **Verifier**: the row's variable verifies with its slot unset (both rows: verified = covered).
   An ablated build whose store always misses gives `claim fell back: list fit shadow store`
   and a claim-mode wasm `cmp`-identical to legacy: the function falls back whole.
5. **Census** (tests/cases, base → head): `is empty fit shadow` 17 → 12 matched, 3 `…grow`,
   2 `…capture`. Per file: complement-list-record-scalar-and-hole 2 → matched;
   generic-body-list-union-read-ops 3 → matched; generic-body-narrowed-list-read-value 2 →
   matched; generic-complement-list-delivery-positions 3 → matched;
   generic-complement-list-union-positions 2 → 1 matched + 1 capture;
   is-list-arm-other-function-closure-same-name 1 → matched;
   is-list-arm-push-through-literal-pinned 2 → grow; is-list-arm-push-through 1 → grow;
   is-list-arm-read-by-closure 1 → capture. Corpus: 45,555 → 45,562 functions with no blocker.

## Bytes and coverage

- Self-compile `--names`: identical 9,037, differ 0. `--cases`: identical 7,753, differ 0.
  `--claimless`: identical 14,055, differ 0. `tests/cases` A/B: same 8,870, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to legacy.
- `tests/cases` armed shadow: covered = matched goes from 79,640 to 79,652.
- The first proof caught a recover written after every variable at or past the frame's
  list-scratch base. Thunk frames have no such base, so 2,712 thunks mismatched. The recover and
  the locals exemption now key on the frame's shadow rows (`listFitShadowHolds`).

## Fuel

L2 +0.05% per PR on base 992d11c7.
