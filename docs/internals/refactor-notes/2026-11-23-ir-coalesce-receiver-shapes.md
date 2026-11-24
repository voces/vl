# IR coverage: field-coalesce receiver shapes and an undecided constant join (2026-11-23, lane IR-N2)

This follows #9770's `start: coalesce field place`. The remaining receivers came in four shapes;
this note takes two of them. It also takes the last two `union if static condition` rows, the
`s ?? "n"` of a generic instance whose pin decides the null test.

## Design

- **Undecided constant condition.** `unionIfLink` missed any immediate condition that
  `staticValueIfCond` does not decide (a decided `is` or a literal `true`). Legacy's
  `emitUnionIfValue` writes such a condition as its `i32.const` with both arms live (seen with
  `wasm-dis` in `mixed$1`). The IR now builds the link that way. The dead-arm path for a decided
  condition is unchanged.
- **Narrowed nullable local.** A local narrowed past its null reads at a recover
  (`narrowedLocalRead`'s `held` and `plain` arms, `rcV` the variable). That recover is now
  registered in `irReadAgain`, as legacy's `emitIdent` writes `local.get` and `ref.as_non_null`
  again on `emitCoalesceUnionField`'s present path.
- **Loop variable at its storage.** `storageReadOf` now takes a walk's loop variable
  (`ibDeclVar`), as it takes a `let` or a parameter. A loop variable narrowed to an arm the
  coalesce casts itself (`cfCast`) is read at its box, as a variable.

No legacy code changes and no verifier relaxation.

## Legacy tails the IR calls

- None new. The recover and the box read are the existing `RRecover` and variable lowerings,
  written again by `irLReadAgain` and `irHoistRecv`.

## Open

Two field-place start cells remain, both a field of a narrowed union global (`b.h.x ?? 7` in
`mixed-union-list-nested-null-leaf`, `wr.c.v ?? 0` in
`kept-maker-record-copied-into-union-member-runs`). The narrowed read's box is a temp, so the
narrowing cannot be registered for writing again under the same node as the box's own read.
