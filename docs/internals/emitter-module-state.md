# The emitter's module-scope state — where each piece is reset, and what is not

**Re-derive before quoting: `python3 scripts/emitter-state-audit.py`.** Every number below
is that script's output on 2026-09-01. A hand-written audit table goes stale in ONE
direction — a variable that gains a reset keeps reading as a hazard, and one that LOSES a
reset keeps reading as safe, which is the direction that ships bugs.

## The hazard, in one sentence

The compiler is a wasm module, and its module-scope `let`s live as long as the
`WebAssembly.Instance` does — not as long as one compile. **`vl` compiles once per process,
so the CLI can never see a leak.** Two drivers compile MANY programs through ONE instance:

* `tests/cases_wasm_test.ts` — one instance over ~2,500 corpus cases.
* the LSP server — `lsp/src/wasmCheckerNode.ts`, "one instance is reused across keystrokes",
  and `checker.compile()` (the playground's Run path) hands back the emitted bytes.

Three defects have now come out of this: **D1003** (stale `ufcsAlias` rows, reached the LSP),
**D986** (`ba8Used`/`fa32Used`/`fa64Used`/`ia64Used` reset nowhere — a V8-only invalid
module), and **D1006/D1007** (below, found by the harness written for D986).

The standing instrument is `tests/vl_instance_state_leak_test.ts`: compile P on a shared
instance and require byte-identity with P on a fresh one. **Nothing here is settled by
reading; it is settled by a witness**, and this document only says where to look.

## Where the 445 mutables are cleared

`let` / `export let` at column 0 in `emit_*.vl` + `wasmEmit.vl`, classified by the enclosing
function of the assignments that write the declaration's own initial value back:

| where | count | when it runs | what it protects |
|---|---|---|---|
| `emitProgram` prologue (+ the `*Reset` helpers it calls) | 141 | once per compile, ahead of every pass | clean before anything reads it — the safe home |
| a `runEmitPass` row (`collectU`/`collectS`/`collectA`/`scanPrintUse`/…) | 142 | once per compile, but AFTER earlier rows | stale for anything an EARLIER pass reads |
| a frame builder (`emitFuncCode` / `startFnDetectScratch`) | 44 | once per FUNCTION | stale across programs unless BOTH builders write it |
| some inner helper | 38 | wherever that helper runs | case by case |
| nowhere | 80 | — | safe only if rewritten unconditionally each compile |

**The pass-table rows are not equivalent to the prologue and the difference is real.**
`collectA` clears `aUsed`, `lUsed`, `raUsed`, `rlUsed`, `mUsed`, `mI32Used`, `slUsed` and
`fa64Used`; it is pass row 3, so anything `collectTyParams`/`collectU`/`collectS` reads sees
the PREVIOUS program's value. D986's four flags could not be fixed there at all — `ba8Used`
is set by `scanPrintUse`, which runs long after `collectA` — which is why #2218 put them in
the prologue instead.

## THE TWO FRAME BUILDERS MUST AGREE — four flags where they do not

`emitFuncCode` decides a declared function's scratch frame; `startFnDetectScratch` is its
analogue for the START function (top-level statements plus the global initializers that run
there). Both read the same 24 `fnUses*` flags and both must write all 24, because a flag one
writes and the other does not survives — into the rest of this compile, and into the next
program on the same instance.

Twenty of twenty-four agree. Four do not:

| flag | `emitFuncCode` | `startFnDetectScratch` | witness |
|---|---|---|---|
| `fnUsesU8Push` | yes (lines 872 **and 873**) | **NO** | **D1006** — 4 phantom locals, +10 bytes |
| `fnUsesMapVals` | yes (lines 904 **and 905**) | **NO** | **D1007** — 6 phantom locals, +15 bytes |
| `fnUsesUnionSink` | yes (931) | **NO** | none found |
| `fnUsesUnionLetSink` | yes (932) | **NO** | none found |

**The duplicated line is the tell.** `fnUsesU8Push = false` and `fnUsesMapVals = false` each
appear TWICE IN A ROW inside `emitFuncCode`. The second copy was written for the other
builder and landed in the same one; the flag then has two writers where it needs one in each
place. Nothing reads a duplicated assignment as wrong, and no gate could see the result
because the CLI compiles once.

The last two are filed as a hazard, not a defect: `fnUnionRetSinkOk`/`fnUnionLetSinkOk` are
per-function predictions and no program has been found whose start function inherits one
visibly. That is the same framing #2218 used for D986's untouched siblings — **a flag with no
witness is a place to look, not a fix to ship**, and `vl_instance_state_leak_test.ts` carries
a `union-return-sink` program so one would be caught.

## The 80 that are cleared nowhere

Most are safe by UNCONDITIONAL REWRITE, and the script cannot tell that from a guarded one —
so read this as a list of questions, not a defect list. Two shapes worth separating:

**Safe by rewrite.** `aTypeIdx`, `lTypeIdx`, `raTypeIdx`, `rlTypeIdx`, `sTypeIdx`,
`sBackIdx`, `mkArrIdx`, `mkListIdx`, `mStructIdx`, `mStructI32Idx`, `fa64TypeIdx`,
`fl64TypeIdx`, `ia64TypeIdx`, `il64TypeIdx`, `fa32TypeIdx`, `fl32TypeIdx`, `ba8TypeIdx`,
`bl8TypeIdx`, `uBoxIdx`, `vbI32Idx`, `vbI64Idx`, `vbF32Idx`, `vbF64Idx` — every one is
assigned in both arms of an `if <flag>` in `collectA`/`collectU`, so it is fresh per compile
**as long as the flag is**. That conditional is precisely D986's mechanism: the index was
per-compile, the flag was not, and the pair disagreed.

**Frame bases**, likewise: `pushScratchBase`, `refPushScratchBase`, `f64PushScratchBase`,
`i64PushScratchBase`, `f32PushScratchBase`, `u8PushScratchBase`, `strPushScratchBase`,
`strScratchBase`, `mapScratchBase`, `mapI32Base`, `mapKeysBase`, `mapValsBase`,
`mfScratchBase`, `arrNewScratchBase`, `cloEqScratchBase`, `leqIScratchBase`,
`leqSScratchBase`, `unionSinkBase`, `unionAsSlot`, `variantReboxSlot`, `coalesceCallSlot`,
`coalesceCallStrSlot`, `coalesceCallBoolSlot`, `callRefSlot`, `atomStageSlot`,
`listIdxScratchBase`, `fnMvBase`, `mvValsOutBase`, `fbScratchCur` — all assigned
unconditionally in `fbBeginFunc`, and each guarded reservation is `if <fnUses*> {
fbReserve(n) }`. Same pairing, same conclusion: **the frame bases are only as per-compile as
the `fnUses*` flags are**, which is what makes the asymmetry table above the thing to keep
right.

The remainder: `capFrame`, `sblEpoch`, `cmSlot`, `eqStashL`/`eqStashR`, `gStrInfLet`,
`emitRootIx`, `cloStructIdx`, `cloSigBase`, `gMemLogIdx`, `monoProgStmts`, `msGen`,
`msAtomTexts`/`msAtomIds`, `narrowStripNullOnly`, `narrowBareIdentOnly`, `pendingNulClosure`,
`pendingNulList`, `pendingRawNullRead`, `gDivRemNonzero`, `repShadowOn`, `rtWalkN`,
`rtUserVer`, `repSlotRepEpoch`, `repElemMemoEpoch`/`repElemMemoLen`/`repElemMemoUserVer`,
`fnUsesUnionAs`. The `rep*`/`rt*` epoch counters are generation stamps and are MEANT to
outlive a program (`msPoolReset` bumps `msGen` rather than clearing it); `emitRootIx` is
assigned in the prologue with a value, not cleared. Run
`python3 scripts/emitter-state-audit.py --names` for the per-name clear sites.

## How to settle a row here

1. Write the two-program witness: `P` then `Q` on one instance, `Q` alone on a fresh one.
   `tests/vl_instance_state_leak_test.ts`'s `compile()` is 15 lines and does exactly that.
2. If they differ, the leak is real whether or not the module is still VALID. Both D1006 and
   D1007 emit valid wasm with dead locals — the bytes are wrong, not the behaviour, and that
   is still a leak by the invariant the harness pins.
3. Minimise by line removal, keeping a line removed only while the DIVERGENCE holds. D1006
   fell out of `arrays/u8-packed-list.vl` to three lines in under a minute.
4. Grade the fix on the harness, not on `vl run`: the CLI is structurally blind here.
