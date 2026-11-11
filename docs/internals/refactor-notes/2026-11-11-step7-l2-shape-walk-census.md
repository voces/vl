# Step 7 L2 §7: where the shape walk runs untyped, 2026-11-11

The spelling-predicates note (`2026-11-11-step7-l2-spelling-predicates.md`) found the shape
walk's array and map tests untyped in about 700 programs. This note counts where those untyped
reaches come from, and names what is left after #7160, which closed the largest source. The walk
is `internShapeDeepTy`, `internShapeDeepTyGo` and `internFuncTypeShapesTy` in
`emit_shape_intern.vl`.

The base is master `94b382ce`. The population is the sweep's `cases` population: 7,442 programs.

## Census

The probe ran in a scratch compiler that was never refreshed into a seed, using the accumulator
of the predicates note. Every call site of `internShapeDeepTy` and `internFuncTypeShapesTy` set
a label. An entry with a type of -1 was tagged with that label, and with whether it came from
outside a walk (`top`) or from a descent. For a descent, the tag also says whether the level
above held a type. The positive control is the reach tag: the walk is entered in 5,952
programs, and the function-type walk in 1,709.

On master, 780 programs enter the walk with no type at least once. By source:

| source | programs | what is untyped |
| --- | --- | --- |
| `internInlineShapeTyGo`'s field walk, entered from outside a walk | 423 | an arm mint (`internArmShapeRow`) passes `tyIx` -1 so the arm's type is not banked (D34), and hands that type as `fieldsTy`. The field walk read its type off `tyIx` |
| `collectAnnShapes`, a `TypeRef` with no type | 346 | node -1 in 227 programs; a generic-alias parameter's declared type -1 in 138; a canon-rewritten node -1 in 123 |
| descents from an untyped level | 132, 46, 26, 18 | the array, map, `\| null` and paren peels below an untyped root |
| descents from a typed level | 29, 8, 7 | a union arm the arm-type hand-over did not cover, and a function's parameter or element step |

## The largest source, closed by #7160

The arm mint passed `tyIx` -1 and kept the arm's type in `fieldsTy`, but the field walk read
its field type off `tyIx`. #7160 reads the field type off `fieldsTy` for the walk, the field
code and the store. This lane measured the walk half of that change on its own, before #7160
merged, as a scratch cut. It handed only the walk the field type read off `fieldsTy`:

- **Targeted A/B.** The 423 programs that reach the arm mint were built with the master seed
  and with the scratch candidate. 0 exit codes differ and 0 modules differ in bytes.
- **Agreement.** In every one of the 423, the arm's type has the field.

## After

With the walk reading `fieldsTy` (the scratch cut, measured before #7160), 408 programs enter it
with no type, down from 780. What is left:

- **`collectAnnShapes`, 346 programs.** An untyped annotation's walk mints a row in 20 of them.
  The spellings are interface and record shapes, such as `{toString():string}`,
  `{x:i32|string}` and `{eq(T):boolean}`, so the walk cannot be skipped. The next cut gives
  these annotations a type, or says why they have none.
- **Descents below that untyped root**, by the step that lost the type: the array peel (121),
  the map peel (39), the field walk (33), the `| null` peel (19) and the paren peel (17).
- **16 field walks that start outside a walk** with neither `tyIx` nor `fieldsTy`.
- **A union arm the arm-type hand-over does not cover**, reached from a typed set (29).

## Proof

This PR changes no compiler file. The counts come from the probe compiler described under
Census.
