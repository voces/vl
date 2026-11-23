# IR: lifted capture write-back, both sides (2026-11-22, lane IR-N8)

A lifted function that assigns a capture hands it back after its result (D3664). Legacy seeds
`fbRetExtra` with those parameter slots (`fbSeedRetExtra`), and every exit pushes them
(`fbPushRetExtra`, inside `fbReturn` and before the end). A direct call's tail sets each one into
the caller's binding, the last first (`emitDirectCallTail`). The IR missed both sides:

- the call (`callee writes back captures`);
- the lifted body (`capture written back` at a read, `local slot` at an assignment, and
  `lifted extra results` in the forced census).

## The change

- `RCall.caWb`: the variables a call sets back, in the callee's result order.
  - The builder (`liftWriteBacks`) takes each from the capture list the call already passes.
  - The lowering writes the sets after the `call` and takes no tail form.
  - The verifier holds each one to a capture the call passes.
- `IrFn.irRetExtra`: a lifted function's assigned captures, built from
  `cloLiftWriteCount`/`cloLiftWriteCapAt`, at legacy's slot `1 +` the capture index.
  - The lowering pushes them at each return and before the end (`retExtra`).
  - It refuses if legacy's `fbRetExtra` is seeded, so the two pushes can never both run.
- In a lifted body, a capture is read and assigned as its parameter variable.
  - An assignment goes to `liftCapVar` where `localIndexOf` is legacy's write slot
    (`cloLiftWriteSlot`).
  - The read-side miss is gone.
  - The frame passes its own captures on to a lifted callee whether or not it assigns them.
- No tail form inside such a body, except a call of itself in return position.
  - That one takes legacy's `emitLiftSelfTailRet` form (`liftSelfTail`), the write-back dropped
    with the frame's own hand-back.
- Legacy's claim gate on `fbRetExtra` stays: the lifted bodies are shadow-only, while their callers
  are claimable.

## Readings

On the 16 programs of the classes, shadow mode, the master 43cc7022 fixpoint seed against the head:

| reading | master | head |
|---|---:|---:|
| covered = verified = matched | 359 | 425 |
| `callee writes back captures` | 29 | 0 |
| `local slot` | 34 | 0 |
| `capture written back` | 3 | 0 |

Misses this unmasks: `callee captures` 0 (3 before the frame-pass change), `box ladder` 1. The
full proof is in the PR body.
