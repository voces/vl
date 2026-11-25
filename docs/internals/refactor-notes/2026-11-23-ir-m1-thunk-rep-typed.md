# IR-M1: a closure thunk's open result type typed by its rep (2026-11-23, lane IR-M1)

One mechanism, from the module pieces I8 needs gone (`legacy module: closure thunk`).

## What legacy writes

`emitCloThunkCode` writes each parameter's `local.get` and then a tail call of the target. Its
bytes depend only on the target's signature, never on a VL type.

## The change

- `buildThunk` used to refuse every thunk whose target's result type was open (`thunk open
  result type`). `thunkRetTy` now types the result by the rep's own type (`repTyOf(rr)`) where
  that type is closed and maps back to `rr`.
- The function is marked `irRetFromRep`, so the verifier knows the type came from the rep:
  checking that it maps back to the rep would prove nothing.
- Coordinator ruling: for a marked function, verifier rule 1 checks the thunk's contract
  instead (`thunkForwardWhy`):
  - the function is `irThunk`;
  - its body is exactly `t = call f(...)` and then `return t`;
  - each argument is the thunk's parameter `i + 1`, in order, at the noted callee signature's
    parameter rep `i`;
  - the temp, the function's result and the signature's result are one rep.
- The signature note comes from the same builder (`irSigNote`, from the callee's frame reps).
  The check therefore catches a wrong local, a reorder or a different return, but not a wrong
  note. Every ordinary call to the callee is checked against that same note, so a wrong note
  already shows there and in the byte identity (coordinator ruling).
- Self-tests:
  - `rep-typed-thunk-forwards` holds;
  - `rep-typed-thunk-forwards-env` and `rep-typed-result-not-thunk` are refused, rule 1.
- The shadow test "a thunk's open result type stands as its rep's own only where that
  round-trips" pairs a thunk that matches with two that stay uncovered.

## Readings

- On the 25 programs with an uncovered thunk, the thunks matched go 96 → 115 of 147. Claimless is
  identical.
- Census, master e4642aa0 → head: `legacy module: closure thunk` goes from **25 to 16 programs**.
  The self-compile still has none.

## Left

The coordinator ruled these out of this batch, and they now belong to lane IR-N5. They need
open-type support of their own:

- 20 thunks whose rep's own type is open too;
- 12 whose parameter rep is `unsup`.
