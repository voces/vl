# L5 step 1: mono's instance builder takes an explicit request and one build frame, 2026-11-14 (lane Q)

Step 1 of `2026-11-14-phase-products-design.md` §3. Mono's instance builder used to receive its
inputs through module globals: the caller set them and the callee read them, cleared them, or
saved and restored them. Now the inputs a caller gives travel in one `InstReq` argument, and the
state of the build in progress lives in one `MonoBuild` frame. Two globals that nothing reads are
deleted.

## 1a: the request (`InstReq`)

`monoMakeInstance`, `monoMakeInstanceGo` and `monoMakeInstanceKeyOf` take `req: InstReq`.

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

- `monoInstanceFor` keeps its signature for its 11 callers that ask nothing more, and forwards to
  `monoInstanceForReq`. The 4 callers that set something call `monoInstanceForReq` directly.
- `monoMakeInstanceGo` reads `req.*` where it used to copy each global into a local.
- **`monoInstanceRetTy` was a leak.** It was set before one call and never reset, so every later
  `monoInstanceFor` in a widen context read the stale value. As a request field it is -1 for every
  other caller. The identity diff below shows that no corpus program observed the difference.

## 1b: the build frame (`MonoBuild`)

`monoMakeInstance` used to save, set and restore five globals around `monoMakeInstanceGo`. They
are now the fields of one `monoBuild` record. The function saves it once, installs a fresh frame
for the instance, and restores the outer frame when done:

| global (deleted) | field |
|---|---|
| `monoInstOwn` | `own` |
| `monoInstBindN`, `monoInstBindT` | `bindN`, `bindT` |
| `monoInstanceWidenRet` | `widenRet` |
| `cadInBaked` | `baked` |

The four sites that toggle `widenRet` around a delivery now write the current frame. Restoring the
outer frame therefore restores its own `widenRet`, which is exactly the old save-and-restore. The
frame is read deep in the instance walk (`monoInstBindTyOf`, `monoSubstInst`, the capture and
baked-callback checks). That is why it is a frame and not a parameter. L1's "instantiate into IR"
is where it becomes an argument.

**Dead state.** `monoCgcTvN` and `monoCgcTvV` were written at four sites and never read. They are
deleted, together with `monoLamCloneGenericCalls`'s two parameters that existed only to feed them.

**Two helpers retire, so the pin-helper count stays at 908.** The request constructor `instReqAt`
and the forwarding `monoInstanceFor` are new functions. To pay for them, the two readers of the old
globals are inlined at their callers:

- `monoSubstInst`, which was `substTyDeepOf(t, bN, bT, monoInstOwn)`, at its 6 callers;
- `monoInstBindTyOf`, at its 1 caller.

`tests/budget_pin_helper_test.ts` stays at its baseline.

Lane S's pin-walk globals and the key-staging tables (`monoKeyExtra*`, `monoExplicitBN`/`BT`, which
the pin walk also writes) are untouched. They follow lane S's stages 3–5.

## Gate

- **Seeds:** A is a fixpoint built from `git archive 1cece3a2b` (the master merged in). D is a
  fixpoint built from this branch (two `refresh-compiler.sh` runs `cmp`-equal, sha256 `c41f0d1c…`).
- **Identity:** `deno run -A scripts/probe-rollback-census.ts --fingerprint` (rc, diagnostics and
  emitted bytes per program) over `tests/cases`, `distilled/cells` and `distilled/named`. That is
  **20,064 programs, 0 different**.
- **L2:** `vl build compiler/entry.vl` of A's tree under A and under D gives identical bytes, equal
  to A. Guest fuel 87,159,156,298 (A) and 87,159,156,294 (D).
- **Other gates:**
  - `scripts/mono-tyaram-grid.sh`: 252 OK, 9 REJECT, 0 BAD, the same as A.
  - `distilled/regress.vl`: no runs lost.
  - `lint-self.sh`: clean, with every budget at or below its baseline.
  - `budget_pin_helper_test.ts`: 908, at its baseline.

## Lines and ratchet

- **Lines:** `compiler/emit_mono.vl` is **+169 / −184, net −15**. Its function count is unchanged
  at 908.
- **Ratchet:** `phase-state-census.vl` reads `hidden` **188 → 175**, with `emit_mono.vl` going from
  31 to 18. `scripts/phase-state-baseline.txt` is rewritten in this PR. `cross` and `surface` are
  unchanged at 593 and 1,166, because every deleted global was private to mono.
