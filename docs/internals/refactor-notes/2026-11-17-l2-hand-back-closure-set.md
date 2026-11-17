# L2: a set stays tagged through a callee that hands its member back in a closure or a field, 2026-11-17

D16843 part 2, ruling A (revised): a capability gap in mono's per-type split; check stays as is.

## The mechanism

A generic handed to a parameter is split per type by the tagged set. `mid` takes the member's id,
and each call through it dispatches to that member's instance at the call's types. A set with a
generic member is decided only after the elaboration (`setBindTryClass` G). Two things left it as a
closure once the parameter was captured:

- the elaboration marked it partial for a parameter read inside a nested function
  (`elabMintHandedNested`);
- the late decision found no complete fact for a call whose callee is a call or a field
  (`ftMintComplete`, check_fn_tag.vl:1239/1265 before the change).

One closure serves one type, so mono refused with many pins.

## The change

`check_hand_back.vl` gains two queries. `handBackCallParam` covers a call, with no arguments, of a
closure that returns only the parameter. That closure is either held by a `const` (`handBackLamOf`)
or made by a declared function's call (`handBackCloIx`, optionally at a record field), and may be
read through a `const`. `handBackFieldParam` covers a record field a declared function returns
holding the parameter bare (`handBackFieldIx`). Both deciders read them:
- `elabCalleeParam` and the nested-read and field-init arms (emit_elab.vl);
- `ftMintComplete` (check_fn_tag.vl).

## Measured

- `generic-value-handed-back-two-types.matrix.vl`, master → this: 14 cell-faces refused → RUNS.
  These are record, record_bound, capture, capture_bound, capture_record, capture_record_bound and
  capture_local, each in both faces. 64 of 64 graded run, `call1` stays owed, 0 `runs → not-runs`,
  0 silent.
- Corpus fingerprint, fixpoint seeds both sides, from one worktree: 2 of 20,896 files move. They are
  the two fixtures converted from `@emit-error` to `@run` (refused → built).
- Not covered: the top-level spellings, where no parameter carries a set. They are D16933 (bound,
  one type) and D16934 (two types).
