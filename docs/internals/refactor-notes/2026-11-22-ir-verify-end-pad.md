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
- One self-test per plan family, each refused under rule 2 and holding (rule 0) when the plan
  agrees: `trunc-sat-operand-off-plan` (an i32 operand, `tsFrom` f64), `atomic-value-off-plan` (an
  i32 value at an i64 row), `memory-store-value-off-plan` (an i32 value at an f64 width) and
  `simd-operand-off-plan` (an i32 operand at v128).
- `mrVariant` has no disagreeing spelling to test: the builder sets it from the arm it builds by.
  Identity at 0 under `--names`, `--cases` and `--claimless` shows the verifier refuses nothing it
  accepted before.

The measurements are in the PR body.
