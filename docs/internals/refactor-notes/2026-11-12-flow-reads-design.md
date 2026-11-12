# Flow-sensitive reads of a `let`: design, 2026-11-12

The owner ruling (DECISIONS.md, "A read of a `let` takes its most recent write's type"): a read
of a `let` takes the type of the most recent write in scope, not the join of all its writes. Its
witnesses are D2660 and D14930. This note says where a write's type is recorded, how a read
finds its most recent write, and how emit gets the per-read type. The build follows as a
position matrix.

## What exists today

**Storage.** A `let` has one storage type. It is fixed by `checkLetDeclNodeIn`
(`check_statements.vl`), as the annotation, or as the initialiser widened by the syntactic write
scans (`elabFnLetTy`, `elabFnListLetTy`, `letLitListsWidenAt`). Emit gives it one local at that
type (`letBindTy`, `letCellKind`).

**The null hole.** `let x = null` binds `mkNullableTy(-1)`. The first non-null write fills its
inner type in place (`nhFillLinked`, `check_relate_core.vl`). Because the fill mutates the one
type every read shares, a read made before the fill becomes `T | null` after the fact. D2660 is
exactly that: the delivery was judged at `null` and built at `i32 | null`.

**Per-read types.** A read of a name takes the live narrowing row over its slot (`declTyOf`,
`check_nar_store.vl`). `noteNarrowedRead` banks the storage type and the read's type per node
(`narrowedFromTyIx`, `narrowedArmTyIx`). Emit reads the local at storage, then converts by the
read's type: `readNarrowedTyAt`, then the unbox, niche and non-null arms of `emitIdentNode`.

**Writes already narrow in two cases.**
- A non-null write to a nullable installs a `NAR_KIND_ASG` shadow, so `let x: i32 | null = v;
  x = 5; const y: i32 = x` runs today.
- A write under a live narrowing re-narrows to the member the value fits (`writeReNarrowTy`).

A write to an un-narrowed union does not narrow: `let x: i32 | string = 1; x = "s"; x.length` is
refused.

**The flow rules are already built.** All of them apply to any narrowing row:
- an `if` joins its arms' rows (`applyArmJoins`, banked for emit by `recordArmJoin`);
- a loop retires, before entry, every row a write in its body leaves (`crLoopPreRetire`);
- a closure reads a captured name at its storage type when the name may be written while the
  closure can run (`crCaptureWiden`, with `crCallbackKeeps` for a callback run in its call).

## The design

**A write's type is a narrowing row.** Every write to a bare `let` name installs a
`NAR_KIND_ASG` row of the written type, met with storage, at the write's depth. This includes the
initialiser, and `let x = null` installs a row of the `null` type. The two existing cases are
the special cases of this: the non-null shadow, and `writeReNarrowTy` without its live-row
condition.

**A read finds its most recent write through the ledger.** It does not rescan:
- **straight line:** the last row wins;
- **after an `if`:** the arms' rows join (`narJoinTys`). A write in one arm joins with the row
  from before the `if`.
- **in a loop:** `crLoopPreRetire` retires the row when the body writes the name, so a read at the
  head takes storage, the join over the back-edge. A write in the body installs a fresh row for
  the reads after it within the iteration.
- **in a closure:** `crCaptureWiden` already widens to storage when the name may be written while
  the closure runs.

**The null hole stops being retroactive for reads.** The read of `x` before `x = 5` takes the
row's `null` type, a closed `TyPrim null`, not the shared hole. So filling the hole no longer
changes what that read was judged at. Storage still takes the filled `T | null`.

This composes with #7576's containment (`judgeNullHoleDeliveries`):
- a read that the loop or the capture rule left at storage still delivers the hole, and is still
  refused once checking ends (p5, p6);
- a straight-line read before the fill delivers `null`, is not recorded, and runs (p1, D2660).

**Emit gets the per-read type from the existing columns.** A read whose row type differs from
storage is banked by `noteNarrowedRead`, and emit converts it. The one new emit arm is a read
narrowed to exactly `null` from a box, or from a nullable ref. It emits the destination's null
(`emitNullAt`) and reads no local. Today no read is narrowed to `null`: a `== null` guard keeps
`i32 | null` (`q1` below). An instance re-check records through `elabCapNarrowNote`, so D14930's
per-instance `[k]` reads the lambda's row.

**Writes stay checked against storage** (`writeStorageTy`, D1736). The rule changes only what a
read is.

## The position matrix

There are three faces:
- a `let x = null` hole;
- an annotated union `let x: i32 | string`;
- a function-valued `let`, as in D14930.

Each face is graded at these positions. Each program prints a value that proves the conversion:

