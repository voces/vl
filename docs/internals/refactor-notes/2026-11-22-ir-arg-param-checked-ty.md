# IR: a call argument's parameter type is `paramCheckedTy` (2026-11-22, lane IR-D1)

The `start: argument coercion` class (closure → `?`, from IR-M1's residue list) is one mechanism.
At a direct call, the builder delivers each argument at
`repNodeOfTy(bundleHeldTy(p, scopeTyAt(p, inst)))`. For a function-typed parameter whose scope
records no type, `scopeTyAt` is -1, so the target rep is outside the tree. The closure argument
then never equals it.

## The change

The argument site reads `paramCheckedTy(p, inst)`: the scope type, else the annotation
(`annTyOf(parTyNode(p))`, #9554). `calleeSig` already reads the callee's parameter reps this way,
so the argument now lands at the rep the callee's signature declares.

## Witness

A probe that printed both reps at the miss gave `closure -> ?` with a parameter type of -1 in all
35 rows across the 33 files (33 in `start`, 2 elsewhere). The measurements are in the PR body.
