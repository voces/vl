# Type hash-cons stage 6b: two `tyquery.vl` walks take a visited set (lane HASH), 2026-11-16

Two more of the s6b21 census's load-bearing termination sites. With their limits raised,
`recursive-tree.vl` and `nullable-recursive-call-narrow-canary.vl` hang:

- **`tyObjFieldIsLitUnion`** and its union arm `tyUnionArmFieldIsLitUnion` ask whether a record holds a
  literal-union field at any depth. They counted down from 4. A type already in `seen` answers
  `false`.
- **`tyTvsAmong`** asks whether every type variable a type names is in a list. It counted up to 8, and
  its exhausted answer is `true`. A type already in `seen` answers `true`: one walked named nothing
  outside the list (else the walk had answered `false`), or the walk is on a cycle.

Each is a wrapper over a walk that visits a type once, and the depth argument is gone from every
caller, `fsbTvsInScope`'s included. Every caller passed the full budget.

## Grading (fixpoint seeds, master `8f94d30c2` vs this branch)

- The five recursive-type fixtures the census found hanging run, with these limits gone.
- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent.
- Capability matrix A/B over the 23 recursive, tree and self templates: 0 `runs → not-runs`.
- `tests/vl_scaling_shape_test.ts`: 90 of 90.
