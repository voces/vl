# Producer slice N1 measured: a set forwarded through a literal is instance-keyed, 2026-11-16

Lane STORE, the N step's first producer slice by the shape count: a parameter wrapped in a list or
record literal and handed on, 8 programs (`call0([g], x)`, `call0({ f: g }, x)`, and a `const`
naming one). Built on branch `store-n1`, measured, and **not landed** (coordinator, 2026-11-16).
This note records why.

## What was built

- The set-binding producer forwarded a caller parameter's sets through a list or record literal
  argument, along the element or field path, to the callee's path call (`fs[0](x)`, `r.f(x)`).
- The arrow facts read the outer call's own argument along that path.

## Result

ftlate probe, all `@run` programs: the late-changed population did not move (288 → 288). 13 N sets
were found (191 → 178), but they turned partial (P 123 → 131).

## Why: the forwarded set does not key the instance

A set handed to `fs` through `[g]` is not in `fs`'s type: the literal's element type is the hole
function type. So `call0`'s instance is keyed by `x`'s type only, and when two callers forward
different sets (`run(id)` and `runDbl(dbl)`), one instance of `call0` serves both. The path place
`fs[0]` is then reached by both sets, which is partial in the producer's terms. Deciding it needs
an instance per forwarded set: the per-instance key that G, the P residue's `lack` arm and D16747
also wait for.

## The unsound first draft (caught by the A/B)

The first draft gave a forwarded set its own fact at the path call. On
`tests/cases/functions/hole-param-list-literal-called-at-two-types.vl` the check then tagged
`{dbl}`, built its arms at `fs[0](x)`, and those arms were typed in every instance of `call0`,
including the one where `x` is a boolean:

    hole-param-list-literal-called-at-two-types.vl:14:26: operator '+' is not defined for boolean and boolean

A path fact must read only the outer call's own argument, never the union of every caller's sets,
and a forwarded set at a path place shares the instance. With both, the slice is sound and moves
nothing.
