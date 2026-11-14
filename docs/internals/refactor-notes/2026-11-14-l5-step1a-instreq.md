# L5 step 1a: mono's instance builder takes an explicit request, 2026-11-14 (lane Q)

The first slice of step 1 of `2026-11-14-phase-products-design.md` §3. `monoMakeInstance`,
`monoMakeInstanceGo` and `monoMakeInstanceKeyOf` now take one `InstReq` record. Before, the
caller set 9 module globals and the callee read and cleared them.

## What moved into the request

| global (deleted) | was set by | is now |
|---|---|---|
| `monoCallFrameSlot` | 4 callers, around `monoInstanceFor` or `monoMakeInstance` | `req.frame` |
| `monoMakeCallIx` | `monoInstantiateCallIn` | `req.call` |
| `cadDelivery` | `monoInstanceFor` | `req.delivery` |
| `cadDeliveryAt` | `monoCloCoerceBuild` | `req.delivery`, set by the caller |
| `monoSpecGoK` | `monoInstantiateCallIn` | `req.specK` |
| `monoInstRetWidenTy` | `monoInstanceFor`, `monoMakerTwin` | `req.retWidenTy` |
| `monoInstRetWidenKey` | the same two, always `tyToStr` of the type above | derived in `monoMakeInstanceGo` |
| `monoInstanceRetTy` | `monoCoerceFnValueTys`, and never cleared | `req.retTy` |
| `monoPinArgLit` | `monoInstantiateCallIn` | `req.argLit` |

`monoInstanceFor` keeps its signature for its 11 callers that ask nothing more. It forwards to
`monoInstanceForReq` with an empty request, and the 4 callers that set something call
`monoInstanceForReq` directly.

**`monoInstanceRetTy` was a leak.** It was set before one call and never reset, so every later
`monoInstanceFor` inside a widen context read the stale value. As a request field it is -1 for
every other caller. The identity diff below shows that no program in the corpus observed the
difference.

## Gate

- **Seeds:** A is a fixpoint built from `git archive 208e52d08`. D is a fixpoint built from this
  branch (two `refresh-compiler.sh` runs `cmp`-equal, sha256 `1b71f124…`).
- **Identity:** `deno run -A scripts/probe-rollback-census.ts --fingerprint` (rc, diagnostics and
  emitted bytes per program) over `tests/cases`, `distilled/cells` and `distilled/named`. That is
  **20,058 programs, 0 different** between A and D.
- **L2:** `vl build compiler/entry.vl` of `208e52d08`'s tree with A and with D gives identical
  bytes, equal to A. Guest fuel 87,032,230,658 (A) and 87,032,230,639 (D).
- **Other gates:**
  - `scripts/mono-tyaram-grid.sh`: 252 OK, 9 REJECT, 0 BAD, the same as A.
  - `distilled/regress.vl`: no runs lost.
  - `lint-self.sh`: clean, with every budget at or below its baseline.

## Lines and ratchets

- **Lines:** `compiler/emit_mono.vl` is **+88 / −79, net +9**. The record type (10 lines), its
  constructor (10) and the forwarding `monoInstanceFor` (10) are fixed costs, and the 9 deleted
  globals do not cover them yet. The step's deletion comes with slice 1b, which brings in the five
  scoped globals `monoMakeInstance` saves and restores (`monoInstOwn`, `monoInstBindN`/`T`,
  `monoInstanceWidenRet`, `cadInBaked`). Those globals are read deep in the instance walk, so 1b
  threads a walk context rather than a request.
- **Key staging is held back.** The six key-staging tables (`monoKeyExtra*`, `monoExplicitBN`/`BT`)
  are also written from the pin walk (`monoPinTyParamComposite`), which lane S stages 3–5 delete.
  They follow S.
- **Ratchet:** `phase-state-census.vl` (PR #8105) reads `hidden` 188 → **181** on this tree, with
  `emit_mono.vl` going from 31 to 24. The census rule counts a saved-then-written global, so the two
  seats set without a save (`cadDeliveryAt`, `monoInstanceRetTy`) were never in its count. Whichever
  of the two PRs lands second runs `--write-baseline`.
