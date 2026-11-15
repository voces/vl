# D16493: readers of the write-scan index and a minted instance

2026-11-15, lane K. `compose(gid, hid)(5)` after `hid("a")` and `app(gid, 7)` trapped in
`cwIxReadPastBuild`.

- **The asked-about node.** It is `hid$1`, the instance the monomorphizer made for `hid("a")`. `elabTopFn` asks the index about it,
  and so do `elabModuleLam` and `elabEnclosingFn` behind it. A probe compiler built from a scratch tree named the node: index
  74 against a covered length of 63.
- **The readers.** They now answer for a minted node without asking: not top-level, not module-level, and `-2`
  (not reached), as `elabEnclosingFn` already documented. Answering from `nodeSrc` was tried and
  dropped: it calls a closed instance demandable at another signature, which built the
  invalid-module face below.
- **Building the index after elaboration.** It has no point to build at. `monomorphize` mints instances while
  elaboration is still being asked about them, so any later build still leaves later mints
  uncovered.
- **What the trap hid.** With the readers fixed alone, the program built a module that failed to validate:
  inside `hid$1`, expected `string`, found `i32`. `hid` is held at `(string) => string`, while `gid` binds
  `B` at `i32`, and `monoBindArenaFullTys` dropped the second binding. It now returns 1 on that
  disagreement; `monoPinTyParamComposite` refuses a function-typed parameter on it. The
  emit_mono function count stays at 908.
