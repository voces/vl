# D15659: a generic member in a generic function's literal join gets its instance, 2026-11-11

Clause-1 close. Base is master `98b73ba7`.

## What was wrong

`if c { [id1] } else { [id3] }`, with `id1` generic and `id3(a: i32)`, joins to the closed
`((i32) => i32)[]`. No tag set is formed, so mono delivers each arm's function name at the join's
type (`monoCoerceIfArms` → `monoElabDeliver`). When `c` is a hole the enclosing function is generic
and the `if` is walked in its instance. `monoElabDeliver` refused every function-valued part
there (`inst`), so `id1` was never instanced, was emitted with no parameters or result, and the
list's closure call trapped (`indirect call type mismatch`). The record and nested-list spellings
traced the same path.

## The fix

One guard in `monoElabDeliver` (emit_mono.vl): inside an instance, a function NAME is still
delivered (`monoCoerceFnValueName`, which `monoCoerceIfArms` already uses for a bare join in an
instance). A lambda literal and the literal's own retype stay excluded, since the node is the
template's.

## Graded

Fixture `tests/cases/functions/list-or-record-join-of-generic-and-annotated-member-in-generic-fn.vl`,
seven cases, each with its own generic member so no case fixes another's instance. Run separately
on master, five trap (hole callee, direct call, record, nested list, two instances at
`(i32) => i32` and `(string) => string`) and all seven run now. A returned join and a two-element
list already ran. `--names` build of the hole-callee repro: `$id1` is `(param i32) (result i32)`, and
its closure thunk `return_call`s it at `(structref, i32) => i32`. No set is tagged here because the
checker closed the join's type, the same lowering as the `c: boolean` spelling.

[D15658](../inventory/D15658.md), the hole-callee spelling, closes with it.
