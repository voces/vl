## Codegen, memory & runtime (Track B)

- **IR coverage: a union box compared with a concrete operand.** `k == "a"` over a `"a" | i32 | null` box is legacy's union compare (`eqRouteOf`'s `unionLeft`/`unionRight`): the box's tag against the literal's arm, then the payload compare. The IR sent it to its string compare, which missed at `string operand coercion`. `emitUnionConcreteEq`'s plain arm is now a plan (`unionConcreteEqPlanOf`) and three tails that legacy and the IR's `RUnionConcreteEq` both write. The IR asks `eqRouteOf` for the route.
