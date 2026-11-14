# D4034: an overload candidate's return bound by its arguments

**Change.** `ovHoleCallTy` (`check_member_call.vl`) refused a candidate whose return type held a
type variable. `ovArgBoundRet` binds each candidate's type parameters from the explicit
arguments' types with `bindGenWalk`, the receiver-concrete path's binder, and substitutes the
return. It declines only a return variable no argument binds, one `self` names, or an inference
hole. The arguments are checked once, before the candidate loop, instead of after it.

**Measured.** A receiver-overload set needs two modules, and the matrix template format has one,
so the grid is the module fixtures: `overload-generic-return-bound-by-argument` (seven
spellings, all refused before, all run) and `err-overload-generic-return-receiver-bound` (the two
refusals that stay, each with the sentence of its own cause). `overload-per-instance` and the
other `overload-*` module cases are unchanged.

**Size.** Net +31 compiler lines (one helper and its three-line comment); pin-helper delta 0.
