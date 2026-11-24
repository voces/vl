# IR: a literal's order stash beside a staging `??` in a store (2026-11-24, lane N10)

A follow-up to #9884. Its `inPlaceUnstagedFrom` excluded `receiverStageFrom`, which is both a push
receiver's stage (`RListStage`) and a literal's order stash (`RStashSet`). V2's mutant dropping
that term reddened nothing. A scratch-only mutant seed showed why. A store whose value is a
record literal written out of its row's order and holding a boxed binding's `??` missed on
master: `m["k"] = { b: tick(), a: q ?? five() }` (`type P = { a, b }`) and the field-store
spelling. Under the mutant both were covered and byte-identical to legacy, because the order stash
sets its fields below the staged leads, as the staging `??` does. The term was conservative, not
load-bearing, for the stash.

- `inPlaceUnstagedFrom` now names `listStageFrom` (the push receiver stage) only, so an order stash
  beside a staging `??` no longer blocks a store's staged receiver and key.

The `RListStage` half is an unexercised guard. No store value was found to hold a push receiver
stage beside a staging `??`: a `push` yields no value, so it sits in a value only as a statement
of a block, outside the operand range. It stays, named here.

## Legacy tails the IR calls

None new.

## Witnesses

- `tests/cases/maps/store-order-stash-staging-coal.vl`: a map store and a field store logging
  `tick` before the binding's test and `five` only on `null`. A nested literal default, itself out
  of order with its own `??`, logs the same inside it. The trace and the stored values are
  identical on both seeds, with the binding null and present.
- `tests/cases/maps/store-order-stash-positions.vl`: the Q58 sweep, covering map, field, list index
  and nested-receiver stores from a parameter and a global, with a scalar and a record `??`.
- `tests/ir-shadow-rows/store-order-stash-staging-coal.vl`: covered = matched, so restoring the
  exclusion reddens the row.

## Readings (base 0cd27e8b, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| census provenance | base arm: `compiler/ir_build.vl` (the only compiler file this PR touches) at 0cd27e8b's copy |
| tests/cases (IR-only census), every class that moves | `field store short-circuit operand` 4 → 0, `map store short-circuit operand` 3 → 0, all this PR's witnesses; no other row moved; self-compile 0 missed; fully IR-only 6,386 → 6,387 of 7,386 |
| distilled corpus, mode 4 | rows identical |
| Q58 sweep (`VL_IR_SHADOW=6`) | 19 functions: base 5 miss, head 19 matched; output identical |
| claimless, the three witnesses | identical 3 of 3; claimless compiler sha256 `287e8b37c9885957c95d1a7d89b6683eeae4e56cdd2442b51a117fee2db6c7cd`, built in 78d5bf1e with `compiler/` clean |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7964, fail under both 68, differ 0, expected divergence 2 (master's baselined arm-site rows); witnesses same 72, differ 0 |
| `ir-identity.sh --claimless` | identical 14472, differ 0 (the same claimless compiler) |
| legacy A/B (tests/cases + probes) | 8,034 programs, 0 moved |
| L2 self-compile fuel per PR | +0.00% on 126,929,094,555 |
| late demands / late tag rows | 10 (baseline 10) / 313 (baseline 313, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| `lint-self`, `gate.sh --fast` | clean, passed |
| IR tests, door guard, emitter audit (`SELFHOST_NATIVE_ALIGN=1`) / `vl_deep_nesting_test.ts` | 581 passed / 8 passed, 0 failed |
| shadow row | head 5 covered = matched; base 3, with 1 map and 1 field store miss |