| position | spelling | want |
| --- | --- | --- |
| after a write | `x = w; use(x)` | the read is `w`'s type |
| before a filling write | `use(x); x = w` | the initialiser's type (D2660) |
| after an `if`, one arm writes | `if c { x = w }; use(x)` | the join |
| after an `if`, both arms write | `if c { x = a } else { x = b }; use(x)` | `a ∨ b` |
| loop head, the body writes | `while … { use(x); x = w }` | storage, so a narrower destination is refused |
| loop body after the write | `while … { x = w; use(x) }` | `w`'s type |
| captured, written later | `const f = () => use(x); x = w; f()` | storage, refused if narrower |
| callback run in its call | `xs.map((e) => use(x))` after `x = w` | `w`'s type (`crCallbackKeeps`) |

The order is to build the lowering (the null-read arm), wire every position, and only then
narrow #7576's refusal. Grading: `capability-matrix.vl` over a template per face; the census
includes the inventory witnesses (`sweep.vl record --population inventory`) and the
self-compile.

## Today's baseline (master `dbf4c1d80`, by hand)

| probe | today |
| --- | --- |
| p1, a read before the filling write into `string \| null` | invalid wasm (refused under #7576) |
| p2, an annotated union written `"s"`, then `.length` | check refuses |
| p3, one arm writes, `i32 \| null` destination | runs |
| p4, both arms write `i32` over a `string` initialiser | check refuses |
| p5, loop head read before the write | invalid wasm (refused under #7576, correctly) |
| p6, a capture called after the write | invalid wasm (refused under #7576, correctly) |
| p7, D14930 | runs, via `monoPinListElems` |
| p8, D2660 | invalid wasm (refused under #7576) |
| q1, `if x == null { const y: string \| null = x }` | check refuses: no read narrows to `null` |
| q2, `let x: i32 \| null = v; x = 5; const y: i32 = x` | runs: the existing non-null shadow |

## Ruling on annotated `let`s

The decision draws no line at annotation, so an annotated `let` narrows on a write the same way:
p2 and p4 run (orchestrator ruling, 2026-11-12; DECISIONS.md entry amended). The annotated face
is in the matrix from the first PR.

## PR 1: the `let x = null` face (2026-11-12)

**What changed.**
- The declaration `let x = null` installs an assignment row of the closed `null` type
  (`check_statements.vl`).
- A write's fill reads storage to find its hole. The non-null shadow it installs also updates
  the row, so a row at the declaration's own depth does not mask it (`check_operators.vl`).
- `nullReadHoleTy` (`check_fit_rules.vl`) keeps container element inference as it was: a
  null-narrowed read delivered into an open hole is the binding's hole, so it links (D2506).
  The callers are list literals, `.push`, `.set`, index writes, the fill of an open container
  slot, and `constrainEmptyExpr`, before #7576's `noteNullHoleDelivery`.
- Emit:
  - `emitNullReadAtDst` delivers a `null`-typed read as the destination's null where the
    destination names a rep other than storage. An open-hole destination takes the storage
    read.
  - `emitNulIsNullTest` folds a `null`-typed read.
  - `emitArrI32` stores the `null[]` sentinel for a `null`-typed element (D15950, a
    pre-existing defect this face reaches).

**Matrix** (`null-let-read-before-fill.matrix.vl`, master seed against the candidate):
- 37 of 46 graded cells run; 18 cells moved from SILENT to RUNS, and 0 runs → not-runs.
- The 3 SILENT cells are SILENT before and after: `block_while`, `block_while_capture` and
  `fn_body_capture`, annotated. These are the loop and capture positions where the read is the
  hole. On the merged tree #7576's judgement refuses the loop spelling
  (`error-null-let-read-at-loop-head-before-a-filling-write.vl`).

**By hand:**
- the straight line, D2660, an `if` join, the loop soundness probe (`-1` then `5`) and a bound
  copy run;
- the capture called after the write is refused by the capture re-check;
- the callback-with-a-later-write cell is still invalid wasm, as on master. It is filed as
  D15951.

**Census:**
- inventory witnesses (`sweep.vl record --population inventory`), master against the candidate:
  4,747 of 4,751 the same, 0 runs → not-runs, 0 new traps. D2660 and D1578 (the same program)
  went from compiler trap to runs; D1589 and D2661 are bytes-only movers.
- distilled `regress.vl`: no runs lost.
- cases_wasm: 7,552 passed.
- the self-compile: `refresh-compiler.sh`.

**Fixtures re-graded:**
- #7576's D2660 error fixture becomes the loop-head spelling, which is still refused;
- `inference/null-let-read-takes-its-most-recent-write.vl` and
  `generics/null-pinned-instance-list-literal.vl` are new.

**The annotated face is PR 2.** A write that narrows `let x: i32 | string` would make 11
fixtures fail:
- a later `is` test of another member becomes "can never match", which needs a policy for a
  test that a write made dead;
- `writeReNarrowTy` picks the wrong member for a generic application.
