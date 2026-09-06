# The memo-generation census — every staleness key in `compiler/*.vl`, graded

D1655 was a memo whose staleness key was blind to an IN-PLACE fill. `globalCellKind` stamps
its answers on the arena epoch, on `P.nodes.length` and on the LENGTH of four collect tables;
`fRetKind` — which the call rung reads through `fnRetRefArraySid` — is pushed by `buildFnMap`
and then written **in place** by `computeRetInference`, so it moves none of those. A query
from an earlier pass (`capNarrowBuild`, resolving `if e0 is Circle` over `const e0 = v[0]`)
froze the seeded `"i32"`, `globalPromotable` read it as a plain numeric scalar, and the start
function stored a `(ref $rlWrap)` into an i32 local: `vl check` rc 0, invalid module.

#2690 fixed it with a generation, not a fifth column: `emitPassGen` counts pass-table rows and
`gckStale` reads it, so **a memo answer may not outlive the pass that computed it**. That is
the contract the ladder actually has — it reads collect tables, and the pass table is what
fills them — and it cannot be defeated by a rung that starts reading a table nobody listed.

This page is the rest of the family, and the instrument that keeps it graded.

## The population is derived, not remembered

`python3 scripts/memo-generation-probe.py --list` reads `compiler/*.vl`, finds every
module-level binding whose name carries a generation marker (`Epoch`, `Gen`, `Len`, `Ver`,
`Seen`, `Root`, `Stamp`, `Head`), finds every guard that compares one, and fails if a stamp
appears that its `ROWS` table does not classify or a row's anchor has been reworded away. On
2026-09-05: **121 stamp variables, 34 read by a guard, 27 rows.**
`tests/vl_memo_generation_test.ts` runs it on every PR in 0.4 s, so a new memo cannot join the
tree ungraded.

| verdict | rows | what it means |
| --- | --- | --- |
| `pass-stamped` | 3 | the key reads `emitPassGen`, or a phase flag that is one |
| `no-refined-input` | 3 | every table its value reads is push-only or reset wholesale |
| `resume-reseeds` | 2 | a resume bank that writes the refined columns back before reusing them |
| `not-a-memo` | 8 | a visit mark or a per-row flag — no cached ANSWER to go stale |
| `probe` | 12 | safety is measured, not argued |

### The rows

| memo | key reads | in-place-filled input after it can first be asked | verdict |
| --- | --- | --- | --- |
| `globalCellKind` | `tyMutEpoch`, `P.nodes.length`, 4 collect lengths, **`emitPassGen`** | `fRetKind` and its five siblings (D1655) | pass-stamped |
| `refArrShapeIndex` (`ras*`) | `tyMutEpoch`, `cUserTypesVer`, `P.nodes.length`, 4 collect lengths, **`emitPassGen`** | none named; the row also carries the arena epoch and the declared-type version, and the identity proof is the compiler's own codegen plus 3,045 corpus modules | pass-stamped |
| `dsgReady` (declared-struct graph) | `emitRootIx`, `P.nodes.length` | none reachable: the `emitArenaFinal` gate means no pass runs after it is built | pass-stamped |
| `variantSig` | `uFieldNames`/`uFieldStart`/`uFieldCount` lengths | none: it reads field NAMES, and all three tables are push-only | no-refined-input |
| `objVariantIndex` (`ovn*`) | `uVariants`/`uFieldStart`/`uFieldCount` lengths | none, the same three tables through `variantSig` | no-refined-input |
| `declStructNodeOf` | top-level `stmts.length` | none: it indexes `TypeDecl` nodes, which no pass rewrites | no-refined-input |
| `buildFnMapResumable` | 8 collect lengths | `fRetKind` and siblings — and `buildFnMapReseedPrefix` writes the banked seed back over the prefix, which is what makes the resume exact rather than merely cheap | resume-reseeds |
| `collectAResumable` | `P.nodes.length` + 7 collect lengths | the annotation sidecars; the bank is armed only for a run no arena-editing pass crosses | resume-reseeds |
| `monoGen`, `daGen`, `klGSeen`, `npEpochs`/`asgDeclEpochs`, `emitNameSeen`/`nomNameSeen`/`stSeenStack`, `gRootStmts`, `repSeenGen`, `rtWalkGen` | — | — | not-a-memo |
| `repKeyMemo` / `hcCanonMemo` | `tyMutEpoch` | its own canon-key columns | probe |
| `repElemMemo` / `hcElemMemo` / `hcMvMemo` | `tyMutEpoch`, `cUserTypesVer`, `sNames.length` | its own columns | probe |
| `repSlotCache` | `tyMutEpoch`, `cUserTypesVer`, `sNames.length` | `sFieldTypes`, which `unifyMixedLitRepArms` re-lays in place at the end of `collectS` | probe |
| `repSlotRep` | `tyMutEpoch` | `sFieldTypes`, through `structFieldCodesEq` | probe |
| `repTree` (`rtEpoch`/`rtUserVer`) | `tyMutEpoch`, `cUserTypesVer` | its own tree columns | probe |
| `structIndexOfObjCtx` (`sio*`) | `sNames.length`, the asking frame | `sFieldTypes`, through the field-set match | probe |
| `startBlockLetRow` (`sbl*`) | `sblEpoch`, bumped beside `startStmts` | `startStmts`, re-pointed by `dispatchRewrite` | probe |
| `memberSetIntern` (`msSetGen`/`msGen`) | `msGen` | the member-set rows | probe |
| `parentLetCache` (`plCacheBlock`/`plGen`) | the cached BLOCK index | the arena bodies the rewrites re-point inside that block | probe |
| `anonLeafIndex` (`anonIxSeen`) | `P.nodes.length` | its own link columns | probe |
| `fnChildIndex` | `fnChildHead.length` vs `fnStmts.length` | `fnParent`, written in place by `monomorphize` | probe |
| `elemRowsCaptureWalk` (`ercGenP`/`ercStamp`) | **`emitPassGen`**, and a per-walk stamp so a new walk clears nothing | none: the table is rebuilt when the pass generation moves, and a slot is dead the moment its walk id is stale | pass-stamped |
| `covarValueWriteState` (`cwArenaLen`) | `P.nodes.length` | its own `cwIx*` index, dropped with it; and `nodeRepTyIx`, a checker sidecar written in place | probe |

