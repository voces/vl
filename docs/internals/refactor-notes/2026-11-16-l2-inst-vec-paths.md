# L2: the instance vector on every pin path, 2026-11-16

Follows `2026-11-16-l2-inst-vec.md` (#8836). The coordinator chose option A: L2 records the vector
on the four paths that pin a binding without passing through `callFtyPinCstrs`, so STORE's A0 reads
rows rather than infers open calls from call shape. S3.4d stays STORE's.

## The change

Each row is keyed by (node, path, sub), because the paths share nodes:

| path | recorded in | node | sub | callee |
| --- | --- | --- | --- | --- |
| `IV_CALL` | `callFtyPinCstrs` | the call | the call | the named declaration, or -1 |
| `IV_UFCS` | `ufcsRevalidatePins` | the call | the call | the method's top-level declaration |
| `IV_HOLE_LAMBDA` | `judgeHoleLambdaAt` | the call handing the lambda | the lambda | the lambda |
| `IV_FSB` | `fsbRecheckOne` | the call | the owner re-checked under | `fsbOwnerCallee(owner)` |
| `IV_DECL` | `declCstrsAtBinding` | the binding's source | the owner | the owner |

- One call node can now hold several rows. A set-of-functions binding re-checks one call per owner,
  and a hole-lambda row sits on the call that also has its own `IV_CALL` row.
- **Never-padding on every path.** `withUnboundAsNever` (and `bareInferHole`, its only helper)
  move from check_calls to check_bind_rows beside the table. `instVecNoteNever` pads every path
  except the hole lambda's, which has no declaration. A UFCS call and its direct spelling then
  give the same vector.
- **Readers.** `instVecFind(node, path, sub)`, `instVecPathAt` and `instVecSubAt` are new.
  `instVecAt(call)` still answers the `IV_CALL` row. Nothing reads any of them yet.

## Measured

See the PR body: identity against #8836's fixpoint seed (fingerprint and
`check-filed-witnesses --strict`), plus the gates.
