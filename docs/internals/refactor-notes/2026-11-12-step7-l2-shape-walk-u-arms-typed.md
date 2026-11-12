# Step 7 L2 §7: the shape walk's class U reaches its arms typed, 2026-11-12

Class U is the shape walk's typeless class: its leaf mints a record row from a spelling with no
type (`2026-11-12-step7-shape-walk-typeless-census.md`). It has 7 programs:

- D15042, D1578, D4930;
- `closure-value-union-array-struct-elem-list-field`;
- `typaram-list-union-return-keeps-both-arms`;
- `nested-union-softening-list-return-twin`;
- `inferred-record-literal-list-union-arm-generic`.

The base is master `01f723226`, with a fixpoint seed on both sides.

## Where the type was lost

A probe at the leaf of `internShapeDeepTyGo` printed the walk's `(spelling, type)` path. In all 7
programs the type is present down to a union of records (for example `{x:i32}[]|i32[]@356`) and
becomes `-1` at the step that splits it into arms. That step is `internShapeArms`, and both of
its pairings decline:

- `unionMemberTysOf` keys by name. No row holds the name yet.
- `unionMemberTysOfAB` keys by type. No row holds the type yet either, because the walk runs
  before the union registers.

So each arm walks with no type, and its spelling decides the row.

## Changed

`internShapeArms` gains a third pairing, `unionArmTysByPos` (`compiler/emit_shape_intern.vl`),
which it tries only after both row pairings decline. It reads the set's own `TyUnion` members by
position, the order `tyNameUnion` renders its atoms in. It declines in two cases:

- the counts differ;
- an arm's member does not have the arm's shape, which is a record under the same number of list
  layers for a record arm, and anything else for a non-record arm.

It takes no render (the render-parse ratchet stays at its baseline), so a member holding a type
parameter, such as D15042's `{f: T}`, pairs like any other.

## Graded

- After the change, the probe reports no untyped record leaf for any of the 7.
- Each program's output is byte-identical to master's: it walks under its type and builds the
  row it built before.
- Seed: fixpoint. `lint-self`: clean. `regress.vl`: no runs lost, 0 cells → silent.
- Render-parse budget: ok, at baseline.

## What it leaves

D15042's `{f: T}` arm now walks typed, at a type that still holds a type variable. It joins
class G, which w314's cut 5 types at the instance. The census's U row should read 0 when it is
re-run.
