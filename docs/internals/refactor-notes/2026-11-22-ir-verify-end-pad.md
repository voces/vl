# IR verifier: thirteen legacy queries become builder records (2026-11-22, lane IR-D1)

The second batch of D17049 retirements, after `letBindTy` (#9592). In each case the verifier asked a
legacy emit helper for a fact the builder had already computed while building the node. Now the
builder records the fact on the node or the function, the verifier reads the record, and the
import goes. One commit per mechanism.

| query (module) | verifier function | record |
| --- | --- | --- |
| `fnFallThroughPadOf` (wasmEmit) | `irVerify`, rule 5 | `IrFn.irEndPad`, set in `ibReset`; `lowerBody` reads it too |
| `objLitArmOf` (wasmEmit) | `recIsVariant` | `RMakeRec.mrVariant`, now set on every record from the arm the builder chose |
| `truncSatPlanOf` (wasmEmit) | `truncSatCheck` | `RTruncSat.tsOp`/`tsFrom`/`tsTo`; the lowering writes `truncSatTail(tsOp)` |
| `exprEffectFree` (emit_base) | `rhsCheck`, `RToBox` | `RToBox.bxFree` |
| `memAccessPlanOf` (wasmEmit) | `memAccessCheck` | `RMemAccess.mmBase`/`mmPrim` |
| `atomicPlanOf`, `atomicValPrim`, `atomicResultPrim` (wasmEmit) | `atomicCheck` | `RAtomic.amBase`/`amValPrims`/`amResPrim` |
| five SIMD row queries (wasmEmit) | `simdCheck` | `RSimd.sdMemBase`/`sdPrims`/`sdResPrim` |

ir_verify's legacy imports: 29 → 16, from 8 modules, called in 5 functions. Counted by parsing its
import lists and the uses in each function, comments stripped. The filing's "10 modules" counted
wasmEmit's two import lists separately.

## Controls

- The falls-off-end self-test (record "") is refused under rule 5.
- The box-immediate-for-call self-test (`bxFree` false) is refused under rule 2.
- Every other record is set only on a node the builder accepted, so an identity diff of 0 under
  `--names`, `--cases` and `--claimless` shows the verifier refuses nothing it accepted before.

The measurements are in the PR body.