## The `probe` verdict is a measurement — one row at a time

`--run --only=<id>` disables ONE memo (it misses on every call, strictly stronger than
stamping it on `emitPassGen`) and builds a probe compiler. Two populations are then asked
whether any answer moved:

* **the compiler's own source** — ~100k lines of VL, the largest program available: build it
  with the probe compiler and byte-compare against master's fixpoint;
* **the distilled corpus** — 7,565 cells, 1,477 behavioural classes.

**Do not disable them all at once.** Several are performance memos of D1090/D1513's class:
with every row off, the probe compiler exhausts the GC heap on its own source *and* on eight
capability-matrix cells, and a resource failure masks every answer difference behind it. One
row at a time, each disabled memo still compiles the whole compiler.

Readings on 2026-09-05, master `55f25c3e7`:

| row | compiler's own self-compile | distilled corpus |
| --- | --- | --- |
| `globalCellKind` | byte-identical to master's fixpoint | no cell changed class |
| `declaredStructGraph` | byte-identical | not run (see below) |
| `variantSig` | byte-identical | not run |
| `objVariantIndex` | byte-identical | not run |
| `declStructIndex` | byte-identical | not run |
| `buildFnMapResume` | byte-identical | not run |
| `collectAResume` | byte-identical | not run |
| `repKeyMemo` | **cannot be disabled** — the compile exhausts the GC heap | — |
| `repElemMemo` | byte-identical | no cell changed class |
| `repSlotCache` | byte-identical | no cell changed class |
| `repSlotRep` | byte-identical | no cell changed class |
| `repTree` | **cannot be disabled** — the compile exhausts the GC heap | — |
| `structIndexOfObjCtx` | byte-identical | no cell changed class |
| `startBlockLetRow` | byte-identical | no cell changed class |
| `memberSetIntern` | byte-identical | no cell changed class |
| `parentLetCache` | byte-identical | no cell changed class |
| `anonLeafIndex` | byte-identical | no cell changed class |
| `fnChildIndex` | byte-identical | no cell changed class |
| `covarValueWriteState` | byte-identical | no cell changed class |

**Seventeen of nineteen disable edits leave the compiler's own codegen of itself byte-identical
to master's fixpoint**, and the eleven graded against the corpus — the ten `probe` rows that
can be disabled, plus `globalCellKind` — leave it unmoved. `covarValueWriteState` was
additionally graded against all 74 capability-matrix templates — **4,292 cells, 0 moved** —
because it is the one row whose key is a bare `P.nodes.length` and whose value reaches a
checker sidecar written in place.

The six rows with no corpus column are the ones whose verdict is an ARGUMENT
(`no-refined-input`, `resume-reseeds`, and the pass-stamped `declaredStructGraph`); the
self-compile is their measurement, and the argument is the table above.

**`repKeyMemo` and `repTree` are unmeasured by this instrument.** Disabling either exhausts
the GC heap on the compiler's own source — they are performance memos of D1513's class, which
is what the memo was built for — so the disable probe cannot speak about them. Grading them
needs a pass-stamped variant rather than a disabled one; nothing in this PR does that.

### The control, because a silent probe proves nothing

Reverting #2690's two lines (the `gckGenP` compare and its stamp) puts the D1655 defect back;
that compiler grades `matrix/covar-list-delivery.matrix.vl --only return_inferred`'s
un-annotated face **SILENT**. The same probe applied to that source moves the cell to **RUNS**.
The instrument reaches the memo layer and fires when a memo really is stale, so the readings
above are a reading rather than a shrug.

### Two ways this instrument lied before it told the truth

* **`vl build -o /dev/null` validates the file it wrote**, so it always reports
  `unexpected end-of-file (at offset 0x0)` and a bug-in-vl banner. A whole bisect graded every
  memo as breaking the self-compile before the output path was the suspect. Give the build a
  real path.
* **A disable edit must target the memo's READ.** `parentLetCache` has a guard of exactly the
  cache-hit shape inside `plScanStmt` — `if sidArrGet(plSidGen, lsid) != plGen` — that is the
  plan's FIRST-WINS write rule. Inverting it makes the walk last-wins, and the compiler
  miscompiles its own `lint.vl` (`type mismatch: expected i32, found (ref $type)` inside
  `siScanReaders$m5`). That is an answer change wearing a cache-miss costume, and it reads
  exactly like a finding.

## What to do with a new memo

1. Add its stamps to `ROWS` — `--list`, and the test, fail until you do.
2. Give it a verdict. `pass-stamped` if its key reads `emitPassGen`; `no-refined-input` only
   if every table its value reads is push-only; otherwise `probe`.
3. A `probe` row needs a disable edit at the READ, and the per-row run above before it merges.

Reuse `emitPassGen`. A second stamp for the same question is how two answers start
disagreeing, which is the shape D1655 already cost once.
