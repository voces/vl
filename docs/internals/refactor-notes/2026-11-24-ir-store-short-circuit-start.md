# IR: a store whose value is a staging `??` (2026-11-24, lane N10)

`map store short-circuit operand` and `field store short-circuit operand`: #9844 made a boxed
binding's `??` (the `valBox` and `valScalar` arms) a staging `??` (`coalArmStagesLeads`). Like a
valued `if`, it writes the temps staged before it below its tag test, and `irBStageLeads` already
stages a store's leads for it. Two guards still read every boxed `??` as an in-place node that
nothing may be staged below. `ifBelowLeadOf` tested `!inPlaceFrom(b, at)`, so the field store and
its other callers missed. `mapSetStageLeads` returned before staging on `inPlaceFrom(b, vAt)`.
#9844's two matrix templates (`coalesce-boxed-binding-{scalar,wide}-default`) left 14 start cells
uncovered: 10 map stores (map_set, map_value, map_value_place) and 4 field stores
(struct_field_assign), in both faces.

- `inPlaceUnstagedFrom`: `inPlaceFrom` less a staging `??`, so a non-staging `??` or a push
  receiver's stage still blocks.
- `ifBelowLeadOf` asks it in place of `inPlaceFrom`, beside #9866's `storeFrom`, so a staging `??`
  whose value stores still misses.
- `mapSetStageLeads` sends a staging `??` down the staging branch, as it does a valued `if`.

Legacy writes the receiver, then the key, then the value with its `??` in place, then the set.
The staged temps keep that order. `store-short-circuit-value-effect-order.vl` logs it with an
effectful receiver, key and default: receiver, key, then the default only on `null`, the same on
both seeds.

## Legacy tails the IR calls

None new: the map store's `mapRecvRefTail` / `mapRecvKeyTail` / `mapSetTail` and the field
store's, as the valued-`if` staging already calls them.

## Readings (base 052fa48d, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| census provenance | base arm: `compiler/ir_build.vl` (the only compiler file this PR touches) at 052fa48d's copy |
| tests/cases (IR-only census), every class that moves | `map store short-circuit operand` 15 → 0, `field store short-circuit operand` 5 → 0, `start: map store short-circuit operand` 3 → 0; `is box not a local` 0 → 1 and its start row 0 → 1 (below); self-compile 0 missed; fully IR-only 6,260 → 6,264 of 7,289 |
| outside this PR's witnesses | `closures/coalesce-nullable-function::F` (field) and `numerics/literal-width-reaches-generic-and-nested-list::g` (map) covered and matched; `maps/record-join-place-is-complement` `go` and `@start` past the store to `is box not a local`, uncovered on both seeds, no mismatch |
| #9844's matrices (`capability-matrix.vl --generate`, 110 programs) | 14 start cells (10 map, 4 field) → 0; no uncovered, mismatch or fail row on head |
| distilled corpus, mode 4 | rows identical |
| Q58 sweep (`store-short-circuit-value-positions.vl`, `VL_IR_SHADOW=6`) | 24 functions and the start: base 14 and the start miss, head all matched; output identical; claimless identical 2 of 2 with the effect-order witness |
| `ir-identity.sh <base> <head> --names` | identical 9433, differ 0, built under one only 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7867, fail under both 68, differ 0, expected divergence 2 (master's baselined arm-site rows); witnesses same 69, differ 0 |
| `ir-identity.sh --claimless` | identical 14464, differ 0 |
| legacy A/B (tests/cases + probes) | 7,937 programs, 0 moved |
| L2 self-compile fuel per PR | +0.00% on 126,345,478,910 |
| late demands / late tag rows | 10 (baseline 10) / 310 (baseline 310, 0 gone) |
| `self ir misses` | 0 (baseline 0) |
| `lint-self`, `gate.sh --fast` | clean, passed |
| IR tests, door guard, emitter audit (`SELFHOST_NATIVE_ALIGN=1`) / `vl_deep_nesting_test.ts` | 572 passed / 8 passed, 0 failed |

`vl_ir_shadow_test.ts`'s map store row pinned a boxed `??` value as a named miss; it is now covered
and matched, and the row wants it so.
