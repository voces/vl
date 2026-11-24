# IR: a nullable print of a valued `if` opens its blocks before the `if`, 2026-11-24

Lane IR-N6, the class `print nulStr of a valued if` (with its sibling `print nulBool of a valued
if`, the same guard; the queue ruled design A, byte-identical, over a Q57 natural lowering). Origin:
the d3281 join grid (`d3281_join_{hole,tp}_{ABn,Kn}_non_print`), and tests/cases joins of nullable
strings or `K | null` widened to a string printed directly.

## The mechanism

Legacy's `emitPrintNulString` writes `printNulStrOpen()` (two `block`s, `$out` and `$null`), then
the operand, then `printNulStrTail()` (`br_on_null` ...); `emitPrintNulBool` likewise. A valued
`if` in the operand is written inside the blocks. The IR built it as an `SIf` before the `RPrint`
node whose lowering opened the blocks, so `ifBelowLead` refused it.

Minimal witness, by ablation: `print(if c { a } else { b })`, `a: string | null`. `print(a)` and a
`const t = if ...` then `print(t)` are covered already.

Now, when the operand wrote such a statement (`ifBelowLeadHas`, the pure half of `ifBelowLead`),
`printStmt` splices a new effect `RPrintOpen { poArm }` (0 `nulStr`, 1 `nulBool`) at the operand's
start (`printOpenAt`), and the print carries `pnOpened` = that arm. The lowering of the open writes
legacy's two blocks and pushes two control frames; the opened print writes the operand and the tail
and pops them, so a branch inside an arm (a `??`'s blocks, a nested `if`, a `return`) counts the two
blocks as legacy does. The verifier's rule 10 pairs them per body (`printOpenPairsWhy`): an open is
closed by the one print of its arm, with no other print, `return` or branch between.

Five keyed self-tests: `print-open-pair` 0; `print-open-unclosed`, `print-opened-unopened`,
`print-open-arm-mismatch`, `print-open-left-by-return` 10.

## Legacy tails the IR calls

`printNulStrOpen` / `printNulBoolOpen` (now from `RPrintOpen`) and their tails, as before.

## Readings (fixpoint seeds on both sides, master f080c966)

READINGS

## Witnesses and the position sweep (Q58)

`tests/cases/strings/print-nullable-valued-if-opens-before-operand.vl`: a `??` in an arm, an early
`return` from an arm, a nested valued `if`, a condition with an effect (`f(n) > 0`, counted), and a
`boolean | null` print; it prints `dflt null e 1 7 n null null p null 2 true null` under both seeds
and claimless. The base covers 1 of its 6 functions, the candidate 6; with all 6 claimed the module
is byte-identical to legacy's (`cmp`), and `wasm-dis` of `early` shows both blocks opened before the
`if` whose arm returns.

`scripts/capability-probes/matrix/print-nullable-valued-if.matrix.vl`: the PROOF is the print over
the delivered value, so every built-in position places it in another context; cells vary the
statement's context (loop body, closure, `if` arm, module scope) and the arms (`??`, call, string
literal, `K | null` widened, a `boolean | null` print). 64 of 64 graded cells RUN before and after;
under `VL_IR_SHADOW=6` the candidate covers 162 = verified 162 = matched 162 and every start (64),
where the base left 26 functions and 36 starts at the class; `ir-identity.sh --claimless` over them
is identical 64, differ 0.

Shadow row `tests/ir-shadow-rows/print-nullable-valued-if-open.vl` (base refuses both functions at
the classes; candidate 2 of 2).

Legacy lines deleted: 0. Moved to `@ir`: 0.
