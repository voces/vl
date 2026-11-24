# IR: a claim that meets a shared legacy helper's refusal declines (2026-11-24, lane IR-P1)

D17123 plus coordinator ruling (a). A claim's build or lowering calls about 42 legacy helpers that
`emitFail` directly. Such a refusal latched the compile's first message and reset the module
writer, so it fired before legacy reached its own refusal in that unit (D17123). Where legacy
builds the unit instead (D4645's witness with N5's decline reverted), the claim refused a program
legacy builds.

- **Guest.** Each claim seam (`irClaimFn`, `irClaimStart`, `irClaimThunk`, `irClaimEqHelp`,
  `irClaimConstCell`) opens a soft scope with `softBegin` and closes it with `softEnd`, saving and
  restoring the enclosing one, because a const-cell seam runs inside a claimed body. Inside the
  scope, `emitFailAt` records the first message in `emitSoftMsg` and returns, with no latch and
  no `ropeReset(W)`. A build that saw one declines before it writes (`softRefused`). A lowering
  that saw one misses (`softMiss` → `irLMiss`), so the lwMiss rewind discards the partial bytes.
  Legacy then writes the unit and owns its refusal. A refusal outside every seam still latches.
- **Rows.** `claim fell back: … a legacy helper refused in `<fn>`: <msg>`, counted even when the
  shadow is unarmed, as the G3 rows are.
- **Hosts.** Native `compile_vl_located` and the TS hosts (`lsp/src/claimFallback.ts`, the LSP's
  `compile`, the V8 oracle) read those rows. Legacy refused: its refusal plus a note naming the
  function. Legacy built: its bytes plus one line, or rc 70 under `$VL_IR_STRICT=1`. The note text is
  identical in native and TS.
- **Test hook.** `$VL_TEST_CLAIM_REFUSAL=1|2` (`setTestClaimRefusal`) makes every claimed function or
  start refuse before or after its body. It is the control for "legacy builds" and for a late
  refusal.

At I8, when legacy's emitter leaves, a mid-claim refusal has no unit to fall back to. It becomes a
loud internal error (ir-design-2026-11.md, the I8 note).

## Rollback proof

| witness | claimed build vs claimless | validates |
| --- | --- | --- |
| D4645 (N5 tree, decline reverted, this patch, fixpoint seed) | `cmp` equal, 237 bytes, prints 3 | yes |
| D17123 | both refuse with legacy's `a union's arm rows…` | — |
| hook 1 and 2 on `claimed-and-valid.vl`, `hole-fn-choice-to-generic-hof-at-two-types.vl` | equal to the `VL_IR_SHADOW=1` build | yes |

Hook 2 refuses after the whole body is lowered, the latest point a lowering can refuse.

## Readings (base f080c966, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| self-compile fuel | 126065698656 → 126068339281 (+0.002%) |
| `ir-identity.sh --names` | identical 9433, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7842, fail-both 68, differ 0, expected divergence 2 |
| `ir-identity.sh --claimless` | identical 14462, differ 0 |
| `ir-parity.vl --pop refusals` | 94 programs: same 4, differs 0, build-fails(both) 90 |
| `ir-parity.vl` over the 6,106 matrix refusals | MATRIX |
| emitter-state audit | 7/7, 0 never-cleared |
