# IR coverage: a list element or map value narrowed to its function arm (lane COV-UNION, 2026-11-26)

## box → closure

`if xs[0] is (x: i32) => i32 { xs[0](1) }`, where `xs: (((x: i32) => i32) | string)[]`, and the
same over a map value, `m["a"]` (`narrowed-fn-arm-place-call`). Legacy reads the box, takes its
payload and casts it to the closure's heap (`refListReadUnboxOf` gives the function arm's box tag;
the map's narrowed read takes the same unbox). The builder refused both:
- the element read, because `refUnboxedAt` admitted only containers and scalar atom kinds
  (`index element coercion`);
- the map read, because `narrowedMapReadOf`'s `unbox` arm admitted only a scalar rep
  (`map get union box rep`).

## The change

- `refUnboxedAt` (`ir_build_ref`): an unbox kind that is the read's own type's box tag
  (`boxTagOfTy`) leaves the closure rep.
- The map get's `unbox` arm (`ir_build`) and the verifier's map get rule (`ir_verify`) admit a
  closure read at its own type beside a scalar.

## Measured

Class cut (the `index element coercion` programs plus the sweeps), #10268's head before and this
tree after:
- `index element coercion`: function rows 7 → 6, start rows 4 → 2.
- Claimed functions: 100 → 101 of 109. Start bodies: 13 → 15 of 17. Programs fully claimed:
  9 → 11.
- `narrowed-fn-arm-place-call` is fully claimed (the third of my narrowed-union element rows).

Q58 sweep: `tests/cases/closures/narrowed-fn-arm-element-and-map-value-in-each-position.vl`
(called, arithmetic, passed, returned, the string arm read). Its output equals master's. Master
reports `index element coercion`, `map get union box rep` and `pre-path niche read` on it; this
tree reports blockers none, and the claim takes it.
