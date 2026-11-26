# A binding of an assignment into a literal-union place (lane COV-UNION, 2026-11-26)

## The refusal

`const v = k = "ww"`, where `k` is a `K | null` or `K` local, or a parameter. Legacy holds `v` as
an atom (`letBindIsAtom`), but its type is the single literal `"ww"`, which reps as a string, and
neither `letAtomCellTy` nor the shared-field rung found an atom type for it. So the IR refused
(`atom cell local rep`).

## The change

A third rung in `declVarOf`'s atom-cell ladder, `letAsgAtomTy`. An assignment yields the member
written, held at the place's declared type less `null`. The place is an Ident naming a binding or
a parameter (`asgPlaceDeclTy`, via `scopeTyAt`). The rung applies only where that type reps as an
atom.

## Tried and dropped

- **Following a name** (`const l = c`, where `c` is a global initialised by an assignment).
  `go` in `assignment/global-init-atom-assignment-positions.vl` then failed verifier rule 2 ("an
  atom decode is not of an atom into a string"): the IR reads the global `c` at the string rep, so
  holding `l` as an atom disagrees with it. Dropped.
- **A field place** (`const v = r.k = "zz"`, parenthesised or not). The binding's initializer is
  not the assignment node by the time the builder sees it, so the rung never applies. The field
  type's declared rung was removed as unproven, and the row stays open.

## Measured

Each arm runs from its own checkout: the merge base `903f71519` from a base worktree, and this
tree. The population is tests/cases plus the 65 regen-9 COV-UNION programs.
- `atom cell local rep` 7 → 4: `viaConst` (local), `g` and `after` are claimed. No other class
  moved.
- tests/cases: unclaimed distinct functions 246 → 243.
- `ir-identity.sh --cases`: differ 0.

The four still open:
- the field place;
- the global name (`go`);
- two start bodies (`discriminant-mixed-litunion-bare-literal-arm.vl`, D14570) whose binding is no
  assignment.

Q58 sweep: `tests/cases/literal-unions/binding-of-assignment-into-atom-place-positions.vl`.
- Positions: a `K | null` local, a `K` local and a parameter, in a function and at the top.
- Master blocks 3 functions. This tree has blockers none and matches under `VL_IR_SHADOW=6`.
- `VL_IR_REQUIRE_CLAIM=1` passes here and fails on master.
- Its `@log` lines match under `VL_IR_STRICT=1`.
