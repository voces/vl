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
- `ifBelowLeadOf` asks it in place of `inPlaceFrom`.
- `mapSetStageLeads` sends a staging `??` down the staging branch, as it does a valued `if`.

Legacy writes the receiver, then the key, then the value with its `??` in place, then the set.
The staged temps keep that order. `store-short-circuit-value-effect-order.vl` logs it with an
effectful receiver, key and default: receiver, key, then the default only on `null`, the same on
both seeds.

## Legacy tails the IR calls

None new: the map store's `mapRecvRefTail` / `mapRecvKeyTail` / `mapSetTail` and the field
store's, as the valued-`if` staging already calls them.

## Readings (base @@BASE@@, fixpoint seeds on both sides)

@@READINGS@@
