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

`internShapeArms` gains a third pairing, `unionArmTysByRender` (`compiler/emit_shape_intern.vl`),
which it tries only after both row pairings decline. It reads the set's own `TyUnion` members:

- Each arm takes the one member whose `tyToEmitName` is that arm.
- One arm left over takes the one member whose render is `""`. That is a member holding a type
  parameter, such as `{f: T}` in D15042.
- Any other outcome declines, as before: a count that differs, two members with one render, or
  more than one arm left over.

## Graded

- After the change, the probe reports no untyped record leaf for any of the 7.
- Each program's output is byte-identical to master's: it walks under its type and builds the
  row it built before.
- Seed: fixpoint. `lint-self`: clean. `regress.vl`: no runs lost, 0 cells → silent.

## What it leaves

D15042's `{f: T}` arm now walks typed, at a type that still holds a type variable. It joins
class G, which w314's cut 5 types at the instance. The census's U row should read 0 when it is
re-run.
