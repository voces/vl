# Architecture refactor plan

This plan brings the compiler and its tools in line with `docs/ARCHITECTURE.md`. That document
states the contracts; its §7 "Known deviations" table lists where the tree breaks them. The
fourteen LARGE items and the SMALL groups in `code-quality-2026-10.md` give each deviation its
measurement, its proposed shape and its first PR. This plan owns what neither of them says:
**the order, the dependencies, how a step is accepted, and where each item stands.** It does not
restate measurements; follow the links.

## When the program is done

- Every row of ARCHITECTURE.md §7 is gone, except rows that wait on an owner ruling and say so.
- Every item L1–L14 is closed, or retired with a reason recorded here.
- The ratchets that measure these deviations have reached their floors, and each is a gate:
  - render-parse (`render-parse-budget`);
  - `sentinel-index-unguarded`;
  - `kind-ladder-incomplete` and `kind-ladder-split`;
  - the emitter's never-cleared state (`emitter-state-audit.vl --check`, ratcheted by L7).
- The repo's tooling follows the standing order: everything that can be written in VL is
  written in VL (Track T).

## Status, 2026-10-14

| item | state | where |
| --- | --- | --- |
| L2 rep from type | stage 1 **done**; stage 2 **partial**; stage 3 **in progress**. Last: a list literal joins its elements like an `if` joins its arms, so an existing inner list never widens by copy, D4861. Next: the `-> none` class, the remaining DIFF, the `if` join at a pin (D2832), the narrowed family, the scope callers. | [L2 log](#l2-log) |
| L1 per-call binding, banked once | **in progress as lane SC**. Last: step 7 done; its refusal names the pin and the delivery. Next: step 8, the multi-pin decision (D3975), then the (c) literal; D4578 and D4579 wait on the interner. | [L1 log](#l1-log) |
| L3 legality in the checker | families (a)–(c) **done**. (d) waits on SC. | [L3 log](#l3-log) |
| L4 one rollback for the quiet probes | A1 and A2 **done**. Last: the follow-up (#3609) widened each leaking site's set; the census leaves only `cstrProbeBefore`'s constraint rows (D3062). | [L4 log](#l4-log) |
| L5 one pin driver | C2 **done**. Last: `compiler/check_pins.vl` (#3611), one `pinRun` over three phases. Next: D1 (callee-closed carves of `typecheck.vl`). | [L5 log](#l5-log) |
| L7 `pending*` into `ExpCtx` | **in progress as C3**; the per-function conversion is **done**. Last: `expCtxReset` clears the 17 pending seeds at compile start, never-cleared 172 of 1,156 (`scripts/emitter-state-audit.vl --check`). Next: the never-cleared ratchet keeps falling. | [L7 log](#l7-log) |
| L8 tyquery.vl, split classify | first PR (A3) **done** | `compiler/tyquery.vl` holds the four exact type-step twins once; the checker does not import it yet. |
| L6 registries by key | step 5 **in progress**. Last: second switch (#3661), `unionNameOfExpr/is` on the key, 12 sites. Next: `ctr/unionName` (site 42), blocked on the struct-union alias sibling (class As). | [L6 log](#l6-log) |
| L10 the `-O` optimizer | **in progress as T4**. Last: R6d, the compiler's inline-record step is the default and the host's fields step is deleted; 0 of 15,406 programs differ. Next: R7, list flattening. | [L10 log](#l10-log) |
| L11 repo lint rules once | T2 **done** for the ratchets | Every lint-held per-file ratchet runs under `vl check --budget`: ladder and export (#3667), render-parse (#3677). `ratchet.py` is deleted. |
| L14 type section from allocation order | **done** | #3656 (D4): `emitTypeSection` walks the allocation order `mAllocType` records. |
| L13 host import surface, errno once | first PR (A5) **done**. Last: `HOST_FLOOR` (`main.rs`) is the host floor in one table, held to the compiler by `tests/vl_host_floor_test.ts`. Next: the per-slot predicates from one signature table. | [L13 log](#l13-log) |
| L9 split `typecheck.vl` | D1 **in progress**. Last: the scope chain (`scopeDepthsOf`, `fnDeclScopes`, `constScopes`, `fnAliasScopes`) and its lookups, into `check_scopes.vl`. Next: what the last two carves freed and left (the overload and UFCS messages, the `we*`, `cr*` and `rec*` steps). | [L9 log](#l9-log) |
| L12 | not started (has A7) | |
| SMALL S-c front-end tidy | **partial**. `typecheck.vl` imports `./ast` once; the other rows are not byte-identical (see the SMALL log). | [SMALL log](#small-log) |
| SMALL S-a, S-b, S-d … S-n | **partial**. Last: S-j (#3696). Open: S-e row 2, S-g (waits on SC), S-i row 2, S-l, S-m, S-n. | [SMALL log](#small-log) |
| RepDesc rulings | **ruled** 2026-10-13. `one-literal-union-rep` applied (#3653); `nullable-rep-rule-stated-once` ruled (b). | [RepDesc log](#repdesc-log) |

Update this table in the PR that moves an item.

## Rules every step follows

1. **One PR is one step.** A refactor step proves it changed nothing:
   - a byte-identical seed (`cmp` after `refresh-compiler.sh`);
   - or, where code moves, IDENTITY (compile(candidate, master source) == master fixpoint,
     which `cb-audit` checks) plus identical `vl check` text and emitted modules over
     `tests/cases` and the distilled corpus.
2. **A step that changes behaviour** must show:
   - no `runs → not-runs` in `regress.py`, and no new silent cell;
   - for a capability, a `capability-matrix.vl` position matrix in both faces, with a template that leaves
     a type parameter open.
3. **Cost is a gate, not a note.** A slower compiler is rejected however clean the code. Each
   step is checked against:
   - L2 self-compile fuel (`self-compile-time.sh`);
   - `plumb-shape-cost.vl` fuel;
   - `vl_scaling_shape_test.ts`;
   - seed size.
4. **Shadow before switch.** Where a new producer replaces an old one (L1, L2 stage 3, L6), a
   shadow harness that is off by default runs first and prints every disagreement. A
   disagreement becomes an inventory row, not a merged behaviour change. The disagreement list
   is the step's deliverable.
5. **A step removes or narrows its §7 line in the same PR**, and updates the status table above.
6. **One writer per giant file at a time.** `typecheck.vl`, `emit_classify.vl`, `wasmEmit.vl`
   and `emit_mono.vl` each have one owning lane per wave (see Concurrency).
7. **Fresh builder per PR**, with a handoff note, and up to six concurrent agents (CLAUDE.md).
   Merges go through `cb-audit`.
8. **A PR that advances a lane changes only that lane's state cell** in the status table and **appends one bullet** to the end of its `### <lane> log` under "Lane logs" (never editing an earlier bullet). The merge tooling unions appends, so two PRs on different lanes never conflict.

## Dependency graph

```
L4 assert ──► L4 CheckMark ──┬──► L5 pinDriver ──┐
                             └────────────────────┴──► L9 typecheck carves
S-c (one ast import) ─────────────────────────────────► L9

L8 tyquery.vl ──► L2 stage 2 twins ──┐
                                     ├──► L2 stage 3 rep column ──► RepDesc resume
L1 (SC steps 0→4) ───────────────────┤        ▲
                                     │        └── rulings: literal-union rep, nullable rep
L6 registries by id ─────────────────┘   (removes L1's spelling hop)

L1 SC step 4 ──► L3 family 3 (mono fn-value rules into the checker)
L7 ExpCtx deliveries ──► per-instance compilation (vl test isolation ruling)

T1 host process ABI (done) ──► T3 instrument ports ──► Python retired
L11 budgets inside `vl lint` (needs no spawn) ─► T3 drops the ratchet scripts
owner: optimizer location ──► L10
```

## Waves

A wave is a set of steps whose prerequisites have all landed. Steps inside a wave run in any
order, subject to the one-writer rule.

### Wave A: enablers (no behaviour change)

| step | item | file owner | proof |
| --- | --- | --- | --- |
| A1 | L4 first PR: the table-length assertion after each of the seven quiet probes, behind a flag. This turns the UNDECIDED omissions into a measured list. | `typecheck.vl` | the fixpoint reproduces master's seed from master's source, and `vl check` text and emitted modules are identical over `tests/cases` and the corpus with the flag off |
| A2 | L4: one `CheckMark` / `checkRollback`; each constraint family becomes a record of columns with one `truncate` | `typecheck.vl` | `vl check` and module identity; fuel A/B |
| A3 | L8 first PR: `tyquery.vl` with the four exact type-step twins retired | `emit_classify.vl`, `emit_rep.vl` | byte-identical seed |
| A4 | L14 first step: a per-entry type-index assertion. **Done** (#3643): D4 may now iterate the recorded order. | `emit_collect.vl`, `emit_sections.vl` | seed, fixpoint, rep-fuzz |
| A5 | L13: the errno agreement test, then the import table | host `main.rs`, `std/fs.vl` | new test; host suites |
| A6 | SMALL groups, one PR each: S-c first (a precondition for L9), then S-a, S-b, S-h, S-d, S-e | per group | byte-identical seed |
| A7 | L12 first PR: one LSP feature moved into `lsp/src/features.ts`. **Done** (#3641): `foldingRangesAt` moved there; T5 (remaining features) is unblocked. | `lsp/` | lsp suites |

### Wave B: one producer per fact

| step | item | owner | prerequisite |
| --- | --- | --- | --- |
| B1 | L1, executed as SC's migration (`fn-value-flow-design.md` §(f), steps 0–4). SC's checker-side store (§(h)) **is** L1's banked binding; there is no second bank. Mono's instance key becomes the type-id tuple, and a per-instance node-type column retires `monoArgTyName`. | lane SC (`emit_mono.vl`, the SC parts of `typecheck.vl`) | #3542 (step 0) |
| B2 | L2 stage 2: the type-taking twins land in `tyquery.vl` | `emit_classify.vl` | A3 |
| B3 | L6: the next registry follows the registry-by-key recipe (#2426, #2438, #2473); then equality collapses to three named notions | `emit_rep.vl`, `emit_collect.vl` | none |

### Wave C: each decision at the phase that owns it

| step | item | owner | prerequisite |
| --- | --- | --- | --- |
| C1 | L3, in order: (a) object-literal shape against a union variant; (b) probe `checkParams`' valtype ladder with a check-clean witness; (c) reword the built-in arity floors as internal invariants; (d) the mono function-value rules | checker; `emit_sections.vl` | (d) needs B1 step 4 |
| C2 | L5: one `pinDriver` in `check_pins.vl`; D3817 becomes a policy over `solveUnannotParams` | `typecheck.vl` | A2. Fold #3516's width-subtype rewrite in as a solver if it is still open. |
| C3 | L7: one delivery function per PR, `emitReturnValue` first; then the memo module; then ratchet the never-cleared count | `wasmEmit.vl` | none |

### Wave D: structure

| step | item | owner | prerequisite |
| --- | --- | --- | --- |
| D1 | L9: callee-closed carves of `typecheck.vl`. `check_pins.vl` (from C2) is the first; leaves follow. | `typecheck.vl` | A2, A6 (S-c), C2 |
| D2 | L8: split `emit_classify.vl` by banner region; split the 400-line functions at low-liveness seams | `emit_classify.vl` | a priced self-compile A/B before the first split |
| D3 | L2 stage 3: a per-node checked-rep column read by the `expr*` classifiers; then the RepDesc campaign resumes family by family under its LEFT-ONLY / RIGHT-ONLY oracle | `emit_classify.vl`, `emit_rep.vl` | B1 (per-instance types), B2, and the two rulings for the literal-union and nullable families. Other families can go first. |
| D4 | L14: the type section iterates the recorded allocation order | `emit_sections.vl` | A4 |

### Track T: tools and hosts, VL first

| step | item | prerequisite |
| --- | --- | --- |
| T1 | **Done.** The host process ABI: `std:process` (`runProgram`, `exit`) and `std:env` (`getEnv`) shipped with their host imports; see ROADMAP's "Host ABI for VL scripts". | — |
| T2 | L11 the VL way: per-file budgets run under `vl check --budget`. **Done.** See [T2 log](#t2-log). | none |
| T3 | Dogfood the Python scripts in VL. **In progress.** Last: the last `scripts/*.py` tools ported and deleted. Remaining Python in gate rows includes the ratchets. See [T3 log](#t3-log). | T1 |
| T4 | L10: the `-O` optimizer. **In progress:** R1–R5 landed, R6a and R6b run beside the Rust. Next: R6c, then R7. See [T4 log](#t4-log). | owner decision 3 below |
| T5 | L12: the remaining LSP features. **Done:** every seed-backed feature lives in `lsp/src/features.ts`; `server.ts` is transport. See [T5 log](#t5-log). | A7 |

## Concurrency

Up to six agents run at once (CLAUDE.md); the owner lifted the CPU cap on 2026-10-12. Rule 6
still holds: one writer per giant file.

- **Lane 1: SC.** B1, then C1(d). It owns `emit_mono.vl` and its parts of `typecheck.vl`
  throughout.
- **The other lanes** each take one step at a time from the earliest wave with an open step,
  choosing a step whose file has no current writer. The intended order per file is:
  - A1 → A2 → C2 → D1 (one continuous claim on `typecheck.vl`, interleaved with SC by area);
  - A3 → B2 → D2 → D3 (`emit_classify.vl`);
  - C3 (`wasmEmit.vl`);
  - A4, A5, A6, A7, B3 and T2, which go to whichever file is free.
- T3 ports need no new std surface, since T1 shipped. A port that does need some goes through std-api review first.

## Owner decisions this plan needs

Each is posted for question time; work that does not depend on it continues.

1. **`one-literal-union-rep`**: RULED 2026-10-13 and applied (#3653): every string literal union reps as the atom.
2. **`nullable-rep-rule-stated-once`**: RULED 2026-10-13, (b): `repOfNullable` becomes a `_`-less `match`.
3. **Where the `-O` optimizer lives (L10).** RULED 2026-10-13, (A): in VL (`optimizer-in-vl.md`), as a pass over the emitted
   module in the compiler. That is what the standing order asks. It also gives the Deno and
   playground hosts `-O`, which they cannot run today, and it removes about 6.5k lines of Rust
   that the host's own manifest says it does not have. If decided this way, skip L10's Rust-only
   first PR (`wasm_bytes`).
4. **September row 19**: a development build resolves the seed from the working directory but
   std from the executable's tree (`SeedOrigin::Cwd`). Recommendation: resolve both from the
   executable's tree.
5. **SC ruling (g)**: the multi-pin case (a binding called at two or more signatures), after the
   table lands. This decides B1's instance record for closures, not whether B1 happens.

## Ready to brief

These have no unmet prerequisite and touch disjoint files:

- **A1**: L4 assertion harness (`typecheck.vl`). Done (#3600).
- **A2**: L4 `CheckMark` / `checkRollback` (`typecheck.vl`), on A1. Done (#3605), with the leak fixes in #3609.
- **A5**: errno agreement test (host + `std/fs.vl`).
- **A6 / S-c**: one `./ast` import block in `typecheck.vl`. This conflicts with A1, so run it
  first; it is small.
- **C3 first PR**: `emitReturnValue` through `ExpCtx` (`wasmEmit.vl`).
- **B1**: continues in lane SC; steps 1 and 2 are done (#3607, #3622), step 3 next.
- **T3, first port — done**: `check-filed-witnesses.vl` prints the Python's report byte for byte on both inventories and now runs the `filed witnesses` gate row; the Python is deleted and its test pins the report. It found D4290 (a compiler trap) and one new `dogfood:` row (`runProgram` waits). Next: `regress.py` + `gradecensus.py`.

## Lane logs

One bullet per step or PR, oldest first. Append at the end of a lane's log; do not edit earlier bullets.

### L1 log

- State on 2026-10-14: **in progress as lane SC**
- Design #3531 is merged, and the binding column landed in shadow (#3556).
- Step 0 (identity column) landed as #3542.
- Step 1 (#3607), the function-value flow table, runs in shadow (`fn_flow_shadow.vl`, off by default): graded against mono, it flags 60 of 69 silent review witnesses (the 9 others are D3923/D3972/D3973, outside its domain) and filed D4300–D4304.
- Step 2 (#3622; identity replaces name in write detection and the callback parameter test) closed D2114, D2479, D3910, D3911, D3924, D4011 and D4016.
- Step 3 is in progress: #3627 instances writes to a function-valued `let` or capture cell at each instance's type (closed D3941, D3953, D3954, D3957, D3958, D4013; filed D4305–D4308), and #3629 found a cell by identity but deleted nothing, since each retirement loses runs while the table is shadow-only.
- #3633 made the flow table decide for its first family: `fnFlowLamPin` pins a hole lambda that has a peer, and the peer pins (`monoPinLamFromPeer` and its helpers) are deleted.
- The let slot then decided `monoAliasChainWritten` and `monoGenFnAliasChainFe` (#3640, deleted), and answered lambda alias chains, capture-cell chains, the respell and per-declaration writtenness by declaration with a frame-copy lookup (#3649; `monoAliasChainLamFe`, `monoRespellLamAlias` and `monoCoerceWrittenLet` retired).
- The write index is now keyed by declaration, and the coerce and captured-lambda sites read the declaration (#3654).
- The capture-cell path and the peer condition retired (#3660), then `monoLetFrameOf` (#3666), and `monoCoerceLetValues` split by job with its `n:`/`c:` key gone (#3674).
- A directed per-let pin set decides a written `let`'s signature when it has one pin (#3686), and the order-free join of its directed pins replaces `monoCellSigRecord`, which retired (#3691).
- Step 4, first part (#3698): a list element or record field holding one unwritten generic is instanced per call, read from the flow table; u02/u03 and D4242 run with 0 runs lost and 0 new silent cells.
- The second part (#3716) rewrites a non-call read of such a slot to the generic's name, closing D4124–D4126.
- The third part follows a written `let`, a call returning the literal, and `?.`, closing D4515 and filing D4575–D4579.
- The fourth part reads through un-annotated parameters and delivers a call's returned literal at an annotated binding, closing D4575–D4577; D4578 (nested literal reps) and D4579 (maps) wait on the interner.
- The container retirements of step 4 are still open: each listed item loses runs when ablated alone, because the pins also decide writes and pushes.
- The other name lists stay name-keyed until a witness reaches them.
- The fifth part retires `monoPinGenericRecord` (with `monoRecordFieldUses` and `monoMemberOfBinding`): a record field and its writes are pinned at the table's per-field signature, closing D4700.
- The sixth part retires `monoPinGenericList` (with `monoFeIsSrc`, `monoCallsPerRead`, `monoPinSigWithRet`, `monoListElemWrites`, `monoListElemCalls`): a list element and its writes, `d[0] = v` included, are pinned at the table's `e` signature, and a spread copy re-plans the list it expanded into; closes D4301.
- The seventh part retires `monoStoreAnnName` (with `monoLocalAnnName`, `monoInstTyName`, `monoFieldAnnName`): a store `p[k] = v` / `p.f = v`, a `push` and a map `set` deliver at the one signature the table pins the place's slot at in that frame, read by declaration and path; 0 of 1,679 generic and lambda fixtures and 0 corpus classes moved.
- The eighth part moves the list and record literal arms of `monoCoerceFnValueName` off the expected type's spelling (retiring `monoStructFieldTypes`, `monoGenAliasFieldTypes`, `monoArrElemHoldsFn`): each element or field value delivers at the table's pin of the literal's own `e` / `f.<name>` slot, with the annotated return; 0 of 3,844 `@run` fixtures differ, forcing the pin empty loses exactly the 10 the two arms' ablations lose, and difftree is byte-identical. The concrete half of `monoNotePushDeliveries` stays: reading only the slot pin loses the 5 hole-lambda push fixtures its ablation loses.
- The ninth part retires the concrete half of `monoNotePushDeliveries`: a push or `set` delivers at the table's slot pin only. The 5 fixtures lacked a pin because `ffMethod` stored with a two-way `ffUnion`, so an element slot saw the pins of the lambda's other deliveries. A one-way `ffInto` gives each slot its one pin. 0 of 3,844 `@run` fixtures differ, and reverting the edge alone loses exactly the 5. `difftree --identity`: 2 of 10,204 modules differ, both with the same output (a removed second coerce, and a direct instance read).
- The tenth part moves the element store `p[k] = v` in `monoWalk` off its concrete element-type read (`monoMapValTy` retires). A store delivers at the table's slot pin only (`monoDeliverAtPin`). A capture cell's store coerces at the cell's `e` pin, except a value read through another cell. The pin of a user store `fs[0] = v` had always been "": `monoPlaceRoot` refused any `name[0]` as a cell read, and the element-type read hid this. `monoIsCellRead` now requires the binding the capture rewrite declared. Forcing the pin empty loses exactly the 12 fixtures that removing both old arms loses, and 0 of 3,844 `@run` fixtures move.
- The eleventh part moves the last two concrete reads in `monoWalk` outside the cell path onto the slot pin: an un-annotated local's write (`monoPlacePinName`) and a call through a written `let` of generics (`monoSlotPinName`, still instancing at the call when there is no single pin). The old callee read never fired (0 of 12 reaching fixtures). Forcing each pin empty loses what removing its read loses (1 fixture and 0), 0 of 3,847 `@run` fixtures move, and 9 of 10,208 modules differ with the same output. The local write closes D3944 (a generic written into a function-or-string union slot trapped) and D4307 (an `if` of a generic and a lambda was refused).
- Step 5's first part moves `monoCellCall`'s callee read onto the slot pin (`monoCellPinName`). `monoCellConcreteTake` no longer reads a zero-parameter function type as a refusal. Forcing the pin empty loses 2 fixtures and the pin keeps both; 0 of 3,849 `@run` fixtures move and 0 of 10,210 modules differ. The two cell-store cases (a value read through another cell, a hole lambda's per-signature instance) each refuse `binding-copied-through-uncalled-chain` when moved onto the pin, because `monoBindingSigConflict` holds a binding at one signature; they wait on step 6. D4842 filed (runs once the store delivers at the pin).
- Step 6's first part retires `monoBindingSigConflict`. `monoBindingsAtPin` delivers each written hole-lambda `let` at the table's one pin for its slot (a capture cell's `e`), dropping pins taken in functions the frame never calls (`pinFn`), and a cell store of a hole lambda delivers at the cell's pin. The old call removed alone loses 6 `@run` fixtures, the new pass disabled loses 4, the candidate none: 0 of 3,849 move, 2 of 10,210 modules differ (one refusal names the other binding; one extra unreferenced instance). D4842 closed. A value read through another cell still skips the pin (it refuses `binding-copied-through-uncalled-chain`); D4843 filed.
- Step 6's second part delivers a cell store of a value read through another cell at the cell's pin, which deletes the `sn = ""` skip. A delivery at a pin renames the write to its lambda instance, so the cell's re-take now reads that instance's signature (`monoLamInstanceNamed`) instead of refusing an open type. Ablated against the other option: dropping `monoCoerceFnValueName`'s `Index` arm loses `captured-cell-written-from-another-cell`, only noting the delivery leaves D4843 refused, and deleting `monoCoerceWrittenCell`'s write loop loses 15 `@run` fixtures. 0 of 3,854 `@run` fixtures move besides the new one; 1 of 10,215 modules differs from step 6's first part (the new fixture). D4843 closed.
- Step 7's first part makes a generic delivered at the enclosing generic's own type parameters defer its constraints to that generic (`genFnValueCstrsAt`, gated by `tyVarsOfEnclosingGeneric`, re-asking only the delivered function's own constraints). A list or record literal argument is re-delivered at the call's final substitution. Each ingredient is ablated alone: without the strict owner a fixture stops running; without the enclosing-generic gate four error fixtures gain a cascade; without the unowned-name fallback or the re-delivery, positions stay invalid wasm. 0 of 3,750 `@run` fixtures move, and 1 of 1,123 others (the new fixture). 1 of 10,218 modules differs (that fixture). D3923 closed; its five `rv3487` positions are check errors. The refusal names the pin only. D3975 is step 8's.
- Step 7's second part names the delivery in the refusal at the pin. Every deferred-constraint row records the delivery it was deferred through (`cvMark`). Each validator restores that delivery while it re-asks the row (`cvPick`), so the delivery survives a second deferral. `tErrPush` ends the refusal with `` (the demand is `show`'s, used as a function value at line 14)``. The diagnostic has one span, so the second position goes in the text, as `crLostNote` does. Without the per-row record, 0 of 9 fixture refusals name the delivery. `vl check` output differs on 2 of 15,415 files (the D3923 fixture and the new `error-generic-fn-value-deferred-demand-kinds`), all five `rv3487` positions gain the clause, and the ten fn-value matrices lose 0 runs. No open row has step 7's shape.

### L2 log

- State on 2026-10-14: stage 1 **done**; stage 2 **partial**; stage 3 **in progress**
- The ratchet is `render-parse-budget` (#3536).
- #3562 moved the last `valueAtomKind` renders.
- B2's first family (a render compared to a primitive's name) moved to `tyEmitPrimOf` in `tyquery.vl`: 118 → 112 renders.
- The second (#3608) read `valueAtomKindOfTy` and `nulScalarListKindOfTy` off the type (`tyEmitElemPrimOf`, `tyEmitElemNulPrimOf`, `tyEmitNamesOf`): 112 → 111.
- `joinRowOfTy` (#3620) now decides every joined record off its type: 111 → 110.
- `mapTyValKindLowerable`, `fieldBoxSetConflict`, the discriminant's arm lookup and `armFieldDeferredRowOk` (#3631) followed: 110 → 106.
- `valueAtomKindOfTy` still renders a union of members that share a list or closure rep (D4320).
- Next: `armFieldUnionName`, `listUnionEmitName`, `memReadBoxNames` (each waits on union-registry-by-key step 5).
- Stage 3 (D3): a per-node checked-rep column, read by the literal-union classifiers (#3672) and the nullable-niche classifiers (#3680).
- `repOfNullable` covers union-arm and nullable-litunion-element niches, so the nullable niche family is fully on the column (#3683, D3c).
- The column gains a pin-aware read, and the generic share of the list oracle falls (#3690, cause 1: LEFT-ONLY −60%).
- A nullable list element is covered by its backing family (#3693, cause 2).
- `exprString`'s call rungs and the list classifiers were measured against the column and none converted (#3684).
- A composite over holes covers the open element in hole instances, and an ablation shows the RIGHT-ONLY is an out-of-scope read (#3701).
- The list oracle now reports by family (open, scope, narrowed, like for like), and a call with no resolved list reads the column: like-for-like RIGHT-ONLY 28,321 → 9,889, no existing module differs, and D3163 and D3184 close (campaign §13.13).
- `exprRefArray` and `arrLitRetSeedFromKind` do not convert yet.
- Next: `Ident` LEFT-ONLY (7,777), the `Index`/`BinExpr`/`Member` RIGHT-ONLY, the narrowed family (the slot vs narrowed rep split), then the scope callers.
- A recursive-alias list element (`Json[]`) reads the column: like-for-like LEFT-ONLY 6,857 → 3,809, two modules lose unread locals (campaign §13.17; §13.14–§13.16 had already taken `Ident` LEFT-ONLY 7,777 → 3,928).
- A nullable literal-union list element (`(N | null)[]`, `("x" | null)[]`) reads the column: `Ident` LEFT-ONLY 1,186 → 881, `Call` 1,252 → 1,161, no output changes (campaign §13.18).
- A narrowed place read records a type at each receiver node: `Ident` LEFT-ONLY 881 → 341 in `tests/cases`, 861 → 227 in `named/`, no output changes; the 154 left at no type are mono clones (campaign §13.19).
- A capture cell seeded from another cell's read carries that read's type: `Ident` LEFT-ONLY 341 → 187 in `tests/cases`, no output changes; the 154 nodes were minted by `captureBoxRewrite`, not mono (campaign §13.20).
- A nullable value-union list element only a generic instance forms (`(i32 | string | null)[]`) reads the column through the inner box's row: `named/` like-for-like LEFT-ONLY 2,520 → 2,295, `tests/cases` unchanged, 0 modules differ (campaign §13.21).
- A call a generic instance re-makes records its template's type: the 1,744 untyped `d3125_*` `Call` notes go to 0, `named/` like-for-like LEFT-ONLY 2,295 → 551, `tests/cases` 2,444 → 1,376, 3 modules differ (a re-made closure whose tail is an assignment now returns its value, as the non-generic twin does) (campaign §13.22).
- A capture cell's read `c[0]` records the type the name read had (function-typed reads excepted): the 751 untyped `captureBoxRewrite` `Index` notes go to 0, `tests/cases` like-for-like LEFT-ONLY 1,376 → 625, 0 modules differ; D2413 and D3356 close (campaign §13.23).
- A re-made `if` link (mono), a rest pack (checker) and a re-made call (mono) record their type: untyped `IfStmt` 92 → 0, `ArrayLit` 98 → 0, `Call` 41 → 0; `tests/cases` like-for-like LEFT-ONLY 1,376 → 1,235, `named/` 551 → 461; 1 module differs (a generic `(i32 | boolean)` rest pack is now boxed); D4830 filed and closed, D3209, D3297, D3548 and D4306 close (campaign §13.24).
- The last untyped LEFT-ONLY nodes record their type (a re-associated `??` link at emit, a list literal three mono passes re-make) and a join of records reads the column as a struct ref list: untyped `BinExpr` 1 → 0, `ArrayLit` 24 → 0; `tests/cases` like-for-like LEFT-ONLY 544 → 535, `named/` 473 → 161; 0 modules differ; no LEFT-ONLY node is untyped now (campaign §13.25).
- A box element whose row the registry key reaches but its canon id misses reads the column (`unRowOfKey` moves into `emit_rep.vl`), and a single-literal list `"x"[]` is a `strlist`: `tests/cases` like-for-like LEFT-ONLY 535 → 425, `named/` 161 → 161 (its `d3140_*` 128 and `tests/cases`' i64 23 are registry-key classes L′ and D, left on purpose); 0 modules differ; the hole list's 317 notes all take the ladder's i32 default, and the proposal is that the checker records that default (campaign §13.26).
- A closed hole list (`_[]`, `_[] | null`) reads the `i32` element the checker records after the last pin (`recordClosedHoles`, a column beside `nodeTyIx`, so hover and `--json` keep `_[]` and the D16 readers still see the hole): `tests/cases` like-for-like LEFT-ONLY 365 → 69, `named/` 149 → 128; 0 modules differ (campaign §13.27).
- A parenthesised read and a `?.` read of a list fall back to the column, as the `Ident`/`Member`/`Call` rungs do; the `if` join stays none because its recorded `T[]` is a union box at a pin (D2832): `tests/cases` like-for-like RIGHT-ONLY 1,476 → 28, `named/` 10 → 0, LEFT-ONLY unchanged; 0 modules differ (campaign §13.28).
- A list whose element type is a value union the column boxes reads the ref list (`valueUnionBoxList`), and a captured walk variable over such a literal built at its destination's row binds the box: `tests/cases` like-for-like DIFF 180 → 12, `-> none` / LEFT-ONLY / RIGHT-ONLY unchanged; 0 modules differ over master's tree; D4854 (check-clean invalid wasm) filed and closed (campaign §13.29).
- A list `+` over two reps, one assignable to the other, copies the narrower operand into the wider rep (boxed into a union row, or widened element-wise between scalar lists): D4858 closes, and three 48-cell position matrices (`list-concat-*`) go from refused to runs in both faces with 0 silent; D4859–D4861 filed open (found during campaign §13.29).
- A list literal's elements and a spread or list `+` operand one level down go through the `if` join's container rule (`listJoinWidenCheck`, `ljwCopiedLevelCheck`): D4861 closes as a check reject (was check-clean invalid wasm; `b + a` was a loud emit reject), the `nested-list-widen-runtime` matrix goes from 19 silent to 0 and `nested-list-widen-fresh` keeps its 20 runs; difftree identity 15181 files, 0 differ; D4870, D4871 filed open.

### L3 log

- State on 2026-10-14: families (a)–(c) **done**
- #3557 closed D4070 and D4071.
- C1(b): the checker refuses an unbindable type parameter in a body function's parameter and a `void` parameter; `checkParams`' other arms are internal invariants; `null` lowers since D4550 closed.
- C1(c): every built-in arity floor is an internal invariant; `print` arity moved to the checker.
- Filed D4551–D4553.
- (d) waits on SC.

### L4 log

- State on 2026-10-14: A1 and A2 **done**
- A1 (#3600) is the assertion and its measured list.
- A2 (#3605) adds `CheckMark` / `checkRollback` and records of columns, with each site's set unchanged and the census identical.
- The follow-up (#3609) widened each leaking site's set, one commit per site: over 15,288 programs no rc, diagnostic or emitted module moves, and the census leaves only `cstrProbeBefore`'s constraint rows, kept by design (D3062).
- `nestCstrSeen` now trusts a key only while its row stands; `tpIfOkAt` (a syntactic fact), `dJoinRelayed` (a per-type mark) and `tpIfJoinAt` (the last apart join seen at a node, as before A2) are kept across a rollback.

### L5 log

- State on 2026-10-14: C2 **done**
- `compiler/check_pins.vl` (#3611) runs three phases — uncalled-export parameters (D3817), record width (#3516, folded in as a phase with its 8-round budget), literal bindings with record adoption — through one `pinRun` with a per-phase `pinBudget`.
- D3817 reads what `solveUnannotParams` observed in its walk instead of its own scoped AST walk.
- `vl check` text, emitted modules and the rollback census identical; the driver's re-check for generated walkers is unchanged.
- Next: D1 (callee-closed carves of `typecheck.vl`).

### L7 log

- State on 2026-10-14: **in progress as C3**
- `emitReturnValue`, `emitLetDeclStmt`, `emitAssign`, `emitDirectCall` (#3632) and `emitStructFieldValue` (#3634) each build their `ExpCtx` and restore the caller's on every exit: 25, 34, 35, 38 and 29 `pending*` writes to 0 (`wasmEmit.vl` 463 to 289 lines, `seedFieldListBuild` now seeds a ctx).
- Sixth PR (#3636): `emitVariantFieldValue` delivers through `ExpCtx` (wrapper + `…Under`), and the struct and variant twins share `expCtxFieldRefList`.
- Seventh PR (#3637): `emitArr` (wrapper + `emitArrUnder`).
- `emitCallRef` converted (#3644; `pending*` write lines in `wasmEmit.vl` 239 → 215).
- `emitUnionCoerce` done (#3647; 12 → 0 writes, `emitUnionCoerceUnder` + wrapper).
- `emitStartFnCode` (the start function's global-init seeding) joined the converted set (#3650; 30 → 0), then `emitConstCellInit` and `emitLowMemAccessorCall` (#3652).
- `emitArrayNewIntr`, `emitCapturedCall`, `njStash`, `emitSpreadGroupBoxed` and `emitNumIntrArg` followed (#3657), then `emitIndexGo`, `emitExprWideCleared`, `emitPush` and nine 4-write emitters (#3670), `emitRefIfArm`, `emitIfArmOpen` and the 2-write emitters (#3673), and `emitObj`, `emitObjLitNode`, `emitNullBySeed` and `emitMapNew` (#3681).
- `wasmEmit.vl` has 0 `pending*` writes outside `expCtxApply`, so C3's per-function conversion is **done**.
- The never-cleared count is a ratchet: `scripts/emitter-state-audit.vl --check` (the Python audit ported byte-identical and deleted), **225 of 1,165** at `8cb49ac84` in `scripts/emitter-state-baseline.json`, gate row `emitter state budget`.
- Memo module, first PR: `compiler/memo.vl` owns the pass generation (`emitPassGen`, bumped by `memoPassAdvance`) and the registry write counters, and a `MemoKey` compares and records each input in one call (`memoMoved`, `memoPassMoved`), so a key cannot test one input set and stamp another; `globalCellKind`, `refArrShapeIndex`, `closureCaptureNames`, `elemRowsCaptureWalk` and the type-registry generation moved onto it (21 stamp variables to 4 keys; the audit counts a `memoKeyNew` const; never-cleared **208 of 1,152**).
- Second PR: `memoKeyNew` registers every key and `memoCompileReset`, the first call in `emitProgram`, clears them all and restarts the three counters; `variantSig`, `variantTagKey`, `repElemMemo`, `repSlotCache` (`memoMoved3`, one call for three inputs) and `structIndexOfTypeName` moved onto keys, and `rtSync`, `repKeyMemoSync` and `repSlotRepSync` keep plain stamps, now cleared by `repReset`, because a key's array read on those per-ask paths cost +0.45% self-compile fuel; `sktGen` stays a per-entry stamp (a map in its place cost plumb-shape fuel).
- Byte-identical over the difftree population; never-cleared **195 of 1,149**.
- Third PR: a stamp generation is a registered `MemoGen` (`memoGenNew`, `memoGenAdvance`) that the compile reset advances and never restarts; `lrGen`, `rsQueryGen`, `msGen` and `fnPosEpoch` became generations, `scnEpoch` and `fdnEpoch` became keys (`scnGenKey`, `fdnGenKey`, plus `fnPosLenKey` restarting the position index's cursors when its epoch moves), and `capMemoGen` and `sblEpoch` were deleted: their tables are emptied at every bump, so a 1/-1 flag says the same.
- Byte-identical over the difftree population, L2 fuel +0.04%; never-cleared **188 of 1,148**, and no hand stamp generation is left in this list.
- Fourth PR: `expCtxReset` (beside `expCtxApply`) writes the 17 `pending*` seeds back to their declared defaults and is the second call in `emitProgram`, after `memoCompileReset`; it is in the audit's prologue list. Module identity over the difftree population (15,156 files, 10,196 built, 0 differ, fixpoint identical); the seed is 105 bytes larger (the new function); never-cleared **172 of 1,156**.

### L6 log

- State on 2026-10-14: step 5 **in progress**
- Prerequisite (1) is met (`merge-diffvar` 0, D1492 closed by #3635).
- Prerequisite (2) is met at the write seams (#3639): `differ` 230 → 0, the licence (`merge-diffset` / `merge-diffvar` 0) gated by `tests/vl_union_key_licence_test.ts`, and the 68 off-site `differ` documented as three key decisions.
- Prerequisite (3), the `name-only` rule, is classified (#3651): 2,248 → 1,800 with rule L (distilled 205 → 177); the residual is eleven classes, each with a stay reason or an unmeasured rule.
- Step 5, first switch (#3655): 11 seams answer from the key, and the key reads a declared union of litunion aliases.
- Second switch (#3661): `unionNameOfExpr/is` is on the key, 12 sites in total; `ctr/unionName` (site 42) is blocked on the struct-union alias sibling (class As) owning its own variant slice.

### L10 log

- State on 2026-10-14: **in progress as T4**
- Rungs R1 (the run-once scan, #3663 beside the Rust, #3668 retired), R2 (the `wasm-opt` argv and the `vl-src` strip, `optRungArgv` / `optStripSrc`, #3679) and R3 (the escape-inline choice and renames, #3695 beside, #3700 retired) run in the compiler, and their Rust is deleted.
- R4, the module writer (`compiler/wasm_write.vl`, #3703), decodes and re-encodes every module R1 reads byte for byte.
- R5, the multi-value step (`compiler/opt_multivalue.vl`), is the default and its Rust is deleted; 0 of 15,372 programs differ from the host built before the deletion.
- R6a, the inline-record step's census (`compiler/opt_inline.vl`, `$VL_OPT_INLINE=vl`), runs beside the Rust and decides the 8,718 of 10,293 built programs that hold no leaf record; 0 of 15,372 differ.
- R6b, the step's walk, dataflow and decision (`compiler/opt_inline_scan.vl`, `optInlineDecide`), runs beside the Rust: the host rewrites by the compiler's decision under `vl` and `both`; 0 of 15,389 programs differ, and 1,631 of the 1,645 that reach the decision are decided by the compiler (the other 14 do not validate).
- Next: R6c (the rewrite, the default flip and the Rust deletion), then R7, list flattening.
- R6c, the rewrite (`optInlineRewrite`, with `optInlineMoves` / `optInlineExplain` / `optInlineSummary`), runs beside the Rust and retires `optInlineDecide`; 0 of 15,399 programs differ, and the fault control differs on 155 of the 190 rewritten (the other 35 rewrite types only). Next: R6d, the default flip and the Rust deletion.
- R6d, the compiler's inline-record step is the default, and the host's fields step, its decision and `$VL_OPT_INLINE` are deleted; 0 of 15,406 programs differ from the host built before the deletion. Next: R7, list flattening.

### L13 log

- State on 2026-10-14: first PR (A5) **done**
- `mod wasi` in `scripts/vl-host/src/main.rs` is the host's one statement of errno numbers; `wasi_errno`, `wasi_errno_at`, `os_path`, `os_string` and every handler name its consts.
- `tests/vl_errno_agreement_test.ts` (#3732) holds it, `std/fs.vl` and WASI preview1's numbering in agreement, lists each one-sided code with its reason, and refuses an errno literal in `main.rs` or an errno const elsewhere in `std/`.
- It found no wrong number; `EPERM` is named by std and never answered by the host (a POSIX EPERM reads as `PermissionDenied` and becomes `EACCES`).
- Next: the import table (the `scripts/wasmtime-host.rs` spike is deleted).
- The host floor (17 imports under `std:fs`, `std:args`, `std:process`, `std:env`) was stated in six places with no check between them: the compiler's slot list (`fsIntrinsicNameAt`), the checker's `declare` rows, the builtin list's `blPush` rows, `register_fs_imports`' 17 hand-written blocks, the Deno stubs, and the std callers. `HOST_FLOOR` in `main.rs` is now one row per import (name, signature, handler); `tests/vl_host_floor_test.ts` holds its names to the slot list, the checker, the builtin list and the stubs, and its signatures to the checker and the builtin list; the registrar refuses an import whose declared arity differs from its row. The seed is byte-identical and output identity holds. Next: derive the compiler's per-slot predicates (`fsArgIsU8List` … `fsSlotTouchesMemory`) from one signature table.

### L9 log

- State on 2026-10-14: D1 **in progress**
- `check_pins.vl` (C2) is the first carve.
- The first leaf carve is `compiler/check_unconsumed.vl`: which functions' results no caller consumes (`ucCompute`, D2631) and the bare-return, valued-return and `break v` predicates, 25 declarations and 385 lines that import only `./ast` and own their state.
- It was chosen from a reference graph over the file's 4,572 top-level declarations as the closed set with the fewest names used from outside (4) and no shared state; the seed differs only in function order (same size, same self-compile and plumb-shape fuel) and output identity holds over `tests/cases` and the distilled corpus.
- The second carve, `compiler/check_places.vl`, holds the narrowing place key (`placeKeyOf`, `subscriptKeyTextOf`) and the get-site table (`getSiteNodes`/`getSiteFns`, `getSiteFnOf`, `getSiteBank`), 6 declarations that import only `./ast`; the checker still resets and reads the table.
- `compiler/check_match_hoist.vl` holds the match-scrutinee hoist (`hoistMatchScrutinees`, the `hms*` walk, D1991/D2038), 33 declarations that import `./ast`, `nodePos` and `placeKeyOf`.
- The record-width rewrite's state and step are `compiler/check_width.vl` (D3992): the rewrite rows, the per-pass pending and refusal tables, and the apply, undo and decline operations `check_pins.vl`'s width phase drives, 21 declarations that import only `./ast` and `./listutil`.
- Six `ws*` functions stay in `typecheck.vl` because they read the type arena or the checker's scope: `wsVarTy`, `wsCandidate`, `wsInferredRetPrim`, `wsCalleeDecl`, and `wsNotePending` and `wsOrigTyOf`, which name a call's callee through `wsCalleeDecl`.
- The seed is the same size and differs only in function order, self-compile and plumb-shape fuel are unchanged, the candidate compiles master's source to master's fixpoint byte for byte, and output identity holds.
- Definite assignment is `compiler/check_definite.vl`: the live set, its undo log and frame stack, and the fork/join operations, 34 declarations that import only `./symbols`; 15 names cross into the checker.
- `daCheckRead` stays in `typecheck.vl` because it reports through `tErr`.
- Exporting the void-shaped helpers takes them out of `ucCompute`'s void inference (D2631), so eight of them now return an `i32` their callers drop.
- The seed grows by 26 bytes, and self-compile and plumb-shape fuel are unchanged, since wasmtime charges no fuel for `drop`.
- The candidate compiles master's source to master's fixpoint byte for byte, and output identity holds.
- The non-empty list facts (D3558) are `compiler/check_narrow_ends.vl`: the `ne*` fact table and its open, close, kill and pop-takes operations, plus `crUnParen`, 17 declarations that import `./ast` and `./check_places`.
- The function a fact belongs to, which was read from `curFnDeclIx`, is now an argument of `neEnter`, `neKill`, `neAssigned` and `nePopTakes`; `coalNonNullWhy` asks the new `nePopKeyOf` instead of reading the table.
- The rest of the `cr*` family stays in `typecheck.vl`: it is some 150 declarations of capture, loop-read, alias and sole-reference state that read the type arena, the scope chain and each other, with no closed subset smaller than the whole.
- The capture-loss notes (D2407, D2529) are `compiler/check_capture_loss.vl`: the table of lost reads and the sentence a refusal gains, 12 declarations that import `./ast` and `./fmt_util`, with `crSpans` and `nodeLineOf` moved alongside; the caller passes each record's function and scope depth to `crLostPush`, and 7 names cross into the checker.
- The `crValUse*` walk stays: `crValUseEnter` reads the arena epoch and edit log, the getter and operator tables and the program root.
- The seed is 535 bytes smaller and differs in function order, and output identity holds.
- The syntax-only closure-capture walks are `compiler/check_capture_walks.vl`: the writer analysis of a root (`crwEnsure`, `crwVisit`, `crs*`), the by-reference capture walk (`crCaptureByRef`, `crbrWalk`), the nulled-name walk (`crNulledWalk`) and the escape and mention walkers, 74 declarations in 696 lines that import `./ast`, `./check_narrow_ends` and `./check_places`, with 33 names crossing into the checker; none of it reads the type arena or the scope chain. It was found by a reference graph over the file: the closure of the `crw`, `crbr`, `crs`, `crNulled` and `crBy` families, widened by every `cr` function whose callees all lay inside it. The seed is 3 bytes larger (5,559,561 to 5,559,564) and differs in function order; `difftree.sh --identity` reads `15156 files · 10196 built · 0 differ · 0 uncompared` with the fixpoint holding, and `regress.vl` reads `no cell changed class`.
- The syntax half of the covariant write scan is `compiler/check_write_scan.vl`: the frame table (which binding a name means), the occurrence index (`cwIx*`), callee, parameter and receiver resolution, and the escape, seal and claim walks, with `fnDeclIx`, `fnDeclParamsOf` and `declFirstParamIsSelf` moved alongside. It is 177 declarations in 2,053 lines that import `./ast`, `./symbols`, `./listutil` and `./check_suggest`, with 107 names crossing into the checker (2 of them also into `wasmEmit.vl`, 1 into `check_pins.vl`); none of it reads the type arena, the scope chain or `tErr`. It was found by a reference graph over the file as the closure of the `cw` family; the `cw` and `rcw` functions that read types stay. Seven exported void helpers now return an `i32` their callers drop (D2631), so the seed is 26 bytes larger (5,561,857 to 5,561,883) and otherwise differs in function order; `difftree.sh --identity` reads `15159 files · 10200 built · 0 differ · 0 uncompared` with the fixpoint holding, and `regress.vl` reads `no cell changed class`. Two ratchets rose because the lints read one module at a time: 13 `fnDeclIx[…]` subscripts are no longer known to be map reads (sentinel-index), and one ladder that delegates to `cwPeel` gained a finding (kind-ladder).
- The compiler-intrinsic name tables are `compiler/check_intrinsics.vl`: the inline-lowered memory, SIMD, atomic and saturating-truncation families with their table builders and rows, the memory-offset bounds, the ordered host floor (`fsIntrinsic*`, `fsArg*`, `fsRet*`) and the reserved-name predicates. It is 79 declarations in 663 lines that import only `CALLSITE_NAME` and `numLexIsFloat`, with 53 names crossing into the checker; `wasmEmit.vl`, `emit_sections.vl`, `emit_classify.vl` and `driver.vl` now import them from the new module instead of `typecheck.vl`. The `declare*Intrinsics` functions, the row-type builders and the three `checkNot*` refusals stay, since they read the type arena or report through `tErr`. `simdTableBuild` and `atomicTableBuild` now return an `i32` their callers drop (D2631) and global initialisers reorder, so the seed is 6 bytes larger (5,560,369 to 5,560,375); `difftree.sh --identity` reads `15162 files · 10203 built · 0 differ · 0 uncompared` with the fixpoint holding, and `regress.vl` reads `no cell changed class`. No ratchet moved.
- The syntax half of the record covariance write check (D2060) is `compiler/check_record_writes.vl`: the widened-slot entries and their re-rooting under a handle (`rcwTyped`, `rcwUnder`, `rcwPrefix`), the source-slot type a place reads, the freshness walk (`rcwSlotFresh`, `rcwAllFresh`), the collection-method kinds, the call sites that may reach a function and the renderings a refusal names. It is 46 declarations in 701 lines that import `./ast`, `./check_places`, `./check_write_scan`, `./check_suggest`, `./check_capture_loss` and `./srcmap`, with 28 names crossing into the checker; `keyHasPrefix` moved to `check_places.vl` beside the place key it tests. It holds no state, and none of it reads the type arena, the scope chain or `tErr`. It was chosen from a reference graph over the file as the largest callee-closed set that reads no `let`, since every larger family (the rest of `rcw`, `rec`, `lbi`, `nj`) shares state the checker writes. The seed is the same size as master's (5,566,857 bytes) and differs in function order; `difftree.sh --identity` reads `15163 files · 10204 built · 0 differ · 0 uncompared` with the fixpoint holding, and `regress.vl` reads `no cell changed class`. One ratchet rose because the lint reads one module at a time: `zeroBytesBindScan`'s tail calls `rcwModOf`, which the kind-ladder rule had read as a delegation to a same-module function (kind-ladder, 361 to 362).
- The type arena moved below the checker: `compiler/check_types.vl` holds `T` and its `Ty` rows, the `TY_*` primitives, the named-type registries (`cStruct*`, `cVariantMember*`, `cUnion*`, `nw*`, `cUserTypes`), the generic-application rows (`gaApp*`), the literal-union naming table (`lu*`), and `tyToStr`, `tyToEmitName`, `tyEq`, `tyFieldTyOf` with every `ty*` query that reads nothing else. It is 226 declarations in 3,671 lines; 175 names cross back into the checker, and 17 other modules now import those names from it rather than from `typecheck.vl`. This was option (a), moving state down: in a reference graph over the file's 4,049 declarations, 1,833 read `T`, and 1,152 declarations (20,339 lines) outside the `tErr` cycle reach `T` and nothing else that keeps them in `typecheck.vl`, so they become carvable now. `initChecker` still resets the tables, since an importer can reassign an imported `let`. The seed is the same size as master's (5,591,414 bytes). In a sorted, index-stripped disassembly it differs in function order, in the order of the global initialisers, and in 519 `i32.const` operands: string-literal-union atoms 85 to 94 renumbered as one permutation, because `PrimName` and `LitKind` now come from another module. `difftree.sh --identity` reads `15163 files · 10204 built · 0 differ · 0 uncompared`, and the fixpoint holds. `regress.vl` reads `distilled: no runs lost`; its 7 `trap_loads -> trap_loads` cells print the same backtrace offsets from master's seed. Ratchets: kind-ladder went from 362 to 372, as 7 ladders whose tail delegated to a same-module function now call an import (the #3798 artifact); sentinel-index stays at 306, with two reads moving file.
- Two purpose-grouped modules carve the type queries that reach only `T`: `compiler/check_ty_shape.vl` (what a type is: `null`/`void`/`never` admission, numeric primitives, the union arm queries, the literal-set and `v128` nesting tests, and the hole and type-variable reachability walks) is 81 declarations in 1,357 lines over `./check_types`, `./listutil` and `./ast`; `compiler/check_ty_rep.vl` (how a type is stored: the value-union box and atom kinds, the map key kind and value cell tag, the element store and escape classes, the niche, the array spine, the nominal base and the union emit names) is 89 declarations in 1,545 lines over `./check_types`, `./tyname`, `./ast` and `./check_ty_shape`. They were chosen from a reference graph over the file's 3,823 declarations, in which 1,056 (14,118 lines) have a closure that reads no `let`, no constraint or IR table and nothing of `./check_state`; these two groups are the ones with a single purpose. 119 names cross back into the checker, and nine emit modules now import theirs from the new modules. The seed is the same size as master's (5,592,951 bytes) and differs only in function order: a `--names` build's index-stripped disassembly has the same 10,702 functions, identical bodies, and the same remaining lines as a sorted set. `difftree.sh --identity` reads `15167 files · 10208 built · 0 differ · 0 uncompared` with the fixpoint holding, and `regress.vl` reads `distilled: no runs lost`; master's seed moves the same 7 `trap_loads -> trap_loads` cells. Ratchets: kind-ladder went from 372 to 376 because 4 ladders that stay in `typecheck.vl` (`numKindMask`, `nodeTyIsUnionAlias`, `jsonArmElemOf`, `forInBindTy`) delegate to a function that is now imported (the #3798 artifact); sentinel-index fell from 306 to 303 because three `T.tys[...]` reads moved to a module that never tests those fields against `-1`, which is the detector losing sight of them, so the baseline is not lowered.
- How two types relate as stored values is `compiler/check_ty_relate.vl`. It covers `==` soundness and the compare kinds (`isEquatable`, `eqRefusals`, `EqCmpKind`, `EqCore`), record storage equality and numeric adoption (`rec*`, `fieldStorageEq`), lossless numeric widening (`numWidens*`, `widerNumeric`), the function-slot rep difference (the `fva*` predicates; `fvaLambda` stays because it mints nodes), the map twin, join storage, the list widening copy (`listPairNeedsCopy`, `containerWiden*`) and `widenTargetOf`. It is 72 declarations in 1,534 lines that import only `./check_types`, `./check_ty_shape`, `./check_ty_rep`, `./listutil` and `./emit_bignum`. 39 names cross back into the checker, and `emit_classify.vl` and `wasmEmit.vl` now import their 6 names from the new module. It was chosen from a reference graph over the file's 3,653 declarations. In that graph, 860 declarations (8,222 lines) have a closure that reads no `let` and imports only below the checker. This group has 87 internal edges, no edge to code that stays, and 80 inbound references from 51 staying declarations. The numeric-literal facts were the other candidate, with 237 inbound edges and 62 names back. The seed is the same size as master's (5,711,364 bytes) and differs in order. The candidate compiles master's source to master's seed byte for byte, and master's seed compiles the candidate's source to the candidate's seed. `difftree.sh --identity` reads `15174 files · 10215 built · 0 differ · 0 uncompared` with the fixpoint holding. `regress.vl` reads `distilled: no runs lost`, with the same 7 `trap_loads -> trap_loads` cells. Ratchets: kind-ladder stays at 342. Six findings moved from `typecheck.vl` (80 to 74) to the new module (0 to 6), so the baseline's per-file split is rewritten.
- The type constructors that read no checker state moved into `compiler/check_types.vl`, beside the arena they append to: `addTy`, `mkPrim`, `mkErrTy`, `mkObjTy`, `mkFuncTy`, `mkNullableTy`, `mkNullableTyOf`, `mkArrayTy`, `mkArrayViewTy`, `mkMapTy`, `mkLitTy`, `litMemberTy`, `mkNegTy` and `canonIntLexeme`, with the two flags only constructors set (`tyMapMinted`, `tyWideUnionMinted`). It is 16 declarations in 137 lines, with 15 internal edges and none to code that stays; 15 names cross back over 108 references from 79 staying declarations. `emit_rewrite.vl`, `emit_classify.vl` and `emit_mono.vl` now import their constructors from `check_types.vl`. `mkUnionTy`, `mkTyVar`, `mkGuardedRetTy`, `mkDerivedHole`, `mkBinOpRetTy` and `mkWideStrLitTy` stay because they read checker state. In a graph of the file's 3,581 declarations, 844 (10,088 lines) have a closure that reads no `let` and imports nothing stateful. The numeric-literal facts were the other candidate and are two clusters: the literal-binding lattice and the literal-fact queries. Their closure is 109 declarations in 1,122 lines with 316 inbound edges and 90 names back, and the lattice half alone still has 46 names back from 52 declarations, because the stateful solver reads its `LBI_*` constants. The seed is the same size as master's (5,704,455 bytes). The candidate compiles master's source to master's seed byte for byte, and master's seed compiles the candidate's source to the candidate's seed. `difftree.sh --identity` reads `15175 files · 10216 built · 0 differ · 0 uncompared` with the fixpoint holding. `native-fixpoint.sh` reads `NATIVE FIXPOINT HOLDS`, and `seed-size.vl --check` reads `+1.0%`. `lint-self.sh` reads `self-lint + fmt-check clean`. `regress.vl` reads `distilled: no runs lost`, with the same 7 `trap_loads -> trap_loads` cells. Ratchets: no per-file split moved, because the moved code holds no ladder, sentinel, scan, comment, interpolation or export finding. A fresh write of each baseline differs only in `commit`, so none is rewritten.
- The numeric-literal facts that read no checker state are `compiler/check_num_lits.vl`: the literal-binding lattice (`LBI_*` and the `lbi` join and fit queries), the exact-constant fits (`cex*`), the integer and float literal queries (`numLit*`, `intLit*`, `isExact*`, `isFloatLitExpr`, the f32 adoption tests), the literal-tree and numeric-union queries (`litTree*`, `numUnion*`), the cast and shift checks (`numCastCanFail`, `castConst*`, `castShiftCount`, `shiftCountMsg`) and the literal-zero and match-pattern tests, with `nodeStartOf` and `exportKwOf` moved alongside; `parenPeelIx` moved to `check_places.vl`. It is 120 declarations in 1,198 lines that import `./ast`, `./check_places`, `./check_record_writes`, `./check_suggest`, `./check_ty_shape`, `./check_types`, `./check_write_scan`, `./const_exact` and `./emit_bignum`, with 104 internal edges and 229 inbound; 97 names cross back to 106 staying declarations, and `emit_classify.vl` and `wasmEmit.vl` now import their 3 names from it. The previous carve's premise that this waited on the solver's state was wrong: the stateful solver (`lbiMark`, `lbiReset`, the `lbi*` tables), the `cex` state and `numLitFnNote` stay in `typecheck.vl` and import the constants and queries. In a graph of the file's 3,569 declarations, 841 (9,369 lines) have a closure that reads no `let` and nothing of `./check_state`; this was the largest component at 1,386 lines, held together by `parenPeelIx`, and the next three are 348, 342 and 307 lines. The seed is the same size as master's (5,705,334 bytes) and differs in function order. The candidate compiles the base source to the base seed byte for byte, and the base seed compiles the candidate's source to the candidate's seed. `difftree.sh --identity` reads `15175 files · 10216 built · 0 differ · 0 uncompared` with the fixpoint holding. `native-fixpoint.sh` reads `NATIVE FIXPOINT HOLDS`, and `seed-size.vl --check` reads `+1.0%`. `lint-self.sh` reads `self-lint + fmt-check clean`. `regress.vl` reads `distilled: no runs lost`, with the same 7 `trap_loads -> trap_loads` cells. Ratchets: kind-ladder stays at 342, with three ladders moving from `typecheck.vl` (74 to 71) to the new module (0 to 3), so the baseline's per-file split is rewritten.
- The numeric-literal state the checker keeps is `compiler/check_num_lit_state.vl`: the literal-binding solver's tables (`lbi*`) with its row order, settle, refuse, pin and apply steps (`lbiRowOrder`, `lbiSettleEdges`, `lbiSolveOne`, `lbiRefuse`, `lbiApplyPins`, `lbiDropUnobservable`, `lbiPending`), the exact-constant tables and notes (`cex*`), the numeric-literal note queues (`nl*`, `nln*`, `numLitFnNote`, `numLitNotesDisagree`), `markNumLitBinding` and the binding-mark helpers (`bindMarkPush`, `bindMarkPopTo`, `CEX_DEPTH`). It is 128 declarations (84 `let`s) in 1,096 lines that import only modules below the checker; 111 names cross back into `typecheck.vl`, and `check_pins.vl`, `check_query.vl` and `emit_sections.vl` now import their 7 names from it. The two options were weighed on a reference graph of the file's 3,452 declarations. Purpose-grouped pure carves: 729 declarations (8,993 lines) have a closure that reads no `let`, and the largest component is the overload and UFCS messages at 26 declarations in 417 lines (19 names back, 51 inbound), then 20/365 and 30/313. Moving the state: letting the `cex`, `numLitBind`, `nl` and `lbi` tables move makes 125 more declarations pure (995 lines, 108 names back, 269 inbound), and their closure needs only the three binding-mark helpers from outside. The `lbi` tables carry most of that; `cex` and `nl` alone free 12 and 34. The literal steps that stay read the scope chain (`lookup`, `lookupDepth`), the node-type table (`nodeTyOf`, `nodeTyIxOf`, `nodeTySet`), `tErr`, `inferQuiet` or `assignable`. The seed grows 34 bytes (5,707,805), from 15 `drop`s after calls to exported helpers that now return a value across the module boundary (D2631), with the same 10,837 functions. The candidate compiles master's source to master's seed byte for byte, and master's seed compiles the candidate's source to the candidate's seed. `difftree.sh --identity` reads `15178 files · 10218 built · 0 differ · 0 uncompared` with the fixpoint holding. `native-fixpoint.sh` reads `NATIVE FIXPOINT HOLDS`, and `seed-size.vl --check` reads `+1.1%`. `lint-self.sh` reads `self-lint + fmt-check clean`. `regress.vl` reads `distilled: no runs lost`, with the same 7 `trap_loads -> trap_loads` cells. Ratchets: a fresh write of each baseline differs only in `commit`, so none is rewritten.
- The node-type table is `compiler/check_node_tys.vl`: `nodeTyIx` and `nodeTyWrites`, the writer `nodeTySet`, and the queries that read a node's type through the table and nothing else (`nodeTyOf`, `nodeTyIxOf`, `nodeTyRecord`, the `nodeTyIs*` and `nodeArrayElemTyIx` families), with `colAt` moved alongside. It is 72 declarations in 804 lines that import only `./check_types`, `./check_ty_shape`, `./check_ty_rep` and `./check_ty_relate`, with 73 internal edges and 218 inbound from 175 staying declarations; 12 names cross back into `typecheck.vl`, and twelve other modules (`wasmEmit.vl` 26 names, `emit_classify.vl` 44, `emit_mono.vl` 15, `emit_sections.vl` 12 and eight more) now import theirs from it. The two options were weighed on a reference graph of the file's 3,324 declarations, in which 718 (8,835 lines) have a closure that reads no `let` and nothing of `./check_state`. Moving the node-type table makes 111 more declarations pure (1,717 lines); moving the scope chain makes 72 more (1,242 lines) with `fnDeclScopes`, `constScopes` and `fnAliasScopes` beside `scopeDepthsOf`, and both together 192 (3,152 lines); `inferQuiet` frees none. The table went first because its queries are what the emitter reads. The other 39 declarations it freed (the `cw`, `covar`, `es`, `lbi` and `cex` steps that read node types, `recordNodeTyFrom`, `initTypedByAnnot` and others) stay for a purpose-grouped carve. Exporting `nodeTySet` takes it out of `ucCompute`'s void inference (D2631), so it returns an `i32` its callers drop and the seed grows 44 bytes (5,707,805 to 5,707,849), with the same 10,841 functions. The candidate compiles its own source to itself, compiles the base source to the base seed byte for byte, and the base seed compiles the candidate's source to the candidate's seed. `difftree.sh --identity` reads `15178 files · 10218 built · 0 differ · 0 uncompared` with the fixpoint holding. `native-fixpoint.sh` reads `NATIVE FIXPOINT HOLDS`, and `seed-size.vl --check` reads `+1.1%`. `lint-self.sh` reads `self-lint + fmt-check clean`. `regress.vl` reads `distilled: no runs lost`, with the same 7 `trap_loads -> trap_loads` cells. Ratchets: kind-ladder stays at 342, with six findings moving from `typecheck.vl` (71 to 65) to the new module; sentinel-index stays at 303, with one `T.tys[…]` read moving; both per-file splits are rewritten. render-parse is a fresh write: master's committed baseline was stale (`emit_mono.vl` 44, `ty-string-parse` 379, where master reads 43 and 378).
- The scope chain is `compiler/check_scopes.vl`: the inverted chain `scopeDepthsOf`, the parallel per-frame tables `constScopes`, `fnDeclScopes` and `fnAliasScopes` with the hoisted `moduleConstDecl`, the binder `declare` and `declareFnDeclNode`, and the queries that resolve a name through them (`lookup`, `lookupDepth`, `isConstName`, `constDeclOf`, `lookupFnDeclNode`, `lookupFnAliasNode`, `recFnDeclByName`, `mergedDeclKeyOf`, `declParamsInScope`, `calleeDeclParams`, `isModuleScopeConst`, `numIntrShadowed`, `moduleFnDeclOf`). It is 20 declarations in 190 lines that import `./ast`, `./check_suggest`, `./check_types` and `./check_write_scan`; all 20 names cross back into `typecheck.vl`, and `check_num_lit_state.vl` and `check_width.vl` import `lookup` and `lookupDepth` from it. In a reference graph of the file's 3,252 declarations, letting the four chain tables move frees 85 declarations (1,456 lines), and `moduleConstDecl` three more. The freed steps that fit an existing module's purpose moved with it: 39 numeric-literal steps (the `lbi*` and `cex*` steps that read the chain or the node-type table, `bindMarkHas`, `numLitDeclOf`, `readsLitConst` and the `argIs*` tests, plus `lbiCopyLit`, `lbiOperandRow`, `cexRetype` and `cexWideConstNote`, which #3829 freed) into `check_num_lit_state.vl` (701 lines); `wsCalleeDecl`, `wsInferredRetPrim` and `wsNotePending` into `check_width.vl`; the three `tailPush*` walks into `check_unconsumed.vl`; `floatIntrArity`, `intIntrArity` and `intIntrIsCompare` into `check_intrinsics.vl`; and `isIdentCharAt` into `check_suggest.vl`. That is 69 declarations in 1,021 lines, with 56 names crossing back into `typecheck.vl`. The rest of what was freed (the overload and UFCS messages, the `we*`, `cr*` and `rec*` steps) has other purposes and stays. The seed grows 7 bytes (5,710,035 to 5,710,042), from 3 `drop`s after calls to helpers that now return a value across the module boundary (D2631), with the same 10,844 functions. The candidate compiles master's source to master's seed byte for byte, and master's seed compiles the candidate's source to the candidate's seed. `difftree.sh --identity` reads `15179 files · 10218 built · 0 differ · 0 uncompared` with the fixpoint holding. `native-fixpoint.sh` reads `NATIVE FIXPOINT HOLDS`, and `seed-size.vl --check` reads `+1.1%`. `lint-self.sh` reads `self-lint + fmt-check clean`. `regress.vl` reads `distilled: no runs lost`, with the same 7 `trap_loads -> trap_loads` cells. Ratchets: kind-ladder stays at 342 and sentinel-index at 303, and a fresh write of each baseline differs only in `commit`, so none is rewritten.

### SMALL log

- **S-c front-end tidy**: State on 2026-10-14: **partial**
- **S-c front-end tidy**: `typecheck.vl` imports `./ast` once (byte-identical seed).
- **S-c front-end tidy**: Not byte-identical, so not done: the second `Tok` (the lexer's has no `pos`), the operator-name table (a shared `isStrFuncName` shrinks the seed 299 bytes), `kindTag` (inlining grows it ~2.4 KB), `ErrExpr.errWhat`/`errAt` (a pos-only `ErrExpr` absorbs other pos-only literals at the `asObj` literal in `typecheck.vl` and fails to check).
- **S-c front-end tidy**: `await` skipped: a surface decision.
- **S-a, S-b, S-d … S-n**: State on 2026-10-14: **partial**
- **S-a, S-b, S-d … S-n**: Per-row status is in the SMALL table of `code-quality-2026-10.md`.
- **S-a, S-b, S-d … S-n**: Done: S-a rows 1–3 (#3662; row 4 measured not hot and declined), S-b (#3669, #3678, #3682; rows 2 and 3 stale or L4's), S-d rows 1–2 (#3687) and row 3 in part (#3697), S-e rows 1 and 3 (#3688), S-f (#3689, deliberate), S-h (#3665), S-i row 1 and the `value_flags` half of row 2, S-j (#3696).
- **S-a, S-b, S-d … S-n**: Open: S-e row 2 (the `literal-opcode-write` budget rule), S-g (waits on SC), S-i row 2's `engineFailOffset` test (the seed does not export it), S-l, S-m, S-n.
- **S-a, S-b, S-d … S-n**: S-k is superseded by the no-Python direction.

### RepDesc log

- State on 2026-10-14: **ruled** 2026-10-13
- `open-rulings.md`: `one-literal-union-rep` is RULED and applied (#3653): the literal-union family of D3 is unblocked, since a string literal union's rep is a function of its type and the descriptor can be total over literal unions without the alias carve-out.
- `nullable-rep-rule-stated-once` is RULED (b): `repOfNullable` becomes a `_`-less `match`.

### T2 log

- L11 the VL way: the per-file budgets move into `vl lint` itself (a baseline-reading budget mode), so the ratchets need neither Python nor spawn.
- The twin Python censuses retire as each rule's budget moves.
- **Started:** `vl check --budget` holds and writes the interp ratchet (`--budget-why`, `--write-baseline`, `--exempt-codes`; `compiler/cli_budget.vl`; #3617, #3624) and `interp-budget.py` is retired; the comment and arena-scan ratchets followed (#3648), so `vl check --budget` now holds interp, sentinel, comment and scan; the ladder, export (#3667) and render-parse (#3677) ratchets followed, so every lint-held per-file ratchet runs there and `ratchet.py` is deleted.
- **Done.**

### T3 log

- **In progress.** `check-filed-witnesses.vl` and `distilled/regress.vl` are ported and run their gate rows; `check-filed-witnesses.py` and `scripts/inventory/*.py` are deleted (the row grammar is `scripts/lib/inventory.vl`, the queue `scripts/inventory/ls.vl`); `regress.py`, `index.py`, `redistil.py` and `gradecensus.py` are deleted for `index.vl`, `redistil.vl` and `census/gradecensus.vl`, which share `scripts/lib/corpus.vl` and `scripts/lib/census-grade.vl`; `cellmap.py` is deleted, its files read and written through `loadCells`/`dumpCells`.
- `plumb-shape-cost.vl` (#3610) is the third: it runs the `plumb-shape cost` row in `gate.sh` and ci-native, and its port test replayed one recorded set of readings through the Python, byte-identical in report, exit code and baseline file for every outcome, and agreed on a real-tree `--check`.
- Its CPU is serial by design, so it has no fan-out; it reads rusage through GNU `time`, sets a child's directory and environment through `env -C`, and hashes through `sha256sum`, the three `dogfood:` rows in ROADMAP.md on `runProgram` and digests.
- Its control workload is `scripts/perf/plumb-shape-control.vl`, which times differently from the Python's, so the baseline's CPU fields need one `--write-baseline` with the VL tool on a quiet box before CPU is graded again; fuel and RSS are unaffected.
- `survey-regrade.vl` runs the `survey measurements` row (#3615) and printed the Python's report byte for byte on every fixture case and on the real survey with a real profile.
- Both Pythons are deleted: `tests/vl_plumb_shape_port_test.ts` now pins each outcome's exit code and line, `tests/vl_survey_regrade_port_test.ts` holds the port to the Python's reports frozen in `tests/fixtures/survey-regrade/golden.json`, and the disagreements (each tool's own re-baseline command, a usage line for the docstring, one stdout line for a stderr traceback) are assertions.
- `seed_provenance.py` is deleted; `tests/vl_seed_provenance_test.ts` holds `seed-provenance.vl` to the values the Python printed on a fixed tree.
- `capability-probes.vl` (#3613) runs its gate rows and `capability-matrix.vl` replaced `matrix.py`; `capability-probes/run.py` and `goal-scoreboard.py` are deleted, `goal-scoreboard.vl` pinned to the Python's output by `tests/vl_goal_scoreboard_test.ts`, and the day-one sampler grades through `capability-probes.vl --grade-channel`.
- `corpuscmp.py`, `grade.py` and `profile-rank.py` are deleted for `silent-sweep/corpuscmp.vl`, `silent-sweep/grade.vl` and `profile-rank.vl`, each run beside the Python on real inputs and pinned by `tests/vl_corpuscmp_test.ts`, `tests/vl_grade_test.ts` and `tests/vl_profile_rank_test.ts` (the disagreements named there: a rounding tie, and one stdout line with its own exit code where the Python raised a traceback).
- `scripts/silent-sweep/` is down to three `.py` files from 55: the census readers `delta`, `coverage`, `siblings`, `rescue`, `families` and `d243/mkset` are `census/*.vl` over a shared `scripts/lib/census-read.vl`, byte-identical to the Python on two real census blocks and pinned by `tests/vl_census_readers_test.ts`, and the 46 one-shot grid generators, ablators and the 2026-08 sweep's `REPRODUCE.md` Python are deleted, their READMEs kept and dated.
- The census generators `gencensus`, `mkmatrix` and `sabcensus` are `census/*.vl` too, pinned by `tests/vl_census_generators_test.ts`, so `scripts/silent-sweep/` has no Python.
- The last `scripts/*.py` tools are ported and deleted the same way, each run beside its Python and pinned by a test: `sentinel-census`, `wasm-runner-census`, `twin-agreement`, the four wasm fixture generators (over `scripts/lib/wasm-cases.vl`), `emit-refusal-sites`, `codemods/label-at`, and `ladder-census` and `rep-classifier-census` (over `scripts/lib/ladder-walk.vl`, which `ladder-sets.vl` now shares).
- Remaining Python in gate rows includes the ratchets.
- Each gap found is filed as a `dogfood:` row.

### T4 log

- L10: the `-O` optimizer.
- **In progress:** rungs R1, R2, R3 and R5 (the multi-value step) run in the compiler and their Rust is deleted, and R4 (a module writer) has landed.
- R6a (the inline-record step's census) and R6b (its walk and decision) run beside the Rust.
- Next: R6c (its rewrite), then R7 (list flattening).

### T5 log

- L12: the remaining LSP features.
- **Done:** every seed-backed feature lives in `lsp/src/features.ts` beside folding (definition, references, document highlights, document symbols, signature help, hover, inlay hints and semantic tokens in the first PR; completion, formatting, code actions, code lens and rename in the second), each taking a `FeatureContext` (checker, module key, reader, log) and answering in plain shapes.
- `server.ts` is transport: it fetches the document, calls the feature and converts to protocol types.
