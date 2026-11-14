# Rep ADT stage 1: the arena, 2026-11-14 (lane E)

This is stage 1 of [the Rep ADT design](2026-11-14-rep-adt-design.md) §3. It builds on
[stage 0's shadow](2026-11-14-rep-adt-stage0-shadow.md), and on lane H's `compiler/intern.vl`
once that lands. This note is in progress; this section came first, at the coordinator's request.

## Stage 0's disagreements, triaged

The question for each disagreement: which side is right, and is the flat `VKind` ever the wrong
one, which would make it a latent clause-1 bug? The method:
- run the cell and check its output against the program;
- read the emitted module with `./node_modules/.bin/wasm-dis` (a `--names` build) to see what
  the module actually uses;
- for the record cells, run the plainest neighbouring spellings.

The shadow now names the type and the function of an `uncovered` answer, which this triage needed.

| disagreement | cells | output | what the module uses | right side | follow-up |
|---|---|---|---|---|---|
| local `variant`, tree `struct` | 6 in `b000017`, `b000057`, `b000058`, `b000418` ×2, `b000498` | correct (0, 7, 7, 0, 0) | the variant struct of `Circle`, the type the literal `cc` is delivered to | **flat**, for storage. The tree is right about the *recorded* type, the literal's own `{r: …}`, but that is not the storage type. | stage 1: the record's arm status and storage type come from the checker or elaboration (lane S's slot store gives a literal holder its delivery class), not from emit-time adaptation |
| result `i32`, tree `closure` | 4: `d15199_run_function_field`, `d15220_run_coerced_holder` (`__lambda_0`, which returns a closure); `d511_coal_fn_{match,nomatch}_ret_none_direct` (`g`, which returns `a ?? b`) | correct | `(result (ref $closure))` in all four | **tree**. `fRetKind`'s `i32` is its documented "no non-i32 fact" default (`emit_state.vl:485`), not the valtype. | stage 2 deletes the default column |
| result `i32`, tree `closure`, self-build | 15 hook setters (`heldRepMintOn`, `rlLateRowsOn`, …) | — | `(result (ref $54))`, a closure, e.g. `heldRepMintOn` | **tree**, for the same reason | the same |
| result uncovered | 6 in `d947_price_{nulbool,nulcircle,nulstr}`: `std:test`'s `vltAbort` and `fail`, typed `never` | correct | no result at all | **neither**. The flat `i32` is the default, and the tree has no answer (`prim:never`). | stage 1: `void` and `never` results get a no-value answer. The design's §2.1 treated both as a checker gap, which is wrong for a function result. |

**Is any of them a clause-1 bug?** No.
- In every case where the two sides differ on a result, the module uses neither the flat `i32` nor
  a wrong rep. The valtype is written from the recorded type's rep, and `fRetKind` is a default
  column beside it.
- For the record locals, the flat kind is the one the module stores at, and the programs print the
  right values.
- Two neighbouring spellings ran correctly. Each hands the returned literal to `Circle`, to `Dot`
  (a structurally equal record that is not a union arm), to a `Shape` union parameter and to a
  `Dot[]` element. The variant ref flows into every one with the right values, at `i32 | null` and
  at `i64` fields.

So no inventory row is filed. The two stage-1 fixes, both on the tree side, are:
- record arm status from the checker;
- a no-value result for `void` and `never`.

## Stage 1a: the tree as `RepNode` records

**What moves.**
- The rep tree's eight parallel columns (`rtKind`, `rtDisc`, `rtChild`, `rtReason`, `rtKidStart`,
  `rtKidCount`, `rtKids`, and the `rtIntern` string map) become one arena of `RepNode` records:
  `RPrim`, `RAtom`, `RList`, `RMap`, `RBox`, `RClosure`, `RRecord`, `RNullable` and `RUnsup`.
- Every reader matches the record type exhaustively, with no `_` arm. The scalar leaves' `RpPrim`
  set takes an inner `match`.
- The 17-member `RtKind` string set is gone.
- The hash-cons key is a `(tag, args)` id in a second `Interner`, in place of a rendered string.
  The arguments are the discriminators, the child node indices and (for records) field-name ids,
  so a key is as injective as the string was.
- `rtTy` stays as provenance, since five readers consult it, as they did before.

**`intern.vl`.**
- The table becomes an `Interner` record, with `internNew`, `internResetIn`, `internIdIn`,
  `internLenIn`, `internTagIn` and `internArgIn`.
- The module-level `internId` family keeps the module's own instance, so lane H's callers and
  their ids are unchanged.
- The rep tree holds the second instance, which lane H agreed (their note §6).

**Byte identity.**
- Fixpoint: the stage-0 seed compiles this tree, and the result compiles this tree to identical
  bytes. So the new tree emits exactly what the old one did on the compiler.
- Shadow, armed, on the self-build: the 53-line report (agreements, rebuild and node counts,
  unsup reasons, hash-cons tallies) is identical to the stage-0 seed's, line for line.
- Corpus: every 7th cell (1,707 programs) was built armed by both seeds. 0 differ in module bytes
  and 0 differ in shadow report.

**Cost.**

| | |
|---|---|
| net compiler lines | +77: `emit_rep.vl` −8, `intern.vl` +44, `lint.vl` +5 (the closed-set tables name `RpPrim` and `RepNode`), `emit_vk_shadow.vl` +36 (the uncovered note names its type's shape and function) |
| pin-helper delta | 0 (baseline 908) |
| guest fuel (`plumb-shape-cost.vl`, `SEED=` stage-0 seed vs this one) | main 9,231,902,279 → 9,244,316,932 (+0.13%), tail 6,688,467,286 → 6,696,925,955 (+0.13%): the interner's record fields and the key argument vectors, in place of one string concat per node |
| peak live heap | unchanged (120,044 / 79,995 KiB) |
| seed size | 6,823,464 → 6,828,658 bytes (+0.08%) on the merged tree |
| gate | `GATE_IN_WORKTREE=1 scripts/gate.sh`: all rows pass, on the tree merged with master |

The design's −250 for stage 1 assumed the projections (`repTreeAtomOf`, `repTreeNulOf`,
`repTreeListElemName`) would go. They remain, because their callers read `RepDesc`, which stage 2
retires. Stage 1a is the change of shape that stage 2's deletions need; on its own it does not
delete code.

## Still owed by stage 1, as stage 1b

These two change the tree's answers, so they are not in this byte-identical PR. Each will be
graded on the stage-0 shadow (the disagreement must go and no agreement may be lost), and each
byte mover will be named.
- **Union-arm status from the checker.** `RRecord.rrVariant` comes from `repTyIsVariant`, whose
  input includes the emitter's own union-variant rows (`uVarTyIx`, bit 2 of `rvsAdd`). Stage 1b
  reads the checker's union membership alone, which retires the `variantBit` rebuild axis. That
  axis is stage 2's gate (stage 0 note).
- **A no-value result.** `void` and `never` results get an answer instead of an `unsup` leaf,
  which fixes the 3 `d947` cells' disagreement.
