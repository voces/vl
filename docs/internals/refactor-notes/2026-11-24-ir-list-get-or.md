# IR: the fused `xs.get(i) ?? d` over a scalar list (2026-11-24, lane IR-D1)

`coalesce listGetOr`: the IR's named miss for legacy's fused checked read with a default
(`coalArmOf` → `listGetOr`, `emitListGetOr`). Census on `80d557f6`: 101 rows in cases and 2 in
witnesses. None in self, distilled or probes.

## Mechanism

Legacy writes `xs.get(i) ?? d` as one unsigned bounds compare, `len u> i`. That compare opens an
`if` at the element's rep. The arm reads `backing[i]`; the `else` writes the default at the
element rep. The head reads the receiver and the index twice, straight from the call. A place it
can read twice (a name or a field path, and a literal, negated literal or name index) is
re-emitted. Any other operand is staged in the `.get` stash.

- **Legacy.** The head moves out of `emitListGetOrGo`, unchanged, as the exported `listGetOrOpen`.
  It returns the element kind, or null after the same named failures. `emitListGetOrGo` is now that
  head plus `emitScalarValue` and `end`. The seed's bytes are unchanged (names and self-compile
  identical, below).
- **IR, builder.** `coalListGetOr` mirrors `coalPopOr`. It takes only operands legacy re-reads in
  place (`optRecvReReadable`, `listGetIdxReReadable`). The receiver is built as `cbL` at an
  `RList` whose element is the `??`'s rep. The index must build no node, at `i32`. The default is
  built into the `else` block, writing a slotless out, as `coalPopOr`'s is.
- **IR, lowering.** The new `SCoalBox` arm `listGetOr` skips `cbL`, settles pending, and calls
  `listGetOrOpen`. It then lowers the default body and writes `end`.
- **Verifier.** `coalListGetOrWhy` checks that the operand is a list of a scalar element (a
  number, `boolean` or atom, the test `coalPopOrWhy` now shares as `scalarListElem`) and that the
  out is at that element's rep. Self-tests: `list-get-or-holds` (0) and
  `list-get-or-record-list` (rule 2).
- **Named misses.**
  - `coalesce listGetOr staged operand`: a call or operator receiver or index, which legacy stages.
  - `coalesce listGetOr index operand`: an index that builds a node, such as a module global read
    at `@start`.

## Population, by origin

Each census arm ran in a tree at its own commit: base `80d557f6`, head `2be8a5d3`.

- cases: `coalesce listGetOr` 101 → 0. The pins (`pop-get-or-result-rep-*`, `boolean-elements`,
  `capacity-and-get`, `build-fusion-f64`, …) are claimed. Left: 13 `staged operand`
  (`get-or-default-receiver-first` ×4, `listget-call-operands-once` ×2, `list-get-effect-index`,
  the non-hoisted `list-get-nested-stash-*`, …) and 2 `index operand` (the `i32`/`f64`
  `list-get-nested-stash-*-hoisted` `@start`, whose index is a module global).
- witnesses: the D3756 and D17381 `@start` bodies stay unclaimed. Their call operands are staged;
  the miss now names that.
- Claimed functions lost: 0 in self, distilled, probes and witnesses. Cases shows 2, both a
  name collision: `inner` is claimed and unclaimed in one file, with rows identical on both arms
  (`generics/nested-generic-*-capture*.vl`).
- Distinct functions claimed: cases 43978 → 44110 (the sweep adds 72); self 20680 of 20680 →
  20685 of 20685 (source growth).

## Readings

Fixpoint seeds on both sides. Head seed sha256 `92b1c0f6…a675`.

- Identity:
  - names: `identical 9433, differ 0`; self-compile identical.
  - cases: `identical 8151, differ 0` (2 expected divergences, listed on master); witnesses
    `same 87`.
  - claimless: `identical 14506, differ 0`. Claimless compiler sha256 `0ee82b6d…f3be`, built in
    `caa7b260`, `compiler/` clean.
  - legacy A/B: `8219 same`, no DIFF.
- Q58 sweep (`tests/cases/lists/get-or-positions-{i32,f64,boolean,atom}.vl`). Nine positions:
  - let init, list element, argument, return, record field, if arm, nested argument,
    interpolation, assignment.
  - Each position is called at a hit, a miss and a `-1` index.
  - Also covered: a literal and negated-literal index, a field and a global receiver, a
    `xs.get(i) ?? ys.get(j) ?? d()` chain, and a `?? (if c { d() } else { e })` default.
  - `d()` counts its runs; each file prints `24`, so the default ran on exactly the misses.

  Results:
  - All four run as expected, and the base and head builds are byte-identical.
  - Shadow: 78 of 79 functions matched per file (base: 64, with 15 `coalesce listGetOr`). The one
    left is the interpolation, `string operand after another`, which runs and is
    claimless-identical (#24).
- Fuel: per PR +0.05% on 129492555896 (base `80d557f6`).

## Legacy tails the IR calls

- `listGetOrOpen` (`wasmEmit.vl`): the fused `get ?? d` head, moved out of `emitListGetOrGo`
  unchanged.
