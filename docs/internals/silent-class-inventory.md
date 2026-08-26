# Silent-class inventory — a measured rebuild of the queue

Every row below was produced by generating a program, running it, and grading the **run
value** against an expectation computed independently of the compiler. Nothing here is
inherited from an earlier filing. Where an earlier filing is contradicted, the
contradiction is stated in "Not a defect".

The sweep is reproducible: `scripts/silent-sweep/gen.py` (main grid), `genorder.py`
(declaration-order grid), `sabotage.py` (grader proof), `sweep.sh` (bounded runner, four
concurrent `vl` invocations), `grade.py` (classifier), `counts.py` / `pivot.py` (tallies).

---

## RE-MEASURED 2026-08-25 — READ THIS BEFORE SCHEDULING FROM ANY ROW BELOW

The whole sweep was regenerated and re-run against master `fb7900e7`, and the grader was
re-validated first (`sabotage.py` → 12 wrong_value / 8 wrong_evalcount / 6 trap / 4
correct, exactly as published). **The queue below is substantially stale, in one
direction: fixed rows still read as live.**

| | as filed | 2026-08-25 | end of 2026-08-25 |
|---|---|---|---|
| check-clean **silently wrong value** | 2 | **0** | **0** |
| check-clean **wrong evaluation count** | 4 | **0** | **0** |
| **compiler trap** (no diagnostic, no module) | 4 | **0** | **0** |
| check-clean **invalid wasm** | 97 | **23** | **0** |
| **SILENT TOTAL** | **107** / 9,345 (1.14%) | **23** / 9,126 (0.25%) | **0** / 9,126 |

The third column is after the day's four fixes (#1921 closure slot reps, #1922 D16, #1924
D7, and D6); the before/after for the last two is the table in "SILENT TOTAL 6 → 0" below.

Declaration-order grid: **0 silent** (was D1's family). The two categories that produce a
WRONG ANSWER rather than a failure are now **zero** — every survivor is invalid wasm, which
is loud at load.

*(Cell counts differ because the generator now skips more unreachable combinations, so this
is not a cell-for-cell delta.)*

**Per-row verdict, from `scripts/check-filed-witnesses.py` — which runs each row's OWN filed
repro rather than a paraphrase:**

| row | filed | today |
|---|---|---|
| D1 D2 D3 D4 D5 D8 D10 D11 | various | **runs — CLOSED** |
| D16 D7 D6 | check-clean invalid wasm | **runs — CLOSED 2026-08-25** (below) |
| D17 D18 | check-clean invalid wasm | **runs — CLOSED 2026-08-25** (below; one root, one change) |
| D14 | loud emit reject | **runs — CLOSED 2026-08-25** (below) |
| D9 | loud emit reject | **runs — CLOSED 2026-08-25** (below; 144 cells, `loud emit reject → correct`, nothing moved the other way) |
| D13 | loud emit reject | **runs — CLOSED 2026-08-25** (below, with the literal-union boundary class) |
| D12 D15 | loud emit reject | **runs — CLOSED 2026-08-25** (below; two roots, not one — grouped only as diagnostic-quality work of the same size) |
| D19 | check-clean invalid wasm (mis-graded; it LOADS then traps) | **runs — CLOSED 2026-08-26** (below, with the scope axis that measured the whole class: 38 silent cells, all module scope) |
| D20 | loud emit reject | **NEW 2026-08-25** — filed while closing D14. Its `capture` leg WAS D9 and is closed; **264 cells remain** at `loopvar` + `mapval`, and the repro is re-filed on `loopvar`. Three legs, three sites — proven by D9's fix reaching exactly one |
| D21 | loud emit reject | **NEW 2026-08-25** — filed while closing D9: the one capture BINDING FORM its fix does not reach (an un-annotated local), 168 of a 728-cell population, flat across every rep |
| D22 D23 D24 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the `nulvariant` CALL-BOUNDARY class. THREE roots at three layers, separated by an ABLATION and not by argument — a missing BOX, a misplaced one failing in the opposite direction at the same seam, and the monomorphizer's pin a whole layer earlier) |
| D25 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the ruling is in `DECISIONS.md`. The row named ONE cell and a 187-cell grid found **53**: neither filed option won — the argument-node channel moved 6 cells loud→silent, the annotation channel left 8. Two rungs, 0 silent) |
| D26 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; NOT the heap-type twin the filing named. `letInitReboxesToVariant` read a VARIANT index through the STRUCT table, and its `< sHeapIdx.length` test was a BOUNDS check standing in for a namespace check — it only ever declined while the struct table was EMPTY. Guard retired; 32 of 240 grid cells moved, all forward, and 1,832 corpus files emit byte-identically) |
| D27 D28 D29 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; ONE root — `fnAssignKindGuard`, a five-entry decline list whose `null` restored the caller's `i32` default. Four of its five recorded reasons were false and the fifth named a condition that was already available. The guard is deleted; 220 cells of three grids moved, every one forward) |
| D30 | check-clean invalid wasm | **NEW 2026-08-26** — filed while closing D27/D28/D29 by the if-arm-join grid that closed them: the CALLER's view of an inferred ref-valued map return, 16 cells the same change could not reach from the callee side |
| D32 | check-clean invalid wasm | **NEW 2026-08-26** — filed while closing D26 by its 240-cell grid: a `Circle[]` whose element is a union MEMBER resolves the list's ELEMENT heap through the struct table whenever a layout twin exists, and ONE `reduce` at a union accumulator mints that twin. 16 cells; needs no import and no generic to reproduce |
| D31 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; filed while closing D25, whose fix routes a corpus control onto it. A call ARGUMENT inherited the enclosing RETURN's nullable expectation — `expCtxHere()` snapshots the ambient seeds and the four nullable ones were never cleared. NO generics anywhere) |

**THE LARGEST REMAINING FAMILY WAS NOT IN THIS DOCUMENT — AND IT IS NOW CLOSED. SILENT
TOTAL 23 → 6.** 17 of the 23 were one unfiled shape, and the note that filed it named it
wrongly: it is NOT a nullable closure. `(i32) => i32 | null` binds the `|` INTO THE RETURN,
so every one of those cells carried a function RETURNING `i32 | null` — the parenthesised
nullable closure `((i32) => i32) | null` narrows and calls correctly at all seven positions
and always did (see §4d, whose 54-cell "probe error" is the loud half of the same spelling).

The real defect was rep invariance at a function SLOT. `v is (i32) => i32` over a
`v: (i32) => (i32 | null)` was gated on `assignable(tested, receiver)`, which accepts by
return covariance; the THEN branch then bound `v` at the unboxed-result type while the value
repped boxed, and the call emitted a `call_indirect` whose `(ref $box)` result met `print`'s
`i32` parameter. A closure carries no runtime type tag, so the narrow could never have been
true in the first place. `fnSlotAssignable` now enforces the invariance its own header had
stated since the numeric pair (`() => i32` must not reach a `() => i64` slot), and the same
rung closed three ASSIGNMENT-side twins that were `vl check`-clean `indirect call type
mismatch` traps: a named `(i32) => i32` into a `(i32) => (i32 | null)` parameter, the
`string` / `string | null` pair, and `(i32) => K0` into `(i32) => string`.

Measured before/after on the same 322 closure cells, same harness: silent 17 → 0, `correct`
unchanged at 43. The surviving 6 are D6 (4 cells, numeric-litunion map value at `mapget`)
and D7's family (2). **D7 IS NOW CLOSED TOO — SILENT TOTAL 6 → 4**, re-measured on the same
9,126 + 219 cells with the grader re-validated first: main grid `correct` 6,897 /
invalid_wasm 4, order grid 0 silent, and the 4 are exactly D6's `rep=numlit pos=mapget`
cells (c08730-c08733). D7's own two cells (c08570 / c08571) grade `correct` with the
evaluation-count oracle at 1. Pins: `tests/cases/closures/error-is-functype-slot-rep-reject.vl`,
`error-fn-slot-rep-differs-reject.vl`, and — for the shape the cells were aimed at —
`nullable-closure-is-narrow-positions.vl`.

## SILENT TOTAL 6 → 0 (2026-08-25, D7 and D6 closed)

**THE SWEEP IS AT ZERO.** Every run below is the same 9,126 cells and the same harness; the
grader was re-validated against the final compiler first (`sabotage.py` → 12 wrong_value /
8 wrong_evalcount / 6 trap / 4 correct, exactly as published).

| | `c31e9fae` | D6 alone | merged (D7 #1924 + D6) | + D14 |
|---|---|---|---|---|
| correct | 6,895 | 6,907 | **6,909** | **7,083** |
| check-clean invalid wasm | 6 | 2 | **0** | **0** |
| loud check reject | 1,199 | 1,199 | 1,199 | 1,199 |
| loud emit reject | 1,026 | 1,018 | **1,018** | **844** |
| **SILENT TOTAL** | **6** | **2** | **0** | **0** |

The `+ D14` column is a real re-run of the same 9,126 cells on the closing branch, with its
own baseline re-run on the same tree (which reproduced the `merged` column exactly). Cell for
cell, **174 cells moved, every one `loud_emit_reject → correct`, all of them `list_f32`** —
see D14 below.

Cell-by-cell against `c31e9fae`, **14 cells moved and every one of them improved** — 6
`invalid_wasm → correct` and 8 `loud_emit_reject → correct`. Nothing moved the other way,
in either change:

| cells | rep · position · construct | was | now |
|---|---|---|---|
| `c08570` `c08571` | `string` · `elem_place` · `??` | invalid wasm | correct (D7) |
| `c08730`–`c08733` | `numlit` · `mapget` · `!= null` / `== null`-else | invalid wasm | correct (D6) |
| `c08734` `c08735` `c08738` `c08739` | `numlit` · `mapget` · `is` / `??` | loud emit reject | correct (D6) |
| `c02568` `c02569` `c02572` `c02573` | `numlit` · `mapval` · `is` / `??` | loud emit reject | correct (D6) |

The two changes are disjoint in both the cells they move and the files they touch (D7 is
`wasmEmit.vl`'s list-index `??`; D6 is `emit_classify.vl` / `emit_collect.vl`'s map read),
and the merged run is a real re-run on the rebased tree rather than an addition of two
deltas.

**A WARNING ABOUT MEASURING THE BASELINE — IT COST TWO WRONG SWEEPS IN ONE SESSION.** The
host caches a compiled seed as `build/vl-compiler.wasm.<hash>.cwasm` NEXT TO the seed, and
**a SYMLINKED seed is not re-keyed when you retarget the link**: point the symlink at a
different seed and the run silently reuses the cached module for the previous target.
Proven both ways — with the symlink moved to the OLD seed and the NEW seed's `.cwasm` still
present the sweep behaved as the new compiler; `rm` the `.cwasm` files and the identical
setup behaved as the old one.

**THE PRECONDITION IS THE SYMLINK, and the original wording here omitted it — re-measured
2026-08-25 because an unconditional claim would make every `cp`-based A/B look untrustworthy.**
Overwriting a real FILE re-keys correctly, both at an arbitrary path and at
`build/vl-compiler.wasm` itself: `cp <old-seed> build/vl-compiler.wasm` then re-running the
D6 repro reproduces the defect, and copying the fixed seed back makes it pass again, with no
`rm` of any `.cwasm`. Retargeting a SYMLINK over the same two seeds keeps answering as the
first target. So `cp` is safe and `ln -sfn` is not — which is worth knowing precisely,
because the safe method is the cheaper one.

Both failures were quiet and both looked like results. The first "before" sweep reported
SILENT 2 — *no change at all* — and the first post-rebase "after" sweep reported SILENT 6,
i.e. the change had vanished. Each is a plausible number; neither is a crash. **Run each
side from a SEPARATE root with its own `build/` holding a real COPY of that seed**, and
sanity-probe one known cell (`runcell.sh` on the cell the fix targets) before spending
twenty minutes on 9,126.

**Do not re-derive this by hand.** `python3 scripts/check-filed-witnesses.py <doc>` runs
every filed repro and prints which have moved; it exits non-zero when any row no longer
behaves as filed. Prose cannot be re-run — that is why eight rows sat here as live work
after they were fixed.

---

## THE SCOPE AXIS (2026-08-26) — module scope was an unmeasured storage class, and it held 38 silent cells

**The whole grid had only ever executed inside a function.** `ALIAS_POSITIONS` carried a
`global` entry, so the grid varied where a binding SITS; the reading statements were always
wrapped in `function reader() { … }` and called. Two independent rows pointed at that gap
from opposite directions — D19 (a module-scope map miss that TRAPS, where the identical seven
lines inside a function print `1` / `absent`) and D20's residual (a module-scope list-valued
map read that is loud, and loud for its NON-nullable control too). Neither is a nullability
finding; both turn on the storage class of the executing body.

`gen.py` now takes a `--scopes` axis crossed with rep × nullability × position × construct ×
runtime input. `scope=fn` emits exactly what it always did; `scope=mod` emits the same
statements at module top level, with no enclosing function and no call.

**THE PAIRED RESULT, which is the only number that answers the question.** A module-scope
grid's absolute silent count means nothing on its own, because its population is not the
function-scope one. `scripts/silent-sweep/pairscope.py` compares the SAME
(leg, rep, nul, pos, con, read, inp, spell) coordinate at both scopes, so exactly one thing
differs between a cell and its control:

| | `scope=fn` | `scope=mod` |
|---|---|---|
| correct | 7,219 | 6,863 |
| **SILENT** | **0** | **38** |
| loud check reject | 1,147 | 1,147 |
| loud emit reject | 184 | 502 |

8,550 paired coordinates (17,100 cells) + 780 coordinates that exist only at `scope=fn`.
**All 780 skips are `pos=param`** — a parameter needs a function to be a parameter of, the one
structurally unrepresentable combination. The skip is recorded in the manifest and printed by
the generator; nothing else in the cross product is dropped. `pos=capture` IS generated at
module scope and is a real program, but its captured binding is then a global, so it re-covers
`global`'s storage class rather than adding one.

**All 38 silent cells were the same defect**: `pos ∈ {mapget, mapval_miss}`, `inp=1` (a
MISSING key), message `wasm trap: null reference`, function-scope twin `correct` in every
case. That is D19, and the seven reps it spans are exactly the ones whose map value reps as
the shared `{tag, payload}` union box. Closed by the arm named in D19's row; the grid re-run
on the fixed compiler moves **38 cells, every one `trap → correct`, zero in the other
direction, `correct → not-correct` zero**.

**A COVERAGE HOLE THE AXIS EXPOSED, worth more than the axis's own finding.** `mapval` only
ever read a key it had just STORED, so a declared-nullable map value was never once read at a
MISSING key by this grid — D19's own coordinate was not in the population that reported 0
silent. The new `mapval_miss` position adds it (204 cells at `scope=fn`), and 31 of the 38
silent cells live there. A grid can report zero because the defect is absent or because the
coordinate is; only reading the generator tells you which.

**THE 322 THAT WENT LOUD, and why they were NOT fixed here.** 322 paired coordinates are
`correct` at function scope and `loud_emit_reject` at module scope — 164 `bare null needs a
struct-typed context` and 110 `` `is` test but no union type declared ``, concentrated in the
list family (`mapval` 158, `mapget` 56, `field` 24, `elem` 24, `ret_unann` 12). That is D20's
residual, already filed, already named down to the rung (`exprNulScalarListKind` /
`exprNullableList` / `exprNullableRefArray` carry no `mapReadMvSlot` arm for value kind 6),
and already argued as deliberately not-widened because closing it changes NON-nullable
behaviour too. This measurement raises its size from the 12 coordinates its own 2×2 saw to
322 and leaves the ruling alone. Mixing it into a silent-class fix is the exact shape of
widening that has twice turned a loud reject into a silent one in this programme.

**Grader re-validated first, against the compiler actually being measured with**, both before
and after the fix: `sabotage.py` → **12 wrong_value / 8 wrong_evalcount / 6 trap / 4
correct**, exactly as published. A zero in a silent column is worth nothing until that column
has been made to fire on demand.

    python3 scripts/silent-sweep/gen.py       <cells>            # --scopes fn,mod (default)
    bash    scripts/silent-sweep/sweep.sh     <cells> <res>      # still xargs -P4
    python3 scripts/silent-sweep/grade.py     <cells> <res> --csv scope.csv
    python3 scripts/silent-sweep/pairscope.py scope.csv

---

## 0. What was measured

| | |
|---|---|
| cells generated and run | **9,345** |
| result files | **9,345** (asserted `records == cells` on every run) |
| `vl` invocations per cell | 2 (`check` + `run`), plus a third (`build`) only when the run stage failed |
| concurrency | 4, never more |
| runtime inputs per cell | **2 — every cell** (a present value, and `null` or a non-matching variant) |
| evaluation-count oracle | a module-scope counter incremented in the producer, printed as the last line of **every** cell |

The producer is called exactly once by construction in every cell, so the trailing count
line is a hard oracle: any cell printing anything but `1` is a failing cell whatever its
values say.

### The outcome columns, kept strictly separate

| column | cells | / 9,345 |
|---|---|---|
| correct | 6,499 | 69.5% |
| **check-clean SILENTLY WRONG VALUE** | **2** | |
| **check-clean WRONG EVALUATION COUNT** | **4** | |
| **check-clean INVALID WASM** | **97** | |
| **TRAP (emitted program)** | **0** | |
| **COMPILER TRAP (check-clean, no diagnostic at all)** | **4** | |
| loud check reject | 1,361 | |
| loud emit reject | 1,378 | |
| hint-only rc 1 | 0 | |
| other runtime failure | 0 | |
| **SILENT TOTAL** | **107** | 1.14% |

`compiler_trap` is split out from `trap` because they are not the same event: a trap with
**no module written** is the compiler's own `array.get` going out of bounds while emitting,
which produces no diagnostic and no artefact. Merging it with a program trap would hide the
worse one. The split is measured, not guessed — the third `vl build` stage records the
output module's size.

`hint-only rc 1` is zero because on this tip `vl check` exits **0** on a file whose only
diagnostics are `[HINT]` / `[WARNING]` (measured: a `redundant type annotation` hint and an
`Unused variable` warning together still give rc 0, and `vl run` neither prints them nor
fails). The classifier keys on the presence of an `[ERROR]` line rather than on rc, so the
column exists and would fire; it simply never did.

## 1. Grid totals per axis

### By representation (all legs)

| rep | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| boolean | 567 | 534 | **1** | 10 | 22 |
| string | 601 | 545 | 2 | 32 | 22 |
| i32 | 573 | 406 | **16** | 99 | 52 |
| i64 | 573 | 406 | **16** | 99 | 52 |
| f64 | 573 | 406 | **16** | 99 | 52 |
| f32 | 567 | 398 | **16** | 101 | 52 |
| namedlit | 573 | 509 | **2** | 40 | 22 |
| inlinelit | 558 | 460 | 0 | 40 | 58 |
| numlit | 573 | 384 | **26** | 125 | 38 |
| vubox (`string \| i32`) | 320 | 268 | 0 | 26 | 26 |
| structunion | 324 | 52 | 0 | 108 | 164 |
| struct | 359 | 296 | 0 | 27 | 36 |
| list_i32 | 377 | 301 | 0 | 50 | 26 |
| list_str | 377 | 253 | 0 | 50 | 74 |
| list_f64 | 355 | 253 | 0 | 28 | 74 |
| list_i64 | 340 | 244 | 0 | 24 | 72 |
| list_f32 | 340 | 76 -> **250** | 0 | 24 | 240 -> **72** |   *(D14, closed 2026-08-25; re-measured baseline on the closing branch was 76 / 0 / 18 / 246)*
| list_ref | 365 | 218 | 0 | 53 | 94 |
| closure | 331 | 31 | 0 | 252 | 48 |
| map_str | 371 | 257 | **4** | 50 | 60 |
| map_i32 | 328 | 202 | **8** | 24 | 94 |

### By position (all legs)

| position | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| **capture** | 780 | 312 | **90** | 75 | 303 |
| const_local | 892 | 744 | 4 | 75 | 69 |
| let_local | 456 | 374 | 0 | 41 | 41 |
| param | 780 | 642 | 0 | 75 | 63 |
| ret_unann | 456 | 374 | 0 | 41 | 41 |
| ret_ann | 780 | 642 | 0 | 75 | 63 |
| global | 780 | 640 | 0 | 75 | 65 |
| field | 870 | 560 | **3** | 252 | 55 |
| elem | 822 | 663 | 0 | 80 | 79 |
| mapval | 822 | 460 | 0 | 131 | 231 |
| loopvar | 780 | 470 | 0 | 79 | 231 |
| callres | 266 | 228 | **4** | 16 | 18 |
| field_place | 204 | 140 | 0 | 25 | 39 |
| elem_place | 204 | 42 | **2** | 150 | 10 |
| mapval_place | 204 | 54 | 0 | 150 | 0 |
| mapget | 204 | 112 | **4** | 18 | 70 |
| bare | 45 | 42 | 0 | 3 | 0 |

**`capture` holds 90 of the 107 silent cells (84%) on 8.3% of the population.** That is the
single strongest signal in the sweep.

### By construct

| construct | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| nenull (`if x != null`) | 1,442 | 978 | **36** | 168 | 260 |
| eqnull_else (`if x == null … else`) | 1,386 | 932 | **32** | 168 | 254 |
| is_t (`if x is T`) | 1,848 | 1,312 | **8** | 224 | 304 |
| match_null | 630 | 340 | 0 | 178 | 112 |
| andguard (`x != null && …`) | 198 | 188 | **10** | 0 | 0 |
| while_g (`while x != null && …`) | 462 | 348 | **10** | 22 | 82 |
| coalesce (`x ?? d`) | 828 | 546 | **2** | 18 | 262 |
| printdirect | 828 | 462 | 0 | 358 | 8 |
| eqnullcmp (`x == null`) | 504 | 439 | 0 | 23 | 42 |
| optchain (`const t = x?.p`) | 132 | **0** | 0 | 110 | 22 |
| direct | 652 | 588 | **6** | 42 | 16 |
| eqcmp | 216 | 208 | 0 | 2 | 6 |
| fwd (alias declared after its user) | 45 | **12** | **3** | 30 | 0 |
| ord (alias declared before its user) | 174 | 146 | 0 | 18 | 10 |

**Every silent cell in a narrowing construct is in a `null`-COMPARISON form**
(`!= null`, `== null`-else, `&&`-guard, `while`-guard). `is` contributes 8, all of them the
numeric-litunion box, and `match` contributes none. That is the shared root of §3.

### By runtime input, and by nullability

| axis | cells | correct | silent |
|---|---|---|---|
| input 0 (present value / matching variant) | 4,709 | 3,275 | 55 |
| input 1 (`null` / other variant) | 4,636 | 3,224 | 52 |
| plain (non-nullable) | 1,835 | 1,435 | 10 |
| nullable | 7,510 | 5,064 | 97 |

Both runtime inputs carry silent cells in near-equal share, which is the argument for the
requirement: **a one-input probe of this population would have found roughly half of it,
and would not have known which half it missed.**

## 2. Ranked live defects

Ranked silent-before-loud; within silent, wrong value → wrong evaluation count → invalid
wasm → trap; within a class, flat-across-many-reps before single-rep.

---

### D1 — [CLOSED 2026-08-25] a struct field whose type is an alias declared LATER in the file resolves to the wrong rep
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean SILENTLY WRONG VALUE · 2 cells + 1 invalid wasm + 30 loud check rejects, of 45 in the `fwd` leg (12 correct)**

Repro (`boolean` payload — prints `1`, must print `true`):

    type Wrap = { f: Flag }
    type Flag = boolean
    const w: Wrap = { f: true }
    print(w.f)
    // vl check: rc 0, no diagnostic.  Output: 1        <- WRONG
    // with `{ f: false }` the output is 0

Control (the same program with the two declarations swapped — prints `true`):

    type Flag2 = boolean
    type Wrap2 = { f: Flag2 }
    const w: Wrap2 = { f: true }
    print(w.f)

Second silent spelling (litunion payload — prints the raw interned atom id `0`, must print
`p`):

    type Kc = "p" | "q"
    type WrapKc = { f: Kd }
    type Kd = Kc | null
    function body() {
      const w: WrapKc = { f: "p" }
      const v = w.f
      if v != null { print(v) } else { print("NUL") }
    }
    body()
    // vl check: rc 0.  Output: 0                       <- WRONG (control prints `p`)

Third spelling, same axis, worse verdict — **check-clean INVALID WASM**:

    type K = "p" | "q"
    type WrapK = { f: K2 }
    type K2 = K
    const w: WrapK = { f: "p" }
    print(w.f)
    // vl check rc 0; module written (763 bytes); engine rejects it

Fourth spelling, a **bogus diagnostic** on a legal program:

    type WrapCh = { f: Ch1 }
    type Ch1 = Ch2
    type Ch2 = boolean
    const w: WrapCh = { f: true }
    print(w.f)
    // [ERROR]: Type `Ch1` is `never` (an empty type — its operands have no common
    //          values), so it has no values

* **Triggered by**: input 0 (the present value). The `null` input takes the else arm and is
  correct, which is why a null-only probe of this shape reads clean.
* **Flat on**: the declaration-order axis — every `fwd` cell of a print-classified payload
  is wrong, every `ord` control is right.
* **Varies on**: the payload rep. `boolean` → wrong value (`1`/`0`); a litunion → wrong
  value (the atom id) or invalid wasm; `i32`, `i64`, `f64`, `f32`, `string`, a struct
  alias, a nested struct → **correct**, because their print IS the default classification.
* **Narrower than it looks, and the narrowing is the diagnosis**: the stored VALUE is
  right. `print(w.f) == true` prints `true` and `if w.f { … }` takes the right branch
  (measured) — only `print` of the field is wrong. So this is a *print-classifier* lookup
  against a table the forward reference has not populated, not a storage bug.
* **Reach**: the struct-FIELD container only. A forward alias as a list element, a map
  value, a bare binding, a param, or a return type is correct (all measured).
* **One root or several**: one. All four spellings are the same forward reference; the four
  different symptoms are four different consumers of the unresolved field type.

---

### D2 — [CLOSED 2026-08-25] `for x in <expr>.keys()` / `.values()` evaluates `<expr>` TWICE, and iterates the SECOND result
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean WRONG EVALUATION COUNT · 4 cells of 4 reachable in the grid; confirmed on 8 further hand-written receivers**

Repro:

    let nCalls = 0
    function mk(): {[string]: i32} {
      nCalls = nCalls + 1
      const m: {[string]: i32} = Map()
      m["k"] = nCalls
      return m
    }
    for v in mk().values() { print(v) }
    print(nCalls)
    // vl check rc 0.  Output:  2 / 2      <- the value printed is from the SECOND map,
    //                                       and the count is 2, not 1

Control (bind the receiver first — one call, and the first map is the one iterated):

    const b = mk()
    for v in b.values() { print(v) }
    print(nCalls)
    // Output: 1 / 1

* **Triggered by**: both runtime inputs equally — this is not a null-dependent path.
* **Flat on**: the key rep (`{[string]: i32}` and `{[i32]: string}` both double); the
  method (`.keys()` and `.values()` both double); the receiver's shape — a call
  (`mk()`), a field of a call (`mk().m`), a call of a call (`idf(mk())`) all double; module
  scope and inside a function both double.
* **Varies on**: whether the receiver is a *place*. A local, a global and a parameter are
  each evaluated once. So the defect is "the receiver EXPRESSION is emitted twice", and a
  place is idempotent by luck rather than by design.
* **Not** `.size`, **not** `m["k"]`, **not** a plain list `for-in`, **not** `.slice`,
  **not** `.map`, **not** `.filter` — all measured at exactly one call.
* **Why this is worse than a doubled side effect**: `G4_identity` above shows the loop body
  reads the SECOND object. Any receiver whose two evaluations differ — a counter, a fresh
  `Map()`, a mutating builder, an allocation — iterates something the program never
  produced. This is one step from a silently-wrong value, and it is value-correct and
  check-clean today for exactly the reason #1441 was: the sibling receivers in the corpus
  have no side effect.
* **One root**: one — the for-in iterable lowering for the `keys`/`values` view emits its
  receiver once to obtain the view and once more to obtain the length/backing.

---

### D3 — [CLOSED 2026-08-25] a nullable SCALAR BOX captured by a nested function, narrowed with a `null` COMPARISON, emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 86 cells, the largest silent family**

Repro:

    function body(p: i32 | null) {
      function inner() { if p != null { print(p) } else { print("N") } }
      inner()
    }
    body(7)
    body(null)
    // vl check: rc 0, "Checked 1 file, no errors."
    // vl run:   Invalid input WebAssembly code at offset 370:
    //           type mismatch: expected i32, found (ref $type)   [in function `inner`]
    // wasm-tools validate agrees: "func 6 failed to validate"

Control (the identical read, not captured — correct on both inputs):

    function body(p: i32 | null) {
      if p != null { print(p) } else { print("N") }
    }
    body(7)
    body(null)

Second control (the same capture with a niche payload instead of a box — correct):

    function body(p: string | null) {
      function inner() { if p != null { print(p) } else { print("N") } }
      inner()
    }

* **Triggered by**: both inputs — the module fails to validate, so neither input runs.
* **Flat on**: five payload reps (`i32 | null`, `i64 | null`, `f64 | null`, `f32 | null`,
  `(1 | 2) | null`), 16 cells each except the numeric litunion at 22; the inline and the
  declared-ALIAS spelling of the nullable both; a named nested function and a `=>` lambda
  both; one and two levels of nesting both.
* **Varies on the NARROWING FORM, and this is the whole finding**:

  | narrow form at a capture | verdict |
  |---|---|
  | `if p != null` | **check-clean INVALID WASM** |
  | `if p == null { … } else` | **check-clean INVALID WASM** |
  | `p != null && p == 7` | **check-clean INVALID WASM** |
  | `while p != null && …` | **check-clean INVALID WASM** |
  | `if p is i32` | loud: `emitProgram: narrowed union binding is not a local or global` |
  | `match p { null => … _ => … }` | loud: same |
  | `p ?? 0` | loud: same |
  | `print(p == null)` (no narrowing) | correct |

* **The complete capture-position map over all eleven nullable niches** (nullable leg, 780
  cells at this position):

  | payload | capture verdict |
  |---|---|
  | `string \| null` (nulstr) | correct (38/38) |
  | `boolean \| null` (nulbool) | correct (38/38) |
  | `S \| null` (nulstruct) | correct (24/26) |
  | `i32[] \| null` (nullist) | correct (24/26) |
  | `string[] \| null` (nulstrlist) | loud emit — `bare null needs a struct-typed context` |
  | `f64[] \| null` (nulf64list) | loud emit — same |
  | `i64[] \| null` (nuli64list) | loud emit — same |
  | `f32[] \| null` (nulf32list) | loud emit — same |
  | `S[] \| null` (nulreflist) | loud emit — `ref valtype with no interned shape` |
  | `((i32) => i32) \| null` (nulclosure) | loud emit — `bare null needs a struct-typed context` |
  | `{[string]: i32} \| null` (nulmap) | loud emit — same |
  | `i32/i64/f64/f32 \| null` (scalar BOX) | **check-clean INVALID WASM** |
  | `(1 \| 2) \| null` (numeric-litunion box) | **check-clean INVALID WASM** |
  | `(string \| i32) \| null` (value-union box) | loud emit — `narrowed union binding is not a local or global` |

* **One root**: one, and the source says so in the wrong direction. `emitUnionBoxPush`
  (`compiler/wasmEmit.vl:3123`) carries the floor and a comment asserting *"a clean reject,
  **not invalid wasm**"*. That assertion holds only for the readers that route through
  `emitUnionBoxPush` — `is`, `match`, `??`. A `null`-comparison narrow of a nullable scalar
  box reaches the read through a different classifier that never asks, so it emits an
  unboxed i32 read against a `(ref $type)` slot. **The floor exists and four of its seven
  callers do not stand on it.** The `(string | i32)` box is loud because its narrowed read
  DOES route through `emitUnionBoxPush` in every form.

---

### D4 — [CLOSED 2026-08-25] a map captured by a closure TRAPS INSIDE THE COMPILER — **FIXED, and the filed axis was wrong**
**CLOSED 2026-08-25 — the repro now RUNS. Was: COMPILER TRAP · 4 cells · check-clean, no diagnostic, no module**

**RESOLVED.** The axis filed below as "the map's KEY rep only" is the map's **VALUE** type.
Measured over 220 cells (11 value types × 2 keys × 4 capture routes + an uncaptured control ×
2 runtime inputs): the KEY is FLAT — 48 string-keyed and 48 i32-keyed cells trapped — while
the VALUE decides. `string`, `f64`, `i32[]`, `string | null`, `i32 | null` and `f64 | null`
trapped; `i32`, `boolean`, `boolean | null`, a litunion and a struct value did not. The
mechanism is why: `mapAnnShape` answers the MONO sentinel (`-1` string-keyed, `-4` i32-keyed)
for an `i32`/`boolean` value, and those were already declined by `sFieldIndex`'s `si < 0` arm;
only a value needing its own `$mapStruct` produces a nonnegative `mv` SLOT, and that slot was
returned where a STRUCT TABLE row was expected (`capturedStructIndex` →
`captureValStructIdx`, whose companion index is polymorphic in the capture's kind). Both
controls below still hold; the second one ("an i32-keyed map read WITHOUT the capture") is the
real discriminator, not the first.

The nearby loud floor named at the bottom of this entry is NOT the mechanism either: the trap
is an index-space confusion in the classifier, not the i32-key emit floor being reached late.
The 220-cell grid now reads 220 correct, and the fix also cleared 48 cells that this sweep had
recorded as check-clean INVALID WASM in the same population (`mapShapeOfExpr`'s captured-map
arm covered only the `LetDecl` binding, so a captured map PARAM read the mono shape against a
typed env field). Pinned by `tests/cases/closures/capture-map-i32-key-typed-value.vl` (this
entry's own program) and `tests/cases/closures/capture-map-typed-value-shape.vl`.

Repro:

    function mk(): {[i32]: string} {
      const m: {[i32]: string} = Map()
      m[1] = "x"
      return m
    }
    function body(m: {[i32]: string}) {
      function inner() { print(m.size) }
      inner()
    }
    body(mk())
    // vl check: "Checked 1 file, no errors."
    // vl run / vl build:  wasm trap: out of bounds array access
    //                     note: an index outside the bounds of an array.
    // No module is written.  The backtrace is 13 frames of the COMPILER's own wasm
    // (function 1416 .. 2794), not the program's.

Control (a string-keyed map in the same shape — correct):

    function body(m: {[string]: i32}) {
      function inner2() { print(m.size) }
      inner2()
    }

Second control (an i32-keyed map read WITHOUT the capture — correct).

* **Triggered by**: both inputs; there is no runtime, so the input is irrelevant.
* **Flat on**: the capture being a parameter or a local (both trap); the capture ROUTE (a
  nested `function`, an arrow lambda, a lambda passed as an argument, two levels deep — all
  four trap, 24 of 44 cells each); and the map's KEY (48 traps each spelling).
* ~~**Varies on**: the map's KEY rep only. String-keyed is clean at the same position.~~
  **WRONG — see the RESOLVED note at the top of this entry.** Varies on the map's VALUE type.
* **Why it ranks above the remaining invalid-wasm rows**: it is the only outcome in the
  whole sweep with **no diagnostic of any kind** — not a reject, not a bad module, just an
  out-of-bounds `array.get` in the compiler. Everything else at least produces a message or
  an artefact a reader can inspect. There is a nearby loud floor for this rep
  (`emitProgram: an i32-keyed Map/Set is supported as a binding / parameter / return /
  '| null' / an ARRAY element…`, 34 cells elsewhere in the sweep) — the capture storage
  class simply reaches an indexed table before that floor is consulted.

---

### D5 — [CLOSED 2026-08-25] a NARROWED nullable map iterated by `.values()` / `.keys()` emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 4 cells**

Repro:

    function mk(): {[string]: i32} | null {
      const m: {[string]: i32} = Map()
      m["k"] = 5
      return m
    }
    function body() {
      const v: {[string]: i32} | null = mk()
      if v != null { for z in v.values() { print(z) } } else { print("N") }
    }
    body()
    // vl check rc 0; module written (2030 bytes); engine rejects it

Control (`.size` on the same narrowed binding — correct):

    if v != null { print(v.size) } else { print("N") }

Second control (the non-nullable map, same loop — correct).

* **Triggered by**: input 0. The `null` input takes the else arm; but the module fails to
  validate, so neither input produces output.
* **Flat on**: `.values()` and `.keys()` both (2030 / 2060 bytes); both key reps.
* **Varies on**: the narrowing. The un-narrowed non-nullable map is fine.
* **Shares a root with D2** (see §3): both are the map view's for-in lowering failing to
  read the receiver through the recovered non-null temp.

---

### D6 — [CLOSED 2026-08-25] a NUMERIC-LITUNION map value, read by index and narrowed, emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 4 cells of 12 in the `mapget` × numlit grid**

Repro:

    type N2 = 1 | 2
    function body() {
      const m: {[string]: N2} = Map()
      m["k"] = 1
      const v = m["k"]
      if v != null { print(v) } else { print("N") }
    }
    body()
    // vl check rc 0; module written (1996 bytes); engine rejects with
    //   type mismatch: expected (ref null $type), found i32

Controls (both correct): the string-litunion value type `{[string]: K}`; and the
DECLARED-nullable value type `{[string]: N2 | null}`.

* **Triggered by**: both inputs (present key and missing key) — validation fails first.
* **Flat on**: the `!= null` and `== null`-else narrow forms.
* **Varies on**: the value rep. `i32`/`i64`/`f64`/`f32` value types give a LOUD reject at
  the identical position (D11 below); the numeric litunion is the one that gets a bad
  module instead.

CLOSED BY THE ROOT-E CORRECTION §3 ALREADY NAMED, taken one step further than the row did.
Two rungs, and neither is new machinery:

1. `mapReadScalarBoxKind*` EXCLUDED the numeric litunion, on the claim — written into both
   twins' headers — that a nullable numeric litunion rides the `-1` sentinel the way
   `K | null` does. It does not: the `-1` niche is the STRING litunion's, because a string
   litunion's rep is an interned atom ID and every negative is spare, while a numeric
   litunion's rep is THE NUMBER (#1866) and no bit pattern is spare at all.
   `nulNumLitUnionBaseName`'s own header states the true rule — `1 | 2 | null` reps as
   `<base> | null`, WHICH IS THE VALUE-UNION BOX — and the disassembly of an `N | null`
   param agrees. So the read takes #1901's conditional box at the base scalar's atom.
2. `synthNullableAnn` then handed the RECORDED type over under a spelling that does not
   denote it: `tyToEmitName` renders the REP, so `N2 | null` renders `i32|null`. The
   annotation node's row was therefore unmatchable by `unRowOfCanon`, `letUnionNameOf`
   answered "" for a binding whose union NAME was registered, and the narrowed read skipped
   its unbox. A SOURCE `const v: N2 | null` never hit this because CANON rewrites that
   spelling and rebanks the row in the same move.

**THE ROW UNDERSTATED THE SEVERITY, and the understatement was in the filed program.** With
the binding ANNOTATED — `const v: N2 | null = m[k]` — the same map compiled and RAN, and a
MISSING key printed `0`: `emitMapGet`'s "rep's empty value" boxed under the PRESENT tag.
That is #1899's silent wrong answer, in the value rep #1901 excluded, and it is check-clean
and runs. Now `N`. Pins: `tests/cases/maps/numlit-value-read-narrow.vl`,
`numlit-value-annotated-miss.vl`, `numlit-value-read-shapes.vl`.

---

### D7 — [CLOSED 2026-08-25] `xs[0] ?? d` over a nullable-ELEMENT list emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 2 cells · already documented as a residue, still live**

Repro:

    function body() {
      const xs: (string | null)[] = ["aa", null]
      print(xs[0] ?? "DD")
    }
    body()
    // vl check rc 0; module written (1042 bytes); engine rejects with
    //   type mismatch: expected (ref $type), found (ref null $type)

Control (bind the element, then coalesce — correct on both elements):

    const a = xs[0]
    print(a ?? "DD")

Second control: `??` on a map index get (`m["k"] ?? "DD"`) — correct.

* This is the cell `per-rep-ladder-audit.md` C4 already names: *"`??` over a LIST index …
  check-clean INVALID WASM for the `(string | null)[]` control (1 cell), which is the worse
  verdict and is pre-existing."* Re-measured here at 2 cells (both inputs) and unchanged.
  Recorded so it is not re-derived a third time.

**THIS ROW AND `soundness/xfail-miscompile-nulstr-list-coalesce.vl` WERE ONE DEFECT** —
same program, same disassembly, filed twice under two names, cross-linked in #1923 before
either was fixed precisely so that closing it could not leave half the queue reading as
live. **BOTH HALVES ARE CLOSED**: this row is re-graded above, and the fixture graduated to
`tests/cases/lists/nullable-elem-list-coalesce.vl` (`@run` + `@log`). The mechanism the
fixture carried, kept here because it is what the fix had to remove:

    (if (result (ref $str))                   ;; the NON-NULL type `??` promises
      (ref.is_null (array.get $back …))       ;; the null test, on a re-read
      (then (global.get $default))            ;; already non-null — fine
      (else (array.get $back …)))             ;; THE SAME READ AGAIN, still (ref null $str)

The backing of a `(string | null)[]` is `(array (mut (ref null $str)))`, so the ELSE arm's
`array.get` yielded the nullable reference into a slot declared non-null. Every other `??`
sink narrowed at this seam; the list-index arm re-read and handed the raw nullable through.
The `then` arm was fine, which is why the shape surfaced at validation rather than at
execution.

**THE FIX, and why it is one fix for two defects.** Every other lhs of this rep narrows on
that re-read — an ident / struct-field read recovers itself once `rawNullRead` is cleared —
but a LIST INDEX cannot: the element legitimately holds null, so `xs[i]`'s `array.get` must
stay `(ref null $str)` under EVERY context and a recovering read arm would trap on the very
value `??` exists to answer for. **The re-read was also a SECOND EVALUATION of the index**,
which the invalid module hid: built with `--no-validate`, `xs[f()] ?? d` disassembles to two
`call $f`. Narrowing the else arm would have closed the first and left the second, so the
arm now takes the `br_on_non_null` block every OTHER nullable-ref niche already used
(`emitCoalesceNulRefCtx`, factored out of `emitCoalesceNulRef`): the place is evaluated ONCE
and the narrow IS the branch, so there is no value arm left to get wrong. Measured after:
both cells `correct`, eval-count oracle 1, and `xs[f()] ?? d` prints one tick.

* **Byte-identical after the fix**: the map-index control, the non-nullable-element list, and
  every non-`string`-rep cell of the grid (`boolean | null`, `K | null`, `S | null`,
  `i32[] | null` elements). The bind-first control is NOT byte-identical — it shares this
  lowering, so it lost its own re-read too (2102 → 2096 bytes) — and it answers the same.
* **NOT closed by this, and not this defect**: `(i32 | null)[]`, `(f64 | null)[]` and a
  nullable-CLOSURE element at the same position are a LOUD emit reject
  (``emitProgram: `??` is only supported on a map index get``) — the boxed value union and
  the closure have no INDEX arm in `emitCoalesce`, only an ident arm and a call arm. Loud,
  so not in the silent population; bind-first works for all of them.

---

### D8 — [CLOSED 2026-08-25] assigning `null` to a nullable binding INSIDE the block where it is narrowed non-null is rejected
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud check reject · flat across every place**

Repro:

    function body(p: string | null) {
      let q: string | null = p
      if q != null { print(q)
        q = null }
      print(q == null)
    }
    body("a")
    // [ERROR]: cannot assign null to string

Control (assign after the narrowed block — correct, prints `a` / `true`):

    if q != null { print(q) }
    q = null
    print(q == null)

* **Flat on**: `let`, param, struct field (`w.f = null`), module global — all four reject;
  and on both `if x != null { … }` and `if x == null { … } else { … }`.
* **Varies on**: the assigned value. `q = "zz"` inside the narrowed block is accepted, so
  the check is against the FLOW-NARROWED type rather than the declared one.
* **Why it is worth a slice**: it makes the ordinary drain idiom unwritable —

      while q != null { print(q)
        q = null }        // [ERROR]: cannot assign null to string

  there is no rewriting of that loop that keeps the guard and clears the variable, so the
  shape has to be replaced with a counter. Assignment should be checked against the
  binding's DECLARED type; narrowing constrains reads, not writes.

---

### D9 — [CLOSED 2026-08-25] a nullable-niche list / map / closure captured by a nested function is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 144 cells at the capture position (124 as filed, on the pre-`c0ee3089` grid)**

Repro:

    function body(p: string[] | null) {
      function inner() { if p != null { print(p.length) } else { print("N") } }
      inner()
    }
    body(["a"])
    body(null)
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls (both correct): the same capture with `i32[] | null`; and the same read
uncaptured.

**THE DIVERGENCE SITE IS ONE LADDER, AND IT IS THE `!= null` TEST, NOT THE READ.**
`emitNulIsNullTest` (`compiler/wasmEmit.vl`) is the one home for the null question of every
nullable rep — the `==`/`!=` compare and the `is`/`match` guard both call it — and it ends in
a disjunction of the per-rep `expr*` classifiers. An in-compiler probe placed at that
disjunction's fall-through (emit a distinguishing message whenever the receiver is an Ident
that `capturedKindOf` DOES type) fired on **190 cells**, and the 144 of them that were loud
emit rejects were exactly this row: `nulstrlist` 24, `nulf64list` 24, `nuli64list` 24,
`nulf32list` 24, `nulmap` 48. So the site is reached, the capture channel can answer, and the
ladder had no arm to ask it with — `exprNulScalarListKind`, `exprNullableMap` and
`exprNulClosure` resolved an Ident through param / declared local / global only, while
`exprNullableList` (`i32[] | null`, the filed control), `exprNullableRefArray` (`S[] | null`)
and `exprNullableVariant` already carried the fourth arm. That is why the controls were
correct and why message text could not group this: the identical fall-through reports
`bare null needs a struct-typed context` for `!=`/`==`/`while` (96 cells) and `` `is` test but
no union type declared`` for `is`/`match` (48 cells).

The fix asks `capturedKindOf` — `captureValKind` on the parent frame, the ladder that TYPED
the env field — so the read and the field cannot disagree about the wrapper.

**A NULL TEST ALONE IS A SEVERITY REGRESSION FOR THE MAP HALF, and the grid said so before it
shipped.** Teaching only `exprNullableMap` the storage class moved 22 `{[i32]: string} | null`
capture cells from `loud emit reject` to **check-clean invalid wasm**: the compare lowers, and
the narrowed `.size` then resolves its map SHAPE through `mapShapeOfExpr`, whose capture arm
answered for the non-null `map` kind only — so the read named the mono string-keyed
`$mapStruct` while `captureValStructIdx` had typed the env field with the i32-keyed one. The
shipped arm reads the env field's OWN companion slot (`capturedNulMapShape`), the number that
minted the field's heap type. A mono string-keyed map alone cannot catch this: its wrong
answer and its right answer are the same `-1`.

Measured on the 9,126-cell grid at `c0ee3089`: **144 cells moved, every one
`loud emit reject → correct`, nothing moved in the other direction, SILENT stays 0.** Per rep
(all /24): `string[]` 24, `f64[]` 24, `i64[]` 24, `f32[]` 24, `{[string]: i32}` 24,
`{[i32]: string}` 24. `f32[] | null` closes here only because D14 landed first — before it,
the same cells advanced from this row's failure to D14's `field access but no struct type
declared`.

Two more things this row's own 728-cell arm-for-arm population settled, over four capture
BINDING FORMS the main grid does not generate (outer param / annotated local / un-annotated
local / two frames deep) and thirteen reps:

* `((i32) => i32) | null` — the null TEST is closed; **CALLING** a captured closure is a
  separate gap that fails for a NON-nullable `(i32) => i32` capture too
  (`call to unknown function`), so it is not this axis.
* `S[] | null` at a capture no longer reports `ref valtype with no interned shape` and did not
  on this tip before the fix either — `exprNullableRefArray` already had the arm. **The filed
  claim of a second message inside this axis does not reproduce**; the real second message was
  the `is`/`match` one above.
* `string | null` at a `.length` READ was loud at every capture form (`field access but no
  struct type declared`) while `print(p)` of the same cell was correct. `exprString` knew the
  `str` capture kind and not `nulstr`, where `declaredString`/`paramString` claim both. Closed
  in the same change; pinned in the same fixture.
* **An UN-ANNOTATED captured local (`const v = mk()`) is still loud, for EVERY rep including
  `i32[] | null` and `S[] | null`** — 168 of the 728. It is a different site and it is filed
  as **D21** below, not silently absorbed here: `captureValKind` types an un-annotated env
  field through `letInitCellKind`, whose ladder names no nullable kind at all.

Pins: `tests/cases/closures/capture-nullable-niche-storage-class.vl`,
`tests/cases/closures/capture-nullable-map-shape-agreement.vl` (the map-shape one exists
because the null test alone passes the first fixture and still emits the invalid module).

---

### D10 — [CLOSED 2026-08-25] a numeric-valued map read by index and narrowed is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 40 cells at the `mapget` position across the four numeric value reps**

Repro:

    function body() {
      const m: {[string]: i32} = Map()
      m["k"] = 5
      const v = m["k"]
      if v != null { print(v) } else { print("N") }
    }
    body()
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls, all correct: `{[string]: boolean}`; `{[string]: string}`;
`{[string]: i32 | null}` (the DECLARED-nullable value type); `print(m["k"] ?? 0)`;
`for p in m.values()`.

* **Flat on**: `i32`, `i64`, `f64`, `f32` value types. Also `"p" | "q"` spelled INLINE as a
  map value type.
* **Varies on**: whether the map's value type is declared nullable. It is the map read's
  *implicit* `T?` that has no rep, not `T | null` itself.
* **The 40 cells carry THREE different messages for one axis**: 16 report `bare null needs a
  struct-typed context` (the `!= null` / `== null`-else forms), 16 report
  `emitProgram: 'is' test but no union type declared` (the `is` form), and 8 report
  `` `??` is only supported on a map index get`` — which is the "same root, different
  message" case in §3, inside a single row.
* **This is the axis-correction the orchestrator asked for.** The earlier filing retired
  "map-value reads with `is` and `!= null`" as working, and it IS working for `boolean` and
  for `K | null` values. The live half is the numeric value type, which the earlier probe
  did not carry.

---

### D11 — [CLOSED 2026-08-25] a nullable STRUCT UNION narrowed twice (`!= null`, then `is Variant`) is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 158 cells carry this message**

Repro:

    type Cat = { c: i32 }
    type Dog = { d: i32 }
    type Shape = Cat | Dog
    function body(s: Shape | null) {
      if s != null { if s is Cat { print(s.c) } else { print(s.d) } } else { print("N") }
    }
    body({ c: 1 })
    body(null)
    // vl check rc 0; vl run: emitProgram: narrowed receiver names no union variant

Control — do the `is` test DIRECTLY on the nullable, which also handles `null` correctly:

    function body(s: Shape | null) {
      if s is Cat { print(s.c) } else { print("OTHER") }
    }
    body({ c: 1 })   // 1
    body(null)       // OTHER

* **Flat on**: every position (11 of 11) and on the `match s { null => … _ => … }` spelling
  of the outer narrow.
* **Varies on**: whether the outer `null` narrow is present. Removing it fixes it — so the
  defect is that the FIRST narrow replaces the receiver with a temp the variant lookup
  cannot name.

---

### D12 — [CLOSED 2026-08-25] binding an optional-chain result to a `const` is a loud emit reject, with a message about `return`
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 22 cells · 0 of 132 `optchain` cells correct**

Repro:

    type S = { w: i32 }
    function body(a: S | null) {
      const t = a?.w
      print(t ?? 0)
    }
    body({ w: 3 })
    body(null)
    // vl check rc 0; vl run: emitProgram: unsupported expression in return

Controls, all correct: `print(a?.w ?? 0)` (no intermediate binding); `if a?.w != null { … }`;
`if a != null { print(a.w) }`.

* The message names `return`, and there is no `return` in the program. The reported
  position is the function's own header line.
* The neighbouring 100 cells in the same construct are a separate, LOUD, arguably-by-design
  family (110 cells): `?.length` / `?.size` on a nullable list, string or map is
  `[ERROR]: member access '?.length' on non-object i32[]?`. The message calls `i32[]?` a
  non-object, which is misleading, but the decline itself is consistent (only struct fields
  are reachable through `?.`). Filed as a message defect, not a capability defect.

**CLOSED — the root, and it is not about `return`.** `emitExpr`'s node dispatch had NO
`OptMember` arm at all. `?.` was reachable only where a bigger pattern consumed it whole
(`emitCoalesce`'s fused `?.f ?? d` arms; the null-test guards through
`emitOptChainIsNull`), so a `?.` that had to produce a value of its own reached the
dispatcher's trailing catch-all — which carried the message written for the RETURN arm and
raised it through `emitFail`, whose no-node fallback anchors at `emitCurFnIx`. That is both
halves of the defect from one cause. **The `const` binding is not the trigger**:
`print(a?.b ?? false)` over a `boolean` field is the same reject with no binding anywhere in
the program, because `emitCoalesce` dispatches the boolean niche on the operand's TYPE
(`exprNulBool`) long before its own `?.` arms.

`emitOptMemberValue` now lowers a standalone chain as the same two-arm select the fused arms
emit, with the default replaced by the null of the RESULT's own rep — a REP dispatch, not a
field one: `i32 | null` is the value-union box, `boolean | null` the i32 sentinel-2 niche.
Three ends had to agree: `exprUnion` answers for a scalar-leaf `?.` (else `emitUnionCoerce`
boxed the box a second time — `vl check` rc 0, `expected i32, found (ref $type)`), and the
checker exports the binding's inferred union (`inferLetNameOf` → `nliInferOptChainLet`),
which is the ONLY route for this type: `i32 | null` is synthesized from `S | null` plus an
`i32` field and is spelled in no annotation, so nothing else mints the box.

The catch-all message is now `emitProgram: unsupported expression`, anchored at the node.
**The 110-cell neighbour was fixed as the message defect it was filed as**: `?.` reaches
declared struct FIELDS only, so the message now says that and names the narrowing, instead
of calling a list a non-object. The decline is unchanged. Sweep, same 9,126 cells: the
`optchain` construct goes 0 correct / 132 to 22 correct + 110 loud check rejects, and
`unsupported expression in return` goes 22 cells to 0. Pins:
`tests/cases/structs/optional-chain-value-binding.vl`,
`tests/cases/structs/error-optional-chain-builtin-property.vl`.

---

### D13 — [CLOSED 2026-08-25] an INLINE literal union produced by a CALL and stored in a list or map is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 40 cells**

Repro:

    function src(): "p" | "q" { return "p" }
    function body() {
      const xs: ("p" | "q")[] = [src()]
      print(xs[0])
    }
    body()
    // now prints `p`. Was: vl check rc 0; vl run:
    //   emitProgram: literal-union atom narrowing needs a re-readable receiver

Controls, all correct then and now: the same list from a LITERAL (`["p"]`); the same call
through a NAMED alias (`type K = "p" | "q"` … `const xs: K[] = [src2()]`); the same call into
a plain `string[]`; the same call into a bare `const v: "p" | "q" = src4()`.

* **Flat on**: the list-element and map-value containers.
* **Varies on**: named vs inline (named is clean), and literal vs call initialiser (literal
  is clean). It needed BOTH the inline spelling and the call.

**CLOSED WITH THE LITERAL-UNION BOUNDARY CLASS, and this row is the reason the class was
grouped rather than worked defect by defect.** The container's slot holds the interned i32
ATOM (`ctxKeepsLitUnion` holds at an element, a field and a map value) while the call's result
is the string ref an inline literal union softens to at `RC_ROOT`, so the store needs a NARROW
— and the narrow is a `select` tower that re-reads its operand once per member, which for a
CALL is the wrong number of EVALUATIONS rather than merely a wrong value. So the tower refused
one. A non-place value is now STAGED: evaluated once into a slot, then re-read per member,
which is `emitAtomToStr`'s id stash mirrored and what the `.push` destination already did.

**ONE ARM, THREE DESTINATIONS, AND THE PREDICTED THREE WALKS WERE NOT NEEDED.**
`emitDestStrToAtom`'s header filed the array-LITERAL element and the INDEXED store as "the
same boundary one destination over" and expected each to need its own reservation walk. They
did not: the narrow has ONE entry point (`emitExpr`'s `pendingLitUnion` hook, which every
atom-typed destination already seeds), and all three destinations are EXPRESSION positions, so
`exprPopBits` — the value-position walk that already reserves the `.pop` frames — reaches them
all. Pinned as `tests/cases/literal-unions/inline-litunion-call-into-container.vl`, which
includes an evaluation-COUNT row: a tower that re-read the call per member would be a wrong
answer, not a refusal.

**LOUD DID NOT MEAN A DIFFERENT RUNG.** D13 was the only loud member of a class whose other
three directions were silent miscompiles, and the standing warning in *Root D* — that message
identity and root identity are independent in both directions — applies to SEVERITY too. The
severity split was an artifact of which side of the seam had a conversion available: at a
container store the emitter could see that the reps disagreed and refuse, and at the three
argument/result boundaries it could not see it at all.

---

### D14 — [CLOSED 2026-08-25] `f32[] | null` (audit row R2) was loud at every operation
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 140 cells carry `field access but no struct type declared`; `list_f32` was the worst-served rep in the whole sweep, 76 correct of 340**

Repro:

    function mk(): f32[] | null { return [1.25] }
    function body() {
      const w: f32[] | null = mk()
      if w != null { print(w.length) } else { print("N") }
    }
    body()
    // vl check rc 0; vl run: emitProgram: field access but no struct type declared

Controls, both correct: the `f64[] | null` twin; the non-nullable `f32[]`.

**THE DIVERGENCE SITE WAS ONE FUNCTION, AND THE `f64` TWIN ALREADY CONTAINED THE ARM.**
`exprF64Array` opens with `tyIsF64Array(nodeTyIxOf(exprIx))` — it trusts the type the CHECKER
recorded, which on a read inside `if v != null` is the narrowed, non-null `f64[]`, and every
position rides that one line. `exprF32Array` opened with `tyIsF32Array`, spelled
`tyKindOf(ty) == 21` against a helper whose return set is {-1,0,2,3,7,10,11,12,13,20} — a
CONSTANT FALSE that read like the same fast path. Every remaining rung in it asks a NAME
(`declaredF32Array` / `paramF32Array` / `globalIsF32ArraySid` / `capturedKindOf`), and a
`f32[] | null` name declares `"nulf32list"`, which none of them accepts. So the narrowed read
fell past the entire list ladder to the struct-field floor and reported the generic
field-access message — at every position at once, which is why this row was 174 cells wide
while the other nullable niches were narrow.

The arena CAN answer, structurally (`TyArray` -> `TyPrim "f32"`); that test already existed
one screen up as `callResTyIsF32Array`, scoped to curried-call results. It is now
`tyIsF32ArrayShape` and is attached to `exprF32Array`'s **IDENT** and **MEMBER** arms.

**NOT at the top of the function — that placement is wrong twice, and both were measured.**
Enabling it there reaches the same 250/340, and breaks two pinned corpus fixtures:

| shape | fixture | what the top placement does |
|---|---|---|
| `ArrayLit` | `unions/f32-list-union-member.vl` | `const g: f32[] \| string = [63.5]` records the union's `f32[]` ARM on the literal while the literal still BUILDS the f64 list — the coerce is what re-encodes it. Claiming the literal skips the coerce and boxes an `(ref $fl64)` payload under the f32-list atom tag: `wasm trap: cast failure`. |
| `Index` | `arrays/nested-array-inferred-empty-unsupported-leaf.vl` | an element read's rep comes from the CONTAINER's interned row, and the inferred-empty nested-array synthesis DECLINES an `f32[]` leaf on purpose (`tyNestedArrLeafSupported`). Claiming `outer[0]` turns that pinned loud decline into check-clean INVALID WASM. |

The second is the severity regression #1467 warned about, reproduced exactly: a partial fix
that converts a loud reject into a silent miscompile is site 1 of N, not a fix. Restricting
the leg to the two node shapes whose cell rep the declaration already fixed keeps both
fixtures at their pinned verdicts and still moves all 174 cells.

**Before / after, same 340 `list_f32` cells, same harness** (`correct` / denominator; the
`list_f64` column is the twin measured on the same run):

| position | before | after | `list_f64` |
|---|---|---|---|
| const_local | 14 / 40 | **40 / 40** | 40 / 40 |
| let_local | 6 / 16 | **16 / 16** | 16 / 16 |
| param | 6 / 28 | **28 / 28** | 28 / 28 |
| ret_ann | 6 / 28 | **28 / 28** | 28 / 28 |
| ret_unann | 6 / 16 | **16 / 16** | 16 / 16 |
| global | 6 / 28 | **28 / 28** | 28 / 28 |
| field | 6 / 28 | **28 / 28** | 28 / 28 |
| field_place | 0 / 8 | **8 / 8** | 8 / 8 |
| elem | 6 / 28 | **28 / 28** | 28 / 28 |
| mapget | 0 / 8 | **8 / 8** | 8 / 8 |
| mapval | 0 / 28 | **2 / 28** | 2 / 28 |
| capture | 4 / 28 | 4 / 28 | 4 / 28 |
| loopvar | 4 / 28 | 4 / 28 | 4 / 28 |
| callres | 12 / 12 | 12 / 12 | 12 / 12 |
| elem_place | 0 / 8 | 0 / 8 | 0 / 8 |
| mapval_place | 0 / 8 | 0 / 8 | 0 / 8 |
| **TOTAL** | **76 / 340** | **250 / 340** | **250 / 340** |

174 cells moved and **every one of them was `loud_emit_reject` -> `correct`**; nothing moved
the other way and the rep's SILENT total stayed 0. Joined coordinate-for-coordinate against
`list_f64` the two reps now differ on **0 of 340** cells — the residue (capture, loopvar,
mapval, the two `*_place` check rejects) is shared with `f64` and is therefore not this row.
**That residue is now filed as D20**, re-probed per (position, rep): it is a nullable-list
niche with no rep at three positions, 360 cells across every list rep, and nothing in this
fix touches it.
Corpus byte-identity across the whole `tests/cases` tree: **2,232 of 2,233 identical**, the
single mover being the new fixture, which the old compiler cannot emit at all.

* Pin: `tests/cases/arrays/nullable-f32-list-narrowed-positions.vl` (one narrowed read per
  moved position, with the lint hints DECLARED rather than the annotations deleted — each
  annotation IS the position under test).
* **FULL GRID, before and after on the closing branch**: `correct` **6,909 -> 7,083**, loud
  emit **1,018 -> 844**, loud check 1,199 -> 1,199, SILENT TOTAL **0 -> 0**. Cell for cell,
  exactly those 174 cells moved and nothing else in the other 21 reps did.
* **THE CORPUS WAS BLIND TO THIS, and the byte-identity number is the proof**: all 2,232
  pre-existing fixtures emit byte-identical modules, because not one of them narrowed an
  `f32[] | null`. A rep-by-position grid found it; no amount of corpus green would have.

---

### D15 — [CLOSED 2026-08-25] `??` applied to a NON-nullable value reports a map-index rule
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 224 cells carry this message (204 when re-measured at `c0ee3089`, after D14's f32 work moved 20 of them)**

Repro:

    function mk(): i32 { return 7 }
    print(mk() ?? 0)
    // vl check rc 0; vl run: emitProgram: `??` is only supported on a map index get

Control: make the operand nullable (`function mk2(): i32 | null`) — correct.

* A useless `??` is a lint-level fact the checker should state at check time; instead it
  survives to emit and reports a rule about map index gets, which is not the reason. This
  is the single most common loud message in the sweep and most of its firings are of this
  shape, so it is worth correcting for the diagnostic alone.

**CLOSED — the policy, and what decided it.** `x ?? d` over an operand that cannot be null
is USELESS, not ill-formed: the operator is total and its value is `x`. It is now ACCEPTED
and lowered as the identity on the left operand, and the redundancy is STATED at check time
as a `warning` (`dead-coalesce-default`) rather than blocking the build. Against a check-time
error: `tests/cases/soundness/narrowed-read-coalesce-lowers.vl` pins `if p != null { print(p
?? 0) }` as correct at ten sites, and that shape types `p` NON-nullable at the read, so an
error keyed on the flow type would reject a contract the compiler deliberately supports.
Measured with narrowed places exempt, the rule fires **zero** times across `compiler/*.vl`
(494 `??` uses), `std/*.vl` and ~1,450 corpus fixtures — every `??` this compiler writes is
on a genuinely nullable operand; without the exemption it fires 10 times and all 10 are that
soundness fixture. Swift and Kotlin warn on the same construct, and VL's own parse-only lint
already reports the same family (`constant-condition`, a branch never taken) at `warning`.

**THE FOLD IS A REWRITE, NOT AN EMIT ARM, and that is measured.** Lowering the identity
inside `emitCoalesce` gives the right BYTES and leaves the `??` NODE for `exprString` /
`exprIsLitAtom` / the print-import chooser to classify — and each of their `??` arms answers
only for a NULLABLE operand. On these same 9,126 cells that version turned 132 loud rejects
into `correct` **and 62 into SILENT failures** (40 invalid-wasm on `string` / inline
litunion, 22 wrong-value on a named litunion printing its raw atom id). Folding the node in
`emit_rewrite.vl` leaves nothing to classify. Safe to fold early because every fused `??`
lowering needs a nullable operand: `m[k]`, `m.get(k)`, `xs.get(i)`, `xs.pop()` are all typed
`V | null`, so the query declines them.

The residue keeps a loud reject and finally names itself: ``emitProgram: `??` over this
nullable value is not supported yet — narrow it first, e.g. `if v != null { … }` ``, 204 → 10
cells. Pins: `tests/cases/expressions/coalesce-non-nullable-folds.vl`, and
`tests/cases/maps/error-nonmap-coalesce.vl` (the one fixture that held the old text — a
`K0 | null` operand, i.e. exactly the residue).

---

### D16 — [CLOSED 2026-08-25] an UN-ANNOTATED function returning an empty `[]`, passed on or returned, emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 28 cells of a 384-cell grid · UNFIXED, filed by the D4/Shape-A slice**

CLOSED by reading the hole's element rep off the type the CHECKER unified it with, recorded on
the literal node itself (`emptyArrHoleKind` / `emptyArrHoleBuildKind`, `compiler/emit_classify.vl`).
The "Why it is not fixed here" note below asked for "a contextual seed at the argument boundary or
a reject scoped to a call-result hole" — neither was needed, because the context had already been
propagated: `vl check` was clean precisely because the checker HAD unified the hole with the slot.
The two emit-side readers of that unification disagreed. The RESULT VALTYPE was minted from it via
`exprStringArray`'s typed fast path (which is why `string`/`f64`/`i64` producers declared the right
wrapper) while the `return []` BUILD had no annotation node to seed from and fell to the default
i32 list; for `f32`/`u8`/struct/closure/nested elements neither reader answered and the SIGNATURE
was wrong too. Both now read the same node.

Verified over a 203-cell grid (8 non-i32 element reps × {named, lambda, annotated} producers ×
{call argument, typed return, typed local, typed global, two hops, push-after-arrival}, plus
`[[]]`, an unconsumed hole, a `.length`-only hole and two two-slot programs): **98 SILENT before,
0 after**. The two remaining non-running cells are the two-slot programs, and they are LOUD — one
hole reaching `string[]` and `f64[]` in one program is `type error … argument 1: expected f64[],
got string[]` at `vl check`, so the compiler never silently picks one.

This entry was not in the original sweep's population. It was found by the grid that fixed D4
and the empty-`[]` compiler trap, where it is the residual: 16 of its cells are red on master
untouched by that fix, and the other 12 were previously masked BY the compiler trap (they were
`compiler_trap` cells whose un-annotated NAMED-function twins were already this).

Repro (`string` element; the same holds for `f32`, `f64`, `i64`, `i32[]` and a struct element,
and for the un-annotated LAMBDA spelling of the producer):

    function sink(xs: string[]) { print(xs.length) }
    function fq() { return [] }
    function main() { sink(fq()) }
    main()
    // vl check rc 0, no diagnostic. Module written (789 bytes); the engine rejects it:
    //   type mismatch: expected (ref $type), found (ref $type) (at offset 0xe8)

Controls, both correct:

* the SAME producer consumed by `.length` / an index / a `for`-in (`print(fq().length)` → `0`),
  so the hole return is not itself unlowerable — only its flow into a slot that demands a
  concrete element rep;
* the producer ANNOTATED (`function fq(): string[] { return [] }`), which lowers.

* **Flat on**: the producer spelling (an un-annotated named function and an un-annotated lambda
  behave identically — that equality is an invariant the D4 slice established and it holds
  across all 8 element types × 6 consumers).
* **Varies on**: the CONSUMER (only `passon` and `ret`, 0 of the other four) and the element rep
  (the i32/boolean shared list backing is clean; every rep with its own backing is not).
* **Why it is not fixed here**: an empty `[]` passed DIRECTLY (`sink([])`) must stay legal and
  gets its element rep contextually from the parameter. A call RESULT cannot, so the fix is
  either a contextual seed at the argument boundary or a reject scoped to a call-result hole —
  a reject-parity change with its own evidence to gather. The annotated-lambda sibling of this
  shape ships as a loud floor instead (`tests/cases/arrays/
  lambda-empty-array-ref-element-rejected.vl`).

---

### D17 — [CLOSED 2026-08-25] an empty `[]` in a STRUCT-FIELD initializer is never pinned by the field's type
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · found while closing D16 · the root was the CHECKER, not the emitter · 111 SILENT cells of a 231-cell grid, 0 after**

CLOSED, with D18, by ONE change: `constrainEmpty` (`compiler/typecheck.vl`) now recurses through a
STRUCT FIELD, a MAP VALUE and a `| null` wrapper, and the three WRITE spellings that never called it
at all now do (`x = e`, `m.set(k, v)`, `xs.push(v)`). The row's own prediction held in both halves:
the fix belongs in `typecheck.vl`, and the D16 emit-side seed (`emptyArrHoleKind`, read off the
literal node) is what lowers them once the checker pins — **no emitter line changed**.

ONE ROOT, NOT TWO, and that was measured rather than assumed: the walk already recursed through an
ARRAY destination's element (`const xss: string[][] = [fq()]` has never been red), so the container
positions were not three defects but three arms missing from one recursion. D17, D18 and the write
spellings all close on it together.

THE CONFLICTING-CONSUMER RULE WAS CHOSEN: a hole pins from the FIRST consumer that reaches it and a
conflicting later use is a loud type error — the rule the call-argument position has shipped since
D16. "Reject as ambiguous" was considered and refused: the accept/reject VERDICT is already
order-independent (all 10 conflicting pairs measured reject in both orders; only the wording names
whichever consumer came second), so ambiguity would buy no determinism, and a second rule for the
container positions would make one program's verdict depend on which slot the author wrote it into.
Both behaviours are pinned: `tests/cases/arrays/empty-hole-pinned-by-container-position.vl` (accept)
and `tests/cases/arrays/empty-hole-container-conflict-rejected.vl` (reject, both orders and a
same-statement conflict).

THE ONE TRAP, worth reading before touching this walk again: **the pin erases its own trigger.**
`assignableExpr` records an ObjLit/ArrayLit's destination rep on the `nodeRepTyIx` sidecar only
while the literal still REACHES an open hole (`tyReachesEmptyHole` gates `recordRepTyAdopt`).
Pinning first makes that gate false, the rep is never recorded, and the literal falls back to
structural row resolution — which has no answer for a self-referential map value:
`tests/cases/types/recursive-map-value.vl` went `emitProgram: map value type has no interned slot`,
the one corpus file the field-wise pin reddened. `constrainEmptyExpr` records on the SAME condition
BEFORE pinning. Reordering to check-first instead would lose a same-statement conflict, so the
order is load-bearing in both directions.

Repro:

    type W = { xs: string[] }
    function fq() { return [] }
    const w: W = { xs: fq() }
    print(w.xs.length)
    // vl check rc 0, no diagnostic. Module written; the engine rejects it:
    //   type mismatch: expected (ref $type), found (ref $type)

THE DISCRIMINATOR FROM D16, and it is what makes this a different defect rather than a leg
of that one. D16 was two emit-side readers disagreeing about a fact the CHECKER had already
established — `vl check` was clean *because* the hole had been unified with the consuming
slot, and the fix was to make both readers take it from the literal node. Here the checker
establishes nothing: add a SECOND, conflicting consumer and it still says nothing.

    type W = { xs: string[] }
    function fq() { return [] }
    const w: W = { xs: fq() }
    function sinkF(ys: f64[]) { print(ys.length) }
    sinkF(fq())
    print(w.xs.length)
    // vl check rc 0 — `fq()` is accepted into a `string[]` FIELD and an `f64[]` PARAM in one
    // program. The argument position alone would be `argument 1: expected f64[], got string[]`.

So the struct-field position did not propagate its element type back to an un-annotated
producer at all. There was no fact on the literal node for the emitter to read, `fq`'s result
valtype and its `struct.new` agreed with each other at the i32 default, and the mismatch was at
the `struct.set` into the field. **The fix belonged in `typecheck.vl`** — the field position
joined the positions that pin a hole — and only then did the D16 emit-side seed answer. Both
programs above are now loud: the second is `argument 1: expected f64[], got string[]`.

* Control: `const w: W = { xs: [] }` — a DIRECT empty literal in the same field — lowered throughout,
  because the field annotation seeds the build (`seedFieldListBuild`). It was the call RESULT that was
  unpinned; the control is pinned as leg L7 of the accept fixture so a wider fix cannot quietly
  replace it.
* Pre-existing: the same program was check-clean invalid wasm on master before the D16 fix, and
  after it, unchanged in both directions.
* Grid: 21 positions × 11 element reps = **231 cells; 111 SILENT before, 0 after**,
  with `emit_reject` flat at 30 (the pre-existing `u8`-element and nullable-map-value loud floors) and
  `check_reject` flat at 0. Corpus sweep PASS=1697 CHECKFAIL=0 RUNFAIL=0 LOGDIFF=0.

---

### D18 — [CLOSED 2026-08-25] an empty `[]` assigned into a MAP VALUE is never pinned by the map's value type
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · found while closing D16 · D17's twin, one container out**

Repro:

    function fq() { return [] }
    const m: {[string]: f64[]} = Map()
    m["a"] = fq()
    print((m["a"] ?? [1.0]).length)
    // vl check rc 0, no diagnostic. Module written; the engine rejects it:
    //   type mismatch: expected (ref null $type), found (ref $type)

Same root as D17, and the prediction in this paragraph is the one that was tested: the map-value
position did not pin an un-annotated producer's hole either, so the emitter had nothing to
read and the i32-list wrapper was stored into an `f64[]`-valued cell. The checker learned to
pin a hole from a container's declared element/value type, and **both rows closed together on the
one recursion**, with the D16 seed making them lower. See D17 for the mechanism, the
conflicting-consumer ruling and the grid.

* The `.set` SPELLING was the residue, and it is why this row is not merely D17 restated: `m[k] = v`
  and `m.set(k, v)` are two write paths, and the first fix closed only the first — 7 cells stayed
  SILENT until `.set` (and `.push`, the array sibling) called the same pin. The map arms already
  state that rule for their key/value HOLES one screen up; the VALUE ARGUMENT's own holes were the
  half that never followed it.
* Pinned: `tests/cases/maps/empty-hole-pinned-by-map-value.vl` (this repro, the `.set` twin, a
  struct-valued map, a nested map and the direct-`[]` control).
* Pre-existing: identical outcome on master before the D16 fix and after it.

---

### D19 — [CLOSED 2026-08-26] a MISS on a DECLARED-nullable numeric-litunion map, read at MODULE SCOPE, traps
**CLOSED 2026-08-26 — the repro now RUNS and prints `1` / `absent`, the same two lines its function-scope control always printed. Was: check-clean LOADS THEN TRAPS · found while closing D6, filed unfixed · module scope only. It was one rep of a seven-rep class the scope-crossed sweep then measured whole — see "THE SCOPE AXIS" below**

Repro:

    type N2 = 1 | 2
    const d: {[string]: N2 | null} = Map()
    d["a"] = 1
    const dhit = d["a"]
    if dhit != null { print(dhit) } else { print("absent") }
    const dmiss = d["nope"]
    if dmiss != null { print(dmiss) } else { print("absent") }
    // vl check rc 0; module written and LOADED; prints `1`, then:
    //   wasm trap: null reference
    //   note: a null value was used where a non-null one was required.

Control — the SAME seven lines inside a function print `1` / `absent`:

    function body() {
      const d: {[string]: N2 | null} = Map()
      d["a"] = 1
      const dhit = d["a"]
      if dhit != null { print(dhit) } else { print("absent") }
      const dmiss = d["nope"]
      if dmiss != null { print(dmiss) } else { print("absent") }
    }
    body()

* **PRE-EXISTING, measured in both directions.** Byte-identical modules before and after the
  D6 fix (`md5 ac93932e`, 3354 bytes), so that change neither caused nor cured it.
* **THE ROOT, and it is one missing arm.** `emitStartFnCode`'s global-init ladder
  (`compiler/emit_sections.vl`) is the module-scope twin of `emitLetDeclStmt`'s kind ladder,
  arm for arm — map, nulmap, struct, nulstruct, variant, nulvariant, nulbool, nulstring,
  litunion, nullitunion, list, nullist, the three nullable scalar lists, nulreflist,
  nulclosure, union. The one arm it never grew is `letNulMapReadUnionBox` →
  `emitMapGetUnionBox`, so a bare top-level `const t = m[k]` over a UNION-BOX-valued map fell
  through to `emitExpr` → `emitMapGet`, whose miss arm yields "the rep's empty value" — a
  BARE `ref.null`. The consuming `!= null` is a TAG COMPARE that recovers the box first, read
  straight off the disassembly of the repro and its control:

  | | miss arm the module emits | the null test that follows |
  |---|---|---|
  | inside a function | `i32.const 6 ; ref.null none ; struct.new $uBox` | `ref.as_non_null ; struct.get $uBox 0 ; i32.ne 6` |
  | **at module scope** | **`ref.null $uBox`** | the same three instructions — and the recover traps |

  The fix routes the module-scope init through the same `emitMapGetUnionBox`. It is 20 lines
  in `emitStartFnCode` plus an `export` on the helper; no layout, no new heap type, no
  allocation change (the miss builds the box it was already meant to build).
* **The value type is DECLARED nullable**, so this is not D6's implicit-`T?` seam — but the
  scope-crossed grid showed the implicit spelling has the same hole: `{[string]: string|i32}`
  read at module scope trapped identically with no `| null` in the program at all. The axis
  really is the STORAGE CLASS of the executing body, and the row's own reading of it was
  right.
* **`trap_loads` — the outcome vocabulary now has this state.** The former bullet here said
  `check-filed-witnesses.py` could not say what this row was, because a module that exists
  plus a non-zero run rc graded `silent_invalid_wasm`, and the status line was worded to grade
  as filed while the prose said the truth. That workaround is gone: the classifier now splits
  the two on the same marker vocabulary `grade.py` uses, `--self-test` proves the state fires
  (a program that prints `2` then indexes out of bounds routed `silent_invalid_wasm` before
  and `trap_loads` after), and **re-grading all 24 rows found no other row hiding behind the
  conflation** — D22, D23 and D24 stay `silent_invalid_wasm` under the sharper classifier,
  which is now a measurement rather than an assumption.
* **NOW PINNED, and the earlier refusal to pin was right at the time.**
  `maps/numlit-value-annotated-miss.vl` deliberately kept only the function-scope control,
  because pinning a trap freezes it as contract. A CLOSED trap is a different object:
  `tests/cases/maps/module-scope-union-box-map-read-miss.vl` is a `@run` fixture carrying all
  four affected value shapes at module scope plus the function-scope control in the same file,
  and it traps on master's own seed (`d7cab73e`) and runs on this branch.

---

### D20 — [CLOSED 2026-08-26: `loopvar` whole; `mapval` at FUNCTION SCOPE] a NULLABLE LIST had no niche rep at `loopvar` or `mapval`
**CLOSED 2026-08-26 — the repro, which is the `loopvar` leg, now RUNS. `mapval` closes 108/120 at FUNCTION scope and 48/60 at MODULE scope, and its residual is pinned and attributed below — read that before quoting this row as whole. Was: loud emit reject · 264 cells (`loopvar` 120 + `mapval` 144) · filed 2026-08-25 alongside D14, because it is what D14's residue turned out to be. Its `capture` leg was D9 and closed first**

Repro:

    function mk(): f64[] | null { return [1.5, 2.5] }
    function body() {
      const xs: (f64[] | null)[] = [mk()]
      for w in xs {
        if w != null { print(w.length) } else { print("N") }
      }
    }
    body()
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls, both correct: the same loop with the element made NON-nullable (`f64[]`); the same
loop over the SHARED-backing `(i32[] | null)[]`, which was clean at this position all along.

**THE THREE LEGS WERE THREE SITES, AND THE PROOF IS THAT EACH FIX REACHED EXACTLY ONE.** D9's
change (the capture storage class in `exprNulScalarListKind` / `exprNullableMap` /
`exprNulClosure`) moved 144 cells and **0 at `loopvar`, 0 at `mapval`** — so the shared
`bare null needs a struct-typed context` between the capture and loopvar legs was message
identity, not root identity, exactly as §3's Root D warns in the direction people forget.
Closing `loopvar` and `mapval` then took two more pairs of sites, sharing no code with D9's and
almost none with each other's.

#### `loopvar` — `forInElemKind` and the element read are ONE decision

Two coordinated sites, shipped together because either alone is worse than neither:

* `forInElemKind`'s ref-array ladder (`compiler/emit_classify.vl`) split the nullable niche for
  element kind 4 (`nullist`), a nullable struct (`nulstruct`) and `(string | null)[]`
  (`nulstr`), and NOT for kinds 6 / 7 / 8 / 10 / 9 — the four distinct-backing leaf lists and
  the nested ref array. A loop variable IS a declared local (`declareForInLocals` →
  `addLocalName`), so `declaredKind` reaches it; the kind STORED there was the non-null one.
  Those five arms now ask `rlElemIsNulNiche`, with the matching `fiLk` / `fiVarIdx` / `fiLs`
  rows in `declareForInLocals`.
* `emitForInStmt`'s element read (`compiler/wasmEmit.vl`) recovers each element
  `ref.as_non_null` from the `(ref null <elem>)` backing slot, off an explicit kind set. The
  five new niche kinds had to enter its wrapper/backing set and stay OUT of its recover set.

**ADDING THE FIVE ARMS ALONE IS A SEVERITY REGRESSION, AND IT IS MEASURED, NOT ARGUED.** Built
as its own compiler on this base and run over the same 120-cell grid: `loud emit reject` 70 →
0, `correct` 35 → 20, **`check-clean INVALID WASM` 0 → 100** (`type mismatch: expected
(ref null $w), found (ref $w)` — the slot is nullable, the recovered value is not). SILENT goes
**15 → 100**. Every cell of the five affected reps lands there; `i32[]` stays correct precisely
because its `nullist` arm was always paired this way.

#### `mapval` — NOT a layout change, which is what this row assumed

The filed assessment — *"a nullable-list map VALUE needs an mv slot that does not exist, which
is a layout change, not a missing arm"* — **is refuted.** A ref-valued map's `vals` element is
`(ref null <elem>)` for EVERY value kind; that is what lets a MISS read as null. So a stored
null needs no new slot shape, exactly as it needs none for the `{[K]: S | null}` /
`{[K]: {[K]: V} | null}` / `{[K]: (() => T) | null}` niches the layer already lowers. Two
coordinated sites again:

* `nulRefMapValInnerOf` excluded a list inner outright, so the value fell past the niche branch
  into the atom counting, whose single-ref-member arm answers the `-3` loud reject.
  `mvValKindOfName` now answers **kind 6** for a list inner — the same kind the NON-nullable
  list value gets — and the arm sits ABOVE the struct probe, which is the whole point. The
  original exclusion existed because `structIndexByValName`'s field-name parse ignores a
  trailing `[]`, so `{f: f64}[]` matched the ELEMENT struct and minted a kind-1 slot whose vals
  element the list store then filled with a `(ref $rlWrap)` — invalid wasm at `vl check` rc 0
  (fuzz frontier seed 615401451 d6). ORDERING answers that; excluding the whole family was the
  expensive way to avoid it.
* `forInElemKind`'s `.values()` arm answered `mvListValKind` — the NON-null list kind — for a
  kind-6 value. That is the loopvar bug again at the map-vals walk: the element read would
  recover a stored null non-null. It now answers `mvNulListValKind` when `mvSlotNullable`, and
  the recover-set change above serves both walks.

**Price of the layout change that was NOT needed**: nothing. No layout, no new heap type, no
new element slot, no allocation, no goldens.

#### `mapval` at MODULE SCOPE — a residual, and it is NOT this row's axis

**Caught in review, not by my grid, and the reason is worth recording: every leg of the
`mapval` fixture was inside a function**, so the fixture could not tell "closed" from "closed
at function scope". The witness is five lines with exactly one thing changed:

    const m: {[string]: f64[] | null} = Map()   // at MODULE scope: loud
    m["a"] = [1.5, 2.5]                          // the same five lines inside a
    const v = m["a"]                             // function: prints 2
    if v != null { print(v.length) } else { print("N") }
    // emitProgram: bare null needs a struct-typed context

Re-measured as a **2×2 of scope × NULLABILITY** — 6 list reps × 5 map operations × 2 runtime
inputs per quadrant, 240 cells, `records == cells` asserted:

| | `V \| null` | `V` (non-nullable) |
|---|---|---|
| function scope | 0/60 → **60/60** | 60/60 → 60/60 |
| **MODULE scope** | 0/60 → **48/60** | **48/60 → 48/60** |

**The `V` column does not move on either side, and that is the whole answer.** The 12 cells
that stay loud in each MODULE row are the *same 12 coordinates* — the `read` operation, every
rep, both inputs — and they are loud on master with a value type carrying no `| null` at all.
So module scope here is not a nullability axis and not a scope axis in general: `.size`,
`.has`, `?? d` and `.values()` over the same nullable-list map all reach 12/12 at module
scope, and a nullable STRING or nullable MAP value binds fine there (`{[string]: string |
null}` and `{[string]: {[string]: i32} | null}` both run at module scope, before and after).

**The missing rung, named.** A module-scope binding is a GLOBAL cell, so its kind resolves
through `letNulScalarListKind` → `exprNulScalarListKind(d.letInit)`; a function-local one
resolves through `letCellKind` / `letInitCellKind`, which DO carry a `mapReadMvSlot` arm. That
is the entire difference. The Index arm of the list-family nullable classifiers
(`exprNulScalarListKind` / `exprNullableList` / `exprNullableRefArray`) reads a
`(T[] | null)[]` ELEMENT and nothing else, while `exprNullableStruct` (`mvValKind == 1`), the
`nulstr` classifier (`== 3`), the union-box one (`== 2`) and the closure one (`== 14`) each ask
`mapReadMvSlot`. **Value kind 6 — a list — is the one kind with no consumer arm.**

**That rung also subsumes this row's other residual.** The 12 function-scope `mapval` cells
that stay loud are the INLINE `m[k] == null` spelling, which is the same rung asked with no
binding at all. One rung closes both; the two pins name each other and should be deleted
together.

**NOT WIDENED HERE, deliberately.** It is one rung conceptually but three classifier sites,
and closing it changes behaviour for NON-nullable list-valued maps — master's territory, not
this row's axis, and precisely the shape of widening that has twice turned a loud reject into a
silent one in this programme. The measurement above is what makes it schedulable without a
second investigation.

**Is it D19's axis?** *Adjacent, not shared* — and this is a probe, not a reading. D19 is a
check-clean **TRAP** on a MISS over a declared-nullable numeric-litunion map; this is a
**loud emit reject** over a list-valued map that fails identically when the value type is not
nullable at all, which D19's does not. They share the module-scope discriminator and nothing
below it: D19's mechanism is a miss-versus-stored-null confusion in the union-box value rep
that reaches runtime, and this one never emits a module. What the two DO jointly establish is
that **a module-scope binding is a storage class the classifiers under-serve** — two
independent rows now turn on it, which makes it a candidate axis for a sweep of its own rather
than a coincidence. This fix's own sites cannot see it: they classify a value TYPE from a
spelling and are storage-class blind by construction; the residual is in binding
classification, which is D21's ladder, not this one's.

> **THE SWEEP WAS BUILT AND IT RULED ON BOTH HALVES — 2026-08-26, see "THE SCOPE AXIS"
> above.** *Adjacent, not shared* holds: D19's class closed on one arm in
> `emitStartFnCode` that this residual's coordinates never touch, and re-running the grid on
> the fixed compiler moved 38 cells, none of them here. What the axis DID change about this
> row is its size — **322 paired coordinates**, not the 12 its own 2×2 saw, are `correct`
> inside a function and `loud_emit_reject` at module scope, concentrated exactly where this
> row predicted (`mapval` 158, `mapget` 56, `field` 24, `elem` 24, `ret_unann` 12; 164 of
> them `bare null needs a struct-typed context`, 110 `` `is` test but no union type
> declared ``). **The "NOT WIDENED HERE, deliberately" ruling above stands, and the scope
> sweep is a reason to keep it** rather than to revisit it: the 322 are LOUD, the silent
> class that shared their axis had a different root, and folding the two together is how a
> loud reject becomes a silent one.

**One more thing the probes turned up, recorded so nobody spends the afternoon on it**:
annotating the binding is not a workaround and not scope-related. `const v: f64[] | null =
m["a"]` is a CHECKER reject — `cannot assign f64[] | null | null to 'v' of type f64[] | null` —
at module scope and inside a function alike. The map read's implicit `T?` is not collapsing
over an already-nullable value type. Separate defect, separate layer, not filed here.

#### The measurement

Three grids, each with its own declared axes and `records == cells` asserted per run. Baseline
is master's own compiler (`4628300f…`, byte-identical to the published `seed-latest`).

**`loopvar`**: 6 reps × 10 narrowing constructs × 2 runtime inputs = **120 cells**, plus the
same 120 at a `ctl_idx` CONTROL position (`const w: T | null = xs[0]`), which was already
120/120 correct and stays there — the fix moves nothing off the loop.

| verdict | before | after |
|---|---|---|
| correct | 35 | **120** |
| loud emit reject | 70 | **0** |
| **TRAP (emitted program)** | **15** | **0** |
| SILENT TOTAL | **15** | **0** |

Transitions, all 85 movers: `loud_emit → correct` **70**, `trap → correct` **15**. Nothing
moved in the other direction. Per rep, `correct` / 20: `string[]` 3 → 20, `f64[]` 3 → 20,
`i64[]` 3 → 20, `f32[]` 3 → 20, `S[]` 3 → 20, `i32[]` 20 → 20 (the control rep).

**THE ROW'S OWN "120 LOUD" WAS WRONG IN A WAY THAT MATTERED, and this is the refutation the
work turned up.** 15 of those cells were never loud. Three constructs — a body that never reads
the loop var, one that passes it to a `T | null` parameter, and one that copies it into an
annotated `T | null` local — never ask the null question, so nothing reached the classifier
fall-through. They compiled CLEAN and **trapped at runtime on the null element** (`a null value
was used where a non-null one was required`), because the element read recovered it. On the
present-value input those same three cells already ran correct, which is exactly why a
loud-reject census could not see them. `loopvar` was carrying a silent class, and the §1 tables
score it 0.

**`mapval`, at FUNCTION scope**: 6 reps × 10 map operations × 2 runtime inputs = **120
cells** (`{[string]: V | null}`, with one of the ten operations re-keyed to
`{[i32]: V | null}`). The module-scope quadrant is the separate 2×2 above.

| verdict | before | after |
|---|---|---|
| correct | 0 | **108** |
| loud emit reject | 120 | **12** |
| SILENT TOTAL | 0 | **0** |

All 108 movers are `loud_emit → correct`; per rep 0/20 → 18/20, flat. Per operation, 12/12 for
store+read, stored null, missing key, `?? d`, `.size`, `.has`, `.delete`, `.values()`, `.keys()`
and the i32-keyed row.

**The 12 that stay loud are a DIFFERENT defect and it has a control.** All 12 are the INLINE
`m[k] == null` spelling, and the same compare over a **NON-nullable** `{[string]: f64[]}` is
loud too — pinned as `tests/cases/maps/error-inline-null-compare-list-value.vl`. It is the
SAME missing rung as the module-scope residual above: value kind 6 has no `mapReadMvSlot` arm
on the list-family classifiers' Index arm, where kinds 1 / 2 / 3 / 14 all do. Binding the read
first (`const r = m[k]; if r != null`) lowers for both — at function scope. Orthogonal to
nullability, loud, never invalid wasm — do not re-open this row for either.

**Exotic value shapes, run because opening a niche is where a loud reject turns silent**: 10
further map value types × 2 inputs. 16 of 20 move `loud_emit → correct` (`u8[]`, `boolean[]`,
`i32[][]`, `(string|null)[]`, `(i32[]|null)[]`, `((i32) => i32)[]`, `{[string]: i32}[]`,
`S[][]`, a litunion `K[]`, `string[]`), **SILENT 0 → 0**. The 4 that stay loud: `u8[] | null`
keeps the `-3` decline by construction — the packed byte list is in neither
`scalarListKindOfName` nor `nameIsRefArray`, so the niche covers exactly the element reps its
non-null twin covers — and `(string | null)[] | null` reports a struct-field message, which its
NON-nullable twin `{[string]: (string | null)[]}` reports on master too, so the nullable form
now behaves exactly like the value it wraps.

* Corpus byte-identity across the whole `tests/cases` tree: **2,240 of 2,244 identical**, and
  every mover is a fixture this change adds. Three are the new `@run` files, which the old
  compiler cannot emit at all. The fourth is the module-scope pin, and its movement is itself
  a result: master rejects it `unsupported map value type` (the value rep did not exist) and
  this branch rejects it `bare null needs a struct-typed context` (the rep exists; the binding
  rung does not) — loud → loud, and the message change is the evidence that the value type IS
  now supported at module scope and something later refuses. The inline-compare pin is
  byte-identical on both sides. **THE PRE-EXISTING CORPUS WAS BLIND TO BOTH LEGS** — not one
  fixture iterated a `(T[] | null)[]` or declared a nullable-list map value.
* `scripts/rep-fuzz-check.sh`: `exact ✅ (0 baselined failures — 0 unsound, 0 reject; 0 new, 0
  stale)`.
* Pins: `tests/cases/arrays/nullable-list-elem-loopvar.vl` (all six reps, four narrowing
  spellings, and the three trap cells — a body that ignores the loop var, one that passes it
  on, one that copies it — so a future half-fix cannot pass by moving only the noisy ones);
  `tests/cases/maps/nullable-list-valued-map.vl`;
  `tests/cases/maps/nullable-struct-list-valued-map.vl` (the fuzz case that filed the ordering
  hazard, flipped from `@emit-error` to `@run`);
  `tests/cases/maps/error-inline-null-compare-list-value.vl` and
  `tests/cases/maps/error-module-scope-list-value-read-bind.vl` (the two residuals, each
  naming its own non-nullable control and the rung they share — delete them together).
* **The §1 `loopvar` and `mapval` rows predate this close** and still carry the pre-fix numbers
  (`loopvar` 470/780 correct, silent 0; `mapval` 460/822, silent 0). Both understate `correct`,
  and the `loopvar` one understates SILENT by the trap cells above; re-run the sweep before
  quoting either.
* **This was never D14 and never f32-specific.** When D14 closed, `list_f32` reached exact
  parity with `list_f64` — 0 differing cells of 340 — and the cells that stayed loud stayed
  loud in BOTH.

---

### D21 — an UN-ANNOTATED captured local loses its `| null` for EVERY nullable rep
**CLOSED 2026-08-26 (#1935) — the repro now RUNS. Was: loud emit reject · 168 of a 728-cell capture population · filed 2026-08-25 while closing D9, because D9's fix reaches every capture form EXCEPT this one**

Repro:

    function mk(): i32[] | null { return [1, 2] }
    function body() {
      const v = mk()
      function inner() { if v != null { print(v.length) } else { print("N") } }
      inner()
    }
    body()
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls, both correct: the same capture with the local ANNOTATED (`const v: i32[] | null =
mk()`); and the same un-annotated local read UNCAPTURED.

**IT IS NOT A REP AXIS — IT IS THE ANNOTATION.** Measured over four capture binding forms
(outer param / annotated local / un-annotated local / two frames deep) × thirteen reps × seven
narrowing constructs × two runtime inputs: after D9, the param / annotated-local / two-deep
forms are clean for every rep the compiler otherwise supports, and the un-annotated form is
loud for **every rep except plain `S`** — including `i32[] | null` and `S[] | null`, the two
that were D9's own working controls. 168 of 728, 14 per rep, flat.

The site: `captureValKind` types an ANNOTATED env field through `vtKindOfType(annotation)` and
an un-annotated one through `letInitCellKind`, whose ladder returns `map` / `nulstruct` /
`union` / the six non-null list kinds / `struct` / `list` / `str` / `i64` / `f32` / `f64` /
`closure` / `i32` — **no nullable kind but `nulstruct`**. So `const v = mk()` over a
`T | null`-returning call types the env field at the NON-NULL kind, `capturedKindOf` answers
the non-null kind to every classifier that asks, and the null test finds no nullable rep. That
is also why the row is loud rather than silent today: the field and the read agree, and they
are both wrong in the same direction.

**Do not fix it by widening `letInitCellKind` without measuring the other consumers.** It is
also `letCellKind`'s initializer arm, which feeds `criClassify` / `fnAssignRetKind` — and
`fnAssignKindGuard` right beside it already DECLINES `nulstr` / `nulclosure` / `nulmap` /
`nulreflist` at those consumers with a recorded reason per kind (a named `nulstr` there
converts a reject into a TRAP). A nullable kind admitted here has to be admitted at a
consumer's granularity, not the ladder's.

**HOW IT CLOSED (#1935), and the framing above that was half wrong.** It needed no design
change: `vl check` on `const v = mk(); print(v.length)` already reports `member access
'.length' on non-object i32[] | null`, so the checker knew the binding was nullable all
along, and the same un-annotated binding read UNCAPTURED already ran — `collectLocals`
handles it. The divergence was confined to the capture path and was a hand-copy that had
drifted, not a missing inference.

* **The arm diff, confirmed.** `collectLocals` (`emit_collect.vl:2454`) has eight nullable
  arms — `letNulLitUnion`, `letIsNulMap`, `letIsNulVariant`, `letIsNulRef`,
  `letIsNulListInfer`, `letNulScalarListKind`, `letIsNulRefArray`, `letIsNulClosure` /
  `letInfersNulClosure`, `letIsNulString`, `letNulBool` — plus the bare-map-read family
  (`letNulMapReadValKind` / `letNulMapReadUnionBox`). `letInitCellKind` had ONE
  (`letIsNulRef` → `nulstruct`). "Loud for every rep except plain `S`" and "the only
  nullable arm is `nulstruct`" are the same fact.
* **Fixed in two commits.** (1) `captureValKind` / `captureValStructIdx` were handing the
  `letIs*` family an `fnStmts` POSITION where it wants an ARENA index — filed in
  `captureValKind`'s own header, byte-neutral over 1825 corpus programs, and it had to land
  first because widening the ladder is what makes the mismatch live. (2) the ladder widened
  arm for arm to `collectLocals`, `captureValStructIdx`'s companion-index ladder widened to
  match, and `fnAssignKindGuard` lost its `variant` decline.
* **Both halves of the KIND/SLOT pair were needed.** With the kind arm alone, the
  `S[] | null` capture moved from one loud message (`bare null needs a struct-typed
  context`) to another (`ref valtype with no interned shape`), because
  `captureValStructIdx` had no `letIsNulRefArray` arm and answered slot -1.
* **The guard question, measured rather than reasoned.** Over a 432-cell implicit-return
  assignment grid (20 reps × 4 assignment shapes × 2–3 consumption modes × 2 inputs): 32
  cells moved, ALL improvements, 0 regressions. The only new decline decision that mattered
  ran the other way — `variant` was DECLINED and had to stop being, because `null` from that
  guard restores the `i32` default and an `i32` result valtype under a body pushing a
  `(ref $uVarHeap[vi])` is check-clean INVALID WASM. Four `variantann` cells were exactly
  that on master and are a loud emit reject now, pinned as
  `tests/cases/functions/tail-assign-variant-cell-reject.vl`. The `nulstr` decline, newly
  REACHED from the un-annotated local, delivered what it promised: 12 cells to `runs`.
* **The capture population after the fix: perfect annotation parity.** All four binding
  forms score identically — **180 `runs` / 0 loud emit reject / 2 loud check reject of 182
  each**, 140 cells moved and every one `loud emit reject → runs`. The only residual in the
  whole 728-cell grid is 8 cells: `match` over a literal-member union, a checker limitation,
  flat across all four forms and so not an annotation axis at all.
* **THE `nulvariant` RESIDUAL CLOSED, AND IT TOOK BOTH FIXES — measured, not assumed.** When
  this row was first written the residual was 14 per form at `Circle | null`, attributed to
  the D22–D24 call-boundary class rather than to the annotation axis. #1937 closed that class.
  Re-run on the merged base, the un-annotated `nulvariant` cells are a 2x2 over the two
  branches:

      neither fix   (master ea8e59aa)     14 cells loud emit reject
      D21 fix only  (branch pre-#1937)    14 cells loud emit reject
      #1937 only    (master 2788d76f)     14 cells loud emit reject
      BOTH          (branch merged)       14 cells RUN

  Neither fix alone moves a single one of them. The nullable-variant NICHE is resolved by the
  call-boundary ladders #1937 repaired, and reaching those ladders at all needs the capture
  ladder this row repairs — so the attribution was right and the two changes compose exactly.
  Pinned at the foot of `capture-unannotated-nullable-reps.vl`, where deleting either half
  restores `bare null needs a struct-typed context`.
* **No collateral.** Re-measured against each master this branch was merged onto; on
  `2788d76f` the figure is in the commit that merged it. Every corpus program that compiles
  under both seeds is BYTE-IDENTICAL under both; the only files that differ are the fixtures
  this change adds.
* Pins: `tests/cases/closures/capture-unannotated-nullable-reps.vl` (nine reps that moved,
  `Circle | null` for the two-fix composition above, and `S | null` — the one that already
  worked — kept as the control that a future half-fix cannot pass on alone) and `tests/cases/functions/tail-assign-variant-cell-reject.vl`.
  `tests/cases/closures/capture-nullable-niche-storage-class.vl` is the ANNOTATED control
  the first is measured against — the two must not diverge again.
* **WHAT THE `variant` RESULT OPENED, filed as D27 / D28 / D29 — ALL THREE CLOSED 2026-08-26
  (#1938).** Lifting that decline proved `fnAssignKindGuard`'s `null` is not a no-answer but
  an `i32`. The four SURVIVING declines were then each lifted ALONE over a 192-cell grid that
  is identical on master and on this branch: **all 76 of its check-clean-invalid-wasm cells
  are caused by a decline**, 70 becoming correct programs and 6 a trap, 0 backward. Four of
  the five recorded reasons are refuted by that measurement. The fifth (`nulstr`) survived
  THIS grid and did not survive the next one: its "the recover is UNCONDITIONAL" premise was
  false — the recover is gated on `nulStrReadStaysRaw`, and the missing condition was that the
  implicit-return-assignment position never declared itself a nullable-string target. The
  guard is now DELETED outright, not shortened.

---

### D22 — [CLOSED 2026-08-26] an object LITERAL as the argument to a `Circle | null` parameter is boxed into a niche slot
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · filed 2026-08-26 while fixing the call-argument non-null recover ladder · pre-existing, measured against master's published `seed-latest` (identical rejection, identical byte offset 252)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    export function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function go(v: Circle | null) {
      if v is Circle { return v.r }
      return -1
    }
    print(go(null))
    print(go({ r: 3 }))
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref null $type), found (ref $type)

Control — a `null` argument to the SAME parameter, and the SAME literal to a `Shape`
parameter, both run. It is the third combination that has no arm:

    print(go(null))          // fine — the niche's `ref.null` seed
    print(area({ r: 3 }))    // fine — a `Shape` param genuinely wants the box

* **THE MECHANISM IS THE BOX, NOT THE NULL.** `Circle | null` is the `nulvariant` NICHE — one
  non-null member, so no `{tag, value}` allocation — but an object literal in that argument
  position takes the union-BOX path because the program declares a union at all, and emits
  `struct.new $Circle ; struct.new $unionBox` into a slot typed `(ref null $Circle)`. The two
  `$type`s in the message are different heap types; the disassembler prints both by the same
  placeholder, which is why it reads like a nullability complaint and is not one.
* **IT WAS MASKED.** The same file's narrowed-`Circle | null` pass-through failed FIRST, in an
  earlier function, so the module never reached this one. Only fixing the narrow half surfaced
  it — the reason a grid takes the whole cross product instead of stopping at the first red
  cell.
* Pinned as `tests/cases/soundness/xfail-miscompile-nulvariant-literal-arg.vl`, which was also
  `tests/vl_check_codegen_test.ts`'s live `INVALID_MODULE_SRC` specimen.

**CLOSED 2026-08-26.** The ARGUMENT position never learned the niche's non-null half. The LET
position seeds the variant index from its annotation (`letAnnVariantIdx`) and the RETURN
position seeds the identical pair (`retNulVariantFlag` + `nulVariantIndexOf`); `emitDirectCall`
had only the null half (`cParamNulVariantHeap`, armed for a bare `null` argument), so an object
literal fell to `emitObj`'s union-program default. `cParamNulVariantIdx` is the third rung of
that pairing, seeded exactly as the kind-8 `cVi` seed beside it is.

The grid found the SAME root at one more position, and it is fixed here too: a local
ASSIGNMENT (`let c: Circle | null = null; c = { r: 5 }`) had no niche seed at all, while the
DECLARATION of the same binding did — two spellings of one binding disagreeing.

Graduated to `tests/cases/soundness/nulvariant-call-boundary.vl` (`@run`, 9 cells), which also
carries D24's direction. The xfail is deleted and `INVALID_MODULE_SRC` now names D25 below.

---

### D23 — [CLOSED 2026-08-26] a monomorphized parameter's rep pin answers `i32` for a narrowed nullable ref
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · 8 of a 192-cell call-argument grid · filed 2026-08-26 beside D22 · pre-existing, measured against master's published `seed-latest` (identical rejection, identical byte offset 235)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    export function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function useGen<T>(x: T, k: i32): i32 {
      return k
    }
    function go(v: Circle | null) {
      if v is Circle { return useGen(v, 7) }
      return -1
    }
    print(go(null))
    // vl check rc 0 (one unused-parameter warning); the engine refuses the module:
    //   type mismatch: expected i32, found (ref null $type)

Control — the SAME call against a NON-generic callee runs, and that is the whole difference:

    function useIt(x: Circle, k: i32): i32 { return k }
    function go2(v: Circle | null) {
      if v is Circle { return useIt(v, 7) }
      return -1
    }

* **A DIFFERENT ROOT FROM THE NON-GENERIC TWIN, AND THE MESSAGE SAYS SO.** The non-generic
  spelling reported `expected (ref $type), found (ref null $type)` — a missing coercion at a
  correctly-typed parameter, fixed by giving the call-argument recover ladder its `closure` and
  `variant` arms. This one reports `expected i32`: the monomorphizer's argument-type pin never
  learned the `nulvariant` rep, its cascade fell through to the catch-all, and the INSTANCE was
  emitted with an `i32` parameter. No coercion bridges that; the instance itself is wrong.
* **THE CATCH-ALL IS THE DEFECT, NOT THE MISSING ARM.** A cascade that answers `i32` when it
  does not recognise a rep will always mint a wrong instance silently; one that answers "no"
  gets the honest emit refusal the `readFile`-shaped `u8[]` spelling already produced. The
  same catch-all is what made a `u8[]` receiver pick the i32-list wrapper.
* **8 cells, and they are exactly the generic half of two reps**: `nulvariant` at direct /
  binding / nested delivery, and `nulreflist` reached through a struct FIELD read, each under
  both `is` and `!= null`. The other 184 cells of that grid run.
* Not pinned in the corpus: an `@error`/`@run` row cannot express "check-clean invalid module",
  and the class already has its live specimen in D22.

**CLOSED 2026-08-26, and the filing under-counted it.** A 26-cell rep grid over one
`dstGen<T>(x: T, k: i32)` destination found **7** silent cells, not 4: the three `nulvariant`
deliveries and the `nulreflist` field read as filed, the two `u8[]` spellings the row's own
prose predicted — and **the NON-NULL `variant` itself**, which the filing does not mention.
`x: Circle` handed to a generic was `vl check` rc 0 and `expected i32, found (ref $type)`.

The fix is the row's own diagnosis taken literally, in two parts:

* **A pin for the reps that have one.** `monoAnnPinName` claimed a struct, a union, the
  composite-list / scalar spellings and the nullable form of each, and NOT a declared union
  ARM — `isSName` declines a variant by construction (a variant has no struct row). One arm
  (`variantIndexOf(name) >= 0`) covers `Circle`, and because `monoNulAnnName` delegates its
  base to that same ladder, `Circle | null` comes with it. 4 cells → **runs**.
* **A FLOOR for the reps that do not**, because the catch-all is the defect: `""` fails the
  call loudly (`monomorphize: unsupported argument type for …`) instead of minting an i32
  instance over a `(ref …)`. Three floors, each measured silent-wrong first —
  `exprNullableVariant`, `exprNullableRefArray`, `exprU8Array` — plus the propagation of `""`
  through the un-annotated-let arm, without which `const xs = o.xs` re-entered the catch-all
  one binding later. 3 cells → **loud emit reject**.

  Deliberately narrow: the other nullable niches (`nullist`, `nulmap`, `nulstr`, `nulclosure`,
  the scalar lists, `boolean | null`) were measured RUNNING through the annotation channels,
  and a floor can only fire where the answer would have been `"i32"` — so an unmeasured
  widening could turn a working cell loud. D-SHAPEFIELD's rule, one ladder over.

Graduated to `tests/cases/soundness/nulvariant-generic-pin.vl` (`@run`); the two floors are
pinned as `…/error-generic-nulreflist-field-pin.vl` and `…/error-generic-u8-list-pin.vl`.

---

### D24 — [CLOSED 2026-08-26] a narrowed nullable union ARM handed to a UNION parameter is passed raw, never boxed
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · filed 2026-08-26 by the std review of the commit that retired the narrowed-callback carve-out · pre-existing, measured against master's published `seed-latest` (identical rejection, identical byte offset)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function go(c: Circle | null) {
      if c is Circle { return area(c) }
      return -1
    }
    print(go({ r: 5 }))
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref $type), found (ref null $type)

Control — the SAME call with a NON-nullable `Circle` parameter boxes correctly and prints `5`:

    function go2(c: Circle) { return area(c) }
    print(go2({ r: 5 }))

* **THE ARGUMENT IS NOT BOXED AT ALL** — disassembled, `go` does `local.get 0 ; return_call
  $area` with no `struct.new $uBox` between them, handing a `(ref null $Circle)` niche to a
  parameter typed `(ref $uBox)`. So the message names a nullability mismatch and the defect is
  a missing BOX; the two `$type`s are different heap types.
* **IT IS NOT THE CALL-ARGUMENT RECOVER LADDER**, which is why fixing that ladder's `closure`
  and `variant` arms did not reach it. `emitDirectCall` routes a union-typed parameter through
  its own `cUNm != ""` branch to `emitUnionBoxArg`, which returns BEFORE the ladder's recovers
  run. Inside, `exprVariantIndex` answers -1 for a kind-19 `nulvariant` — it has arms for the
  kind-8 param, the declared local and the global, and none for the nullable niche — so the
  value falls through to `emitUnionCoerce` and is passed through raw.
* **THE FIX NEEDS AN ARM-FOR-ARM TWIN, not a one-arm patch.** `exprNullableVariant` answers
  this question across param / declared-local / global / call-result / field / index arms; an
  `exprNulVariantIndex` that covers only the param arm would close the witness below and leave
  the rest, which is the diagonal-for-a-cross-product mistake this repo keeps paying for. That
  scoping is why this row is filed rather than fixed in the commit that found it.
* **REACHABLE THROUGH `std:array`**, which is why the module header names it: `reduce`'s
  `init: A` is the only generic non-array parameter in std, and `reduce([1, 2], bump, c)` with
  a narrowed `c` and a `Shape`-accumulating `bump` reproduces it while importing only std. A
  plain STRUCT accumulator in the same shape runs; the same narrowed variant as `indexOf`'s
  `needle` gets an honest emit refusal instead.

**CLOSED 2026-08-26, and THE TWIN WAS ALREADY WRITTEN.** The row asked for an
`exprNulVariantIndex` built arm for arm against `exprNullableVariant`; `nulVariantIdxOfExpr`
already existed and was that twin, three arms short and two arms divergent. Completing it beat
minting a second home for one question, and completing it was the fix:

| `exprNullableVariant` arm | `nulVariantIdxOfExpr` before | after |
|---|---|---|
| `exprIx < 0` → false | -1 | unchanged |
| `Paren` → recurse | recurse | unchanged |
| `AsExpr` → `retNulVariantFlag(exprIx)` | `variantIndexOf(e.asTy)` — a NAME test that also answered for a NON-null `as Circle` | `nulVariantIndexOf(exprIx)`, the arena rung the flag IS |
| `Call`, `Ident` callee | `cloRetValSlot(cfe)` UNGATED — polymorphic over five kinds, so a `: P \| null` callee's STRUCT row came back as a variant index | gated on `cloRetValKind(cfe) == "nulvariant"` |
| `Call`, closure-VALUE callee (`calleeRetKindSid`) | **missing** | `calleeCloSigKeySid` + `sigKeyRetSlot`, gated on `sigKeyRetKind` |
| `Call`, `Member` callee | `cloRetValSlot(ffe)` ungated | gated on `cloRetValKind(ffe)` |
| `Ident` param | `nulVariantIndexOf(paramTypeNode(…))` | unchanged |
| `Ident` declared local | `localStructIdx[slot]` under `localIsRef` | unchanged |
| `Ident` CAPTURE | **missing** | `capturedNulVariantIdx`, the kind-gated reader on the companion-slot index space |
| `Ident` global | annotation, else recurse into the init | unchanged |

`emitUnionBoxArg` then gains one rung beside its `exprVariantIndex` rung, gated on the BOOLEAN
twin so the kind and the slot cannot come from different questions. The box's payload field is
`anyref`, so the niche rides it in the same three bytes the non-null variant ref does, and the
narrow that reached the position is what makes it sound.

**IT WAS NOT ONE POSITION.** A 20-cell POSITION grid (11 cells of this direction, 9 of D22's)
found the same missing box at every box-typed destination — the call argument, return,
annotated let, list element, `push`, map value, struct field, local assignment, if-expression
arm, nested argument, global cell. **10 of the 11** the `emitUnionBoxArg` rung fixed outright,
because they already route through it. The ELEVENTH — a struct FIELD — did not: the three
code-16 field sites (construct at `wasmEmit.vl:1274`, variant payload at `:1864`, field store
at `:13800`) called `emitUnionCoerce` directly, and a field cell IS the `(ref $uBox)`, so all
three now use the wrapper like every other box-typed position. That also fixed the NON-NULL
variant into a struct field, which was broken in the same way and is not a nullable question
at all (grid cell `variantIntoField`).

**AND ONE MORE STORAGE CLASS.** `exprVariantIndex` — the non-null twin — had param / declared /
global legs and no CAPTURE leg, while `captureValKind` types a `v: Circle` env field "variant"
and `captureValStructIdx` banks the index beside it. A captured variant handed to a union
parameter was never boxed, in the named-nested and the lambda spelling alike. `capturedVariantIndex`
is that reader, beside the `nulvariant` one the twin table above adds.

Graduated to `tests/cases/soundness/nulvariant-call-boundary.vl` (`@run`, 9 cells) together
with D22. `std/array.vl`'s live-`reduce`-cell paragraph is retired.

---

### D25 — [CLOSED 2026-08-26] a NARROWED argument's type does not ride the monomorphization pin
**CLOSED 2026-08-26 — the repro RUNS (prints 5). Was: check-clean invalid wasm · filed 2026-08-26 by the specimen hunt that followed D22/D23/D24 · pre-existing, measured ON THE FILED FILE against the parent commit (rc 0 / rc 1 there too, with the pin's older `expected (ref $type), found i32`)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    export function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function idg<T>(x: T): T {
      return x
    }
    function mkc(): Circle | null {
      return { r: 5 }
    }
    function go(c: Circle | null) {
      if c is Circle { return area(idg(c)) }
      return -1
    }
    print(go(mkc()))
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref $type), found (ref null $type)

Control — the same round trip on a NON-nullable variant runs and prints 5, and so does the
same narrowed value handed to a generic that does not return it (`dstGen<T>(x: T, k: i32)`):

    function go2(v: Circle) { return area(idg(v)) }     // prints 5
    function go3(c: Circle | null) {
      if c is Circle { return dstGen(c, 7) }            // prints 7
      return -1
    }

* **TWO CHANNELS, ONE CALL, TWO ANSWERS.** Inside `if c is Circle` the checker types `c` as
  `Circle`. The monomorphizer's argument pin reads the PARAMETER's declared annotation, which
  is still `Circle | null`, so the instance is minted `(x: Circle | null): Circle | null` —
  correct for the question it was asked. The value coming back therefore keeps the niche's
  `(ref null $uVarHeap[vi])` valtype while the checker has already typed the expression
  `Circle` and `area`'s parameter wants the `(ref $uBox)`.
* **IT IS NOT A MISSING ARM, which is why it is filed rather than fixed beside D22/D23/D24.**
  Those three are each "what rep does this position want, and does the classifier deciding
  know about the niche". This one needs a RULING on which channel owns a narrowed argument's
  type — the annotation the pin ladder trusts everywhere else (because mid-mono every `expr*`
  classifier is blind: `buildLocals` has not run), or the checker's recorded type on the
  argument NODE, which knows the narrow but is unreliable for the shapes the annotation arms
  exist to cover. Only the generic RESULT positions can see the difference; a pin whose type
  parameter does not appear in the result is unaffected, which is why the `dstGen` control runs.
* **THE FAILURE MOVED WHEN D23 CLOSED, THE OUTCOME DID NOT.** On the parent commit the same
  file is `vl check` rc 0 and `expected (ref $type), found i32` at offset 0xe3 — the pin's old
  `T := i32` answer. On this commit it is rc 0 and `expected (ref $type), found (ref null
  $type)` at 0xe4. Same cell, same silence, one rung along.
* Pinned as `tests/cases/soundness/xfail-miscompile-generic-roundtrip-nulvariant.vl` and it is
  `tests/vl_check_codegen_test.ts`'s live `INVALID_MODULE_SRC` specimen — the ninth.

**CLOSED 2026-08-26, AND THE RULING IS IN `DECISIONS.md`** ("which channel owns a NARROWED
argument's type at a monomorphization pin"). Read it there; what belongs here is the size of
the row and what it cost to grade.

**THE ROW NAMED ONE CELL AND THE GRID FOUND 53.** A 187-cell grid over generic-call shapes —
type parameter in the result vs not · `is` / `!= null` / no narrow · fifteen argument reps ·
six deliveries · four callee shapes — graded on the real outcome vocabulary:

| | runs | loud check | loud emit | check-clean INVALID WASM | blockers (loud→silent) |
|---|---|---|---|---|---|
| master | 94 | 33 | 7 | **53** | — |
| (a) the annotation owns it | 134 | 33 | 12 | **8** | 0 |
| (b) the argument node owns it | 98 | 33 | 10 | **46** | **6** |
| (c) shipped | **146** | 33 | 8 | **0** | 0 |

* **THE `nulvariant` NICHE IS NOT THE AXIS.** `P | null`, `P[] | null`, `i32[] | null`,
  `string | null`, `i32 | null`, `f64 | null`, `{[K]:V} | null` and a nullable CLOSURE all sit
  in the same 53, and so does a shape with no nullability at all: a `Shape` PARAMETER narrowed
  to the ARM `Circle` (`expected (ref $type), found (ref $type)` — the union BOX against the
  variant row).
* **IT WAS AN ORDER DEPENDENCE.** The registry is keyed on the pin NAMES; the RESULT was
  substituted through the argument NODE's arena row, which the key does not carry. One
  program, two function declarations swapped, nothing else changed: wide-call-first RUNS,
  narrow-call-first is check-clean invalid wasm. The `Circle | null` twin moves between
  running and a loud emit failure the same way. Both orders are in the graduated fixture.
* **OPTION (b) IS DISQUALIFIED BY MEASUREMENT, NOT BY TASTE** — 6 cells loud→silent, which is
  the blocker rule, plus 21 `runs`→invalid-wasm. Its breakage is exactly where this row
  warned the node type is unreliable: a literal union's render softens to `string`, a nominal
  `P` renders `{r:i32}`, a closure renders an arrow where the pin needs a `$fnsig` marker.
* **WHAT SHIPPED IS TWO RUNGS**: the instance's RESULT substitutes through the same column its
  parameter slot and body bindings take (so an instance is a function of its key), and a
  narrowed argument pins the NARROWED spelling where that spelling is a top-level MEMBER of
  the annotation's own union/nullable spelling and `monoAnnPinName` echoes it back unchanged.
  The membership gate is what admits the narrow and excludes (b)'s breakage by construction.
* **THE SAFETY PROPERTY WAS MEASURED, NOT ASSUMED.** A pin becomes the instance's parameter
  annotation, so the question is whether a NON-generic function with that annotation already
  lowers the same program. `function takeN(x: N): N` called with a `W` value narrowed to `N`
  RUNS ON MASTER for all ten reps in the grid — the call boundary emits the `ref.as_non_null`
  and the result is boxed for a union consumer. Pinning the WIDE spelling is equally legal and
  lands the RESULT off that path, which is the whole of option (a)'s residue.
* **FIVE CELLS ARE NOW LOUD RATHER THAN RUNNING**, and that is the intended floor: a narrowed
  `P[] | null` and a narrowed nullable CLOSURE whose generic RESULT is then indexed / called
  give `emitProgram: field access receiver is not a struct` and `emitProgram: callee is not a
  function name`. Both were check-clean invalid wasm before.
* **IT ROUTED A CORPUS CONTROL ONTO A SEPARATE ROOT, WHICH IS FILED AS D31 AND FIXED IN THE
  SAME COMMIT.** Closing the pin put `generics/mono-nullable-arg-pin.vl`'s own `narrowed`
  control on a generics-free master defect — a call ARGUMENT inheriting the enclosing
  RETURN's nullable expectation. The two are independent (D31's witness has no generic in
  it) and neither closes the other; they ship together only because the corpus reaches D31
  through D25's fix.
* **RE-MEASURED ON `d26c4421`** after #1938 closed D27/D28/D29 by deleting `fnAssignKindGuard`,
  since that change touched `wasmEmit.vl`'s nullable-string return seeding, which is adjacent
  to D31's fix. The whole 187-cell grid is **byte-identical at both baselines**: 53 silent on
  `c99838a8` and 53 silent on `d26c4421`, 0 cells moved between them, and 0 silent with the
  fix at either. The five loud-floor cells below are the same five, with the same messages.
* Retired: `xfail-miscompile-generic-roundtrip-nulvariant.vl`. Graduated:
  `tests/cases/soundness/generic-narrowed-arg-pin.vl` (24 cells). `INVALID_MODULE_SRC` moved
  to D26 — see that row.

---

### D26 — [CLOSED 2026-08-26] a UNION accumulator and a MEMBER-STRUCT accumulator, two `reduce` instances in one program
**check-clean invalid wasm · filed 2026-08-26 by the `std-api-reviewer` pass over the D24 retirement, which went looking for the CROSS cell the retirement's own pin did not have · pre-existing, measured on this exact file against master's compiler (identical rejection, identical offset 0x29e) · CLOSED by retiring `letInitReboxesToVariant`, whose heap comparison read a VARIANT index through the STRUCT table**

Repro:

    import { reduce } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function bumpC(acc: Circle, x: i32): Circle { return { r: acc.r + x } }
    function bump(acc: Shape, x: i32): Shape {
      if acc is Circle { return { r: acc.r + x } }
      return acc
    }
    function circleFold(): i32 {
      const c: Circle = { r: 5 }
      const out = reduce([1, 2], bumpC, c)
      return out.r
    }
    function shapeFold(): i32 {
      const s: Shape = { r: 1 }
      const out = reduce([1, 2], bump, s)
      if out is Circle { return out.r }
      return -2
    }
    print(circleFold())
    print(shapeFold())
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   wasm[0]::function[16]::circleFold$m0 … type mismatch: expected (ref $type), found (ref $type)

Controls, all of which RUN — the reviewer's own axis table, each cell executed:

* either accumulator ALONE (`circleFold` without `shapeFold`, or the reverse);
* two DISTINCT struct accumulators (`Circle` + `Sq`) with no union in the program;
* the union accumulator beside a NON-MEMBER struct accumulator (`Other`);
* the same pair with the member-struct result taken as `return reduce(…).r` instead of
  through a `const out` binding.

* **NO NARROWING AND NO NULLABILITY ANYWHERE**, which is what separates it from D22/D23/D24
  (all three need the `nulvariant` niche) and from D25 (which needs a narrowed argument
  riding a generic RESULT). It is the heap-type TWIN at a monomorphized instance's RESULT,
  and the disassembly says so rather than the message shape — `wasm-tools print` of
  `circleFold`:

      (func (;16;) (type 14) (param structref) (result i32)
        (local (ref 2) (ref 0) (ref 9))     ;; local 1 = the Circle VALUE, local 2 = `out`
        i32.const 5
        struct.new 2                        ;; the literal builds heap type 2
        local.set 1
        …
        call 8                              ;; the A = Circle instance: (ref 2) -> (ref 2)
        local.set 2                         ;; …into a local DECLARED (ref 0)
        local.get 2
        struct.get 0 0                      ;; and read back through heap type 0

  Types 0 and 2 are both `(struct (field (mut i32)))` and are distinct heap types: the plain
  struct row (`sHeapIdx`) and the union-arm row (`uVarHeap`), which the two tables never
  cross-dedup. The instance's parameter, body and result agree with each other on `(ref 2)`;
  it is the `const out` BINDING's slot that resolved `Circle` through the other table. That
  is why the same call consumed inline (`return reduce(…).r`) runs — with no binding there is
  no second resolution to disagree with.
* **THE UNION HAS TO BE INSTANTIATED TOO.** With only the `Circle` instance the program
  runs; the union instance is what makes `Circle` resolve through `uVarHeap` at one end.
  This is precisely the interaction a single-instance grid cannot see, and it is the third
  time `std/array.vl`'s ledger has recorded a diagonal standing in for a cross product.
* **PINNED 2026-08-26, AND IT IS NOW THE LIVE SPECIMEN.** D25 closed, so this row inherited
  `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC` — the tenth. Its file is
  `tests/cases/soundness/xfail-miscompile-reduce-union-and-member-struct-accum.vl`
  (`@no-instantiate`), and the row was re-run verbatim against the D25 fix first: identical
  rejection, identical offset 0x29e, so the pin closure did not move it.
  `tests/cases/std/array-reduce-narrowed-variant-init.vl` instantiates `reduce` at four
  accumulator types on purpose and says in its header which fifth one is missing and why.

**CLOSED 2026-08-26.** The filed program above runs and prints `8` / `4`.

* **TWO CLAIMS IN THE FILING ARE OVERTURNED BY THE CLOSE, and the filed text is left standing
  above so the correction is legible.** (i) *"the two tables never cross-dedup"* is true but
  is NOT the mechanism — nothing here needed the two rows to merge; the defect is that ONE
  index was read through BOTH tables. (ii) *"THE UNION HAS TO BE INSTANTIATED TOO"* is an
  artifact of the witness. What is required is that `Circle` be a REGISTERED variant and that
  the struct table be non-empty; the union instance was merely how this program achieved the
  second. And *"not pinned in the corpus"* no longer holds — the LOUD spelling of the same
  root is an `@run` fixture, which is what made it pinnable.
* **IT IS NOT ABOUT `reduce`, NOT ABOUT THE MONOMORPHIZER, AND NOT ABOUT TWO INSTANCES.**
  The root is `letInitReboxesToVariant` (`compiler/emit_classify.vl`, #1010), the one
  predicate that can veto `letIsVariant`. It compared the two heap tables:

      const ssi = structIndexOfExpr(d.letInit, fnIx)
      if ssi < 0 || ssi >= sHeapIdx.length { return false }
      return sHeapIdx[ssi] != uVarHeap[vi]

  `structIndexOfExpr` hands back a **VARIANT** index for a variant-returning call —
  `fRetStructIdx` is the polymorphic companion slot (`emit_state`'s own header: *"also a
  union-VARIANT return's variant index"*), a `: Circle` annotation leaves `fRetKind` at
  `"i32"` (`retAnnKindChain`), and `fnRetStructIndexSid` reads the slot UN-GATED. So the
  comparison is mis-typed, and `ssi < sHeapIdx.length` is a **BOUNDS check, not a namespace
  check**. It declined every variant index only while the struct table was EMPTY — which is
  exactly a program whose object types are ALL union arms, because `collectS` skips a
  `TypeDecl` that `variantIndexOf` claims (`emit_collect.vl`). Add ONE standalone struct and
  the variant index lands in bounds and is read as `sHeapIdx[<variant index>]`.
* **MEASURED AT THE SITE**, with a probe printing the guard's own intermediates. On the filed
  program: `vi=0 ssi=0 sLen=2 uVarHeap[vi]=2 names=[0]{r:i32}@0[1]{s:i32}@1`. On the same
  program minus the union instance: `vi=0 ssi=0 sLen=0` — the bounds check declining. And
  with a `Pre = {p,q}` struct declared FIRST, so the anonymous row is index 1 while the
  variant index is 0: `ssi=0` — the answer really is in the VARIANT namespace, not the
  anonymous row's.
* **WHAT MADE THE STRUCT TABLE NON-EMPTY IN THE FILED PROGRAM.** `Circle`/`Sq` have no
  `sNames` row of their own. The two rows are ANONYMOUS inline shapes `{r:i32}` / `{s:i32}`,
  minted because the monomorphizer's instance annotation spells the union STRUCTURALLY: a
  chain probe caught `internShapeDeepTy` entered with
  `({r:i32}|{s:i32},i32)=>{r:i32}|{s:i32}` — the substituted `f: (A, T) => A` — whereupon
  `internFuncTypeShapesTy` split the composite union and interned each arm. That is why the
  row read as "needs a monomorphized generic": the generic is only how the struct table
  stops being empty. **One plain `type Pre = { p: i32, q: i32 }` is enough**, and then no
  generic is involved at all —
  `tests/cases/unions/unannotated-bind-variant-call-beside-plain-struct.vl`.
* **THE SAME ROOT IS LOUD OR SILENT DEPENDING ON WHICH ROW THE VARIANT INDEX LANDS ON.** If
  that row carries the field being read, the module emits and the engine refuses it (the
  filed cell); if it does not, `emitProgram: unknown struct field in field access` — the
  `umt` (union + member struct + a THIRD struct) eighth of the grid below.
* **THE GUARD CANNOT BE RIGHT FOR ANY ARM `exprVariantIndex` ANSWERS FROM**, which is why it
  is retired rather than re-typed. Every arm is REP-authoritative: `paramVariantIndex` /
  `declaredVariantIndex` / `capturedVariantIndex` / `globalVariantIndexSid` read the cell
  KIND; the `as` arm reads the cast the checker proved; the `Index` arm excludes a
  plain-struct element list by name; and the CALL arm is gated on `retVariantFlag` — *"the
  same predicate the callee's own functype result is emitted from"* — added in #1816 on
  2026-08-22, a MONTH after the guard landed (#1010, 2026-07-22). That gate is what makes
  the plain-struct twin the guard was written for (`mk3(): {a:i32,f:i32}`, #1005) answer -1
  at `exprVariantIndex` and stop reaching the guard at all.
* **MEASURED DEAD.** A probe firing only when the guard returns TRUE, over **all 2,254 (at the time)
  `tests/cases/*.vl`** and over the compiler's own module graph: **0 programs**. A second
  probe firing on every entry past `vi >= 0`: 12 corpus files, every one returning false —
  8 on `ssi < 0` and 4 on the empty-table bound (`types/variant-as-value.vl`,
  `unions/call-struct-arm-into-union-global-cell.vl`,
  `unions/declared-union-struct-arm-call-positions.vl`,
  `unions/inline-union-struct-arm-call-positions.vl`) — and `sHeapIdx[ssi]` out of range in
  all 12. The guard's only live effect was this defect. **AND FROM THE EMISSION SIDE**: of the
  2,256 `tests/cases/**/*.vl`, 1,832 compile under both master `7fe81e5b`'s seed and this
  one, and all 1,832 are BYTE-IDENTICAL — 0 differ, 0 lost the ability to compile, and exactly
  2 gained it (the two fixtures this close adds). Not one byte moves anywhere the guard was
  consulted.
* **GRID, 240 cells** (accumulator pairing x consumption x std-`reduce`/hand-written generic
  x declaration order x 2-or-3 instances), master vs branch:

  | | master `7fe81e5b` | branch |
  |---|---|---|
  | runs | 192 | **224** |
  | check-clean invalid wasm | 40 | **16** |
  | loud emit reject | 8 | **0** |
  | loud check reject / trap / wrong value | 0 | 0 |

  **32 cells moved, every one toward a better outcome; 0 moved backward** — 24
  `check-clean invalid wasm -> runs` (the `um`/`umt` `bind` and `pass` consumptions) and 8
  `loud emit reject -> runs` (`umt_bind`, where the row the variant index landed on had no
  such field). The axes agree
  with the filed controls: only the `um` / `umt` pairings ever failed (union + MEMBER
  struct), `std` and `own` are identical at 20/4/96 each — so it was never a std problem —
  and `fwd`/`rev` declaration order and 2-vs-3 instances are flat.
* **WHAT REMAINS: the 16 `list` cells, and they are a DIFFERENT RUNG** — D32 below. Storing
  the variant into a `Circle[]` resolves the ref-list ELEMENT heap through `rlElemStructRow`,
  whose canon-key rung (`repRowOfTyStruct`) bridges the variant's SHAPE onto a standalone
  struct row. Identical on master and on this branch (same 16 cells, same message),
  reachable with no generic at all, and chartered as ROADMAP repOf item (e).
* Pinned as `tests/cases/unions/unannotated-bind-variant-call-beside-plain-struct.vl` (the
  loud spelling, no generic, four consumptions) and as the fifth accumulator of
  `tests/cases/std/array-reduce-narrowed-variant-init.vl`, which its own header had reserved
  for this close.

---

### D27 — [CLOSED 2026-08-26] a `closure` cell at an implicit-return assignment: the guard declines, the result valtype falls back to `i32`
**CLOSED 2026-08-26 (#1938) — the repro RUNS. Was: check-clean invalid wasm · 18 of a 192-cell guard-decline grid, plus 16 of the 432-cell implicit-return assignment grid · filed 2026-08-26 while closing D21 · pre-existing, identical on master's `vl-compiler.wasm` and on D21's branch (same offset, same message)**

Repro:

    function mkF(): (i32) => i32 { return (x) => x + 1 }
    function mkG(): (i32) => i32 { return (x) => x + 5 }

    let g: (i32) => i32 = mkF()

    function f() {
      g = mkG()
    }

    f()
    print(0)
    // vl check rc 0 (one redundant-annotation hint); vl run:
    //   Invalid input WebAssembly code at offset 262:
    //   type mismatch: expected i32, found (ref $type)

Control — the SAME shape over a cell kind the guard does NOT decline (`struct` for
`closure`, the only change), correct:

    type S = { a: i32 }
    function mkS(v: i32): S { return { a: v } }

    let g: S = mkS(3)

    function f() {
      g = mkS(9)
    }

    f()
    print(0)
    // prints 0

Second control — the SAME program with an ANNOTATED return, correct. An annotation takes
`emit_sections`' `fn.fnRet >= 0` branch and the guard is never consulted:

    function f(): (i32) => i32 {
      g = mkG()
    }

* **THE `expected i32` IN THE MESSAGE IS THE GUARD'S OWN FALLBACK.** `fnAssignKindGuard`
  returns `null` for `closure`, `fnAssignRetKind` therefore answers "no kind", and
  `emit_sections`' inferred-return arm writes the `i32` default result valtype while the body
  pushes `(ref $cloStructIdx)`. The guard's header called `null` *"no answer, leave every
  classifier exactly as it was"*; it is not that. It is an answer, and the answer is `i32`.
* **MEASURED BY LIFTING THE ONE DECLINE.** With `if k == "closure"` removed from
  `fnAssignKindGuard` and NOTHING else changed, 18 of the 192 grid-3 cells move
  `check-clean invalid wasm → runs` and 0 move backward; in grid 2 the same single change
  moves 10 cells the same way. The decline is the cause, not an incidental bystander.
* **THE RECORDED REASON DOES NOT HOLD FOR THIS SHAPE.** It reads "`fnReturnsClosure` already
  owns the closure result at both functype producers, ahead of every kind this could supply".
  `fnReturnsClosure` owns a tail that IS a function value; this tail is an ASSIGNMENT, so
  nothing owns it and the decline hands the position to the `i32` default instead.
* **Flat on all four storage classes** — module global, parameter, annotated local,
  un-annotated local — and on both assignment shapes (`g = e`, `return (g = e)`), 16 cells.
  The `nulclosure` sibling adds 12 more with its own decline lifted, and 2 more cells filed
  under `nulclosure` in the grid are actually `closure` cells (their un-annotated initializer
  is non-null) and move with this one.
* **Varies on CONSUMPTION, and that is the silent/loud line**: with the result UNCONSUMED
  (`f()`) it is invalid wasm; with it bound and called (`const r = f()  print(r(4))`) it is a
  loud `emitProgram: call to unknown function` — a different, already-known gap. The
  unconsumed half is silent because the checker never types the result, so nothing downstream
  notices the disagreement.
* Not pinnable in the corpus AS FILED: an `@error`/`@run` row cannot express "check-clean
  invalid module". **THAT IS NO LONGER TRUE OF THIS ROW, AND THE PIN AND THE FIX ARE THE SAME
  CHANGE** — the cells RUN now, so `tests/cases/statements/tail-assign-cell-kinds.vl` holds
  them as an `@run` with real `@log` values. That fixture is check-clean invalid wasm on
  master (`type mismatch: expected i32, found (ref $type)`, offset 2241) and prints its ten
  lines on the branch.

**CLOSING EVIDENCE (#1938).** `fnAssignKindGuard` is DELETED, not shortened;
`fnAssignCellKind` answers each storage class directly. Three grids, master vs branch:

| grid | cells | silent (master) | silent (branch) | moved | backward |
|---|---|---|---|---|---|
| straight-line (`g = e` / `return (g = e)`) | 192 | 76 | **0** | 76 | 0 |
| if-arm join (both spellings) | 192 | 108 | 16 (D30) | 92 | 0 |
| lambda producer (`cloRetValKind`) | 144 | 44 | **0** | 52 | 0 |

Every one of the 220 moves is `check-clean invalid wasm → runs`, except 8 lambda cells that
went `check-clean invalid wasm → loud emit reject` (the closure-result consumption gap, which
is loud) and 8 that went `loud emit reject → runs`.

---

### D28 — [CLOSED 2026-08-26] a `map` / `nulmap` cell at an implicit-return assignment, same root as D27
**CLOSED 2026-08-26 (#1938) — the repro RUNS. Was: check-clean invalid wasm · 40 of a 192-cell guard-decline grid (32 `map`, 8 `nulmap`) · filed 2026-08-26 beside D27 · pre-existing, identical on master and on D21's branch**

Repro:

    function mkM(v: i32): {[string]: i32} {
      const m: {[string]: i32} = Map()
      m["a"] = v
      return m
    }

    let g: {[string]: i32} = mkM(3)

    function f() {
      return (g = mkM(9))
    }

    f()
    print(0)
    // vl check rc 0 (one redundant-annotation hint); vl run:
    //   Invalid input WebAssembly code at offset 1061:
    //   type mismatch: expected i32, found (ref $type)

Control — the SAME program with the straight-line tail spelling instead of
`return (g = …)`, the only change, correct:

    function f() {
      g = mkM(9)
    }
    // prints 0

* **SAME ROOT AS D27** — `fnAssignKindGuard` declines `map`, the result valtype falls back
  to `i32`, the body pushes `(ref $mapStruct)`. Lifting `if k == "map"` alone moves all 32
  `map` cells `check-clean invalid wasm → runs`, 0 backward; lifting `if k == "nulmap"` alone
  moves its 8 the same way. Neither lift disturbs the other's cells, which is what makes the
  attribution per-decline rather than shared.
* **THE RECORDED REASON WAS TESTED ON THE SHAPE IT NAMES, AND IT DOES NOT HOLD.** The guard
  says the `map` arm "reads the SHAPE off the return EXPRESSION (`mapRetExprShape` over
  `fnRetExprOf`), which for this shape is the assignment node, not a map expression", which
  would only have a slot to get wrong for a REF-VALUED map (a mono map's shape is -1). The
  grid carries both: `{[string]: i32}` (mono) and `{[string]: S}` (mv slot ≥ 0). **All 16
  cells of each move to `runs`.** The mv-slot hazard the reason describes is not reachable
  from this position.
* **The `map` half varies on the ASSIGNMENT SHAPE and not on the storage class**: the
  straight-line tail runs at all four classes and `return (g = e)` is invalid wasm at all
  four. The `nulmap` half varies on the VALUE instead — `g = null` is invalid wasm at all
  four classes while `g = mkN(true)` is a loud check reject (`'f' infers the nullable return
  type … not yet supported by codegen`). That second asymmetry is `fnAssignRetTargetName`'s
  own filed note about the checker typing `x = e` as `e`'s UN-coerced type: a `null` RHS
  types as `null` and slips past the gate that catches the nullable one.

**CLOSING EVIDENCE (#1938), AND THE HALF THE ROW DID NOT SEE.** The recorded reason named a
hazard ("a named kind whose companion slot cannot be minted from the same binding") that the
row then declared unreachable, on the strength of every `mapref` cell of the straight-line
grid moving to `runs`. It IS reachable — one storage class over. `cloRetValSlot` routes the
whole assignment-cell answer through `fnAssignRetSlot`, which answered `-1` for a map, so
naming the kind pointed a `{[string]: S}` LAMBDA cell at the MONO `$mapStruct`. Measured:
with the declines lifted and no slot arm, 8 cells of a 144-cell lambda-producer grid moved
`runs → check-clean invalid wasm` — the ONLY backward move of the whole change, and one no
grid in the filing covered. The straight-line grid is silent about it because
`mapRetExprShape` falls through to the assignment node's recorded type there and happens to
be right.

The fix is the missing payload column, not a re-decline: `fnAssignCellMapShape` answers the
cell's value shape per storage class (`letMapShapeOf` / `nulMapShapeOf` / `paramMapShape`),
`fnAssignRetSlot` returns it for `map` / `nulmap`, and `inferredRetMapSlot` is the one home
both the functype result (`emitFunctionSection`) and the in-body `Map()` seed
(`emitReturnValue`) read. With it, the lambda grid moves 52 cells forward and 0 backward.

---

### D29 — [CLOSED 2026-08-26] a `nulstr` cell at an implicit-return assignment: the one decline measurement CONFIRMS — and the premise UNDER it did not
**CLOSED 2026-08-26 (#1938) — the repro RUNS. Was: check-clean invalid wasm · 6 of a 192-cell guard-decline grid · filed 2026-08-26 beside D27 · pre-existing, identical on master and on D21's branch · NOT the same disposition as D27/D28**

Repro:

    let g: string | null = "hi"

    function f() {
      g = null
    }

    f()
    print(0)
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 256:
    //   type mismatch: expected i32, found (ref $type)

Control — the SAME program assigning a non-null value instead of `null`, the only change,
correct:

    function f() {
      g = "bye"
    }
    // prints 0

Second control — the SAME program with the annotation dropped, a loud CHECK reject
(`cannot assign null to string`), because the un-annotated cell is `str` and not `nulstr`.

* **THE MECHANISM IS D27's** — the guard declines `nulstr`, the result valtype falls back to
  `i32`. **THE DISPOSITION IS NOT.** Lifting `if k == "nulstr"` alone moves these 6 cells to
  `wasm trap: null reference`, not to `runs` — exactly what the guard's own comment predicts
  ("makes the module VALID and it then TRAPS on `g = null`"). Of the five surviving-decline
  experiments this is the only one whose recorded reason survived measurement.
* **BUT THE COMMENT MIS-NAMES WHAT IT PRESERVES.** It says the decline keeps "the loud
  invalid-wasm reject it is on master". Check-clean invalid wasm is a SILENT class by this
  document's vocabulary — `vl check` says rc 0 — so the decline is trading a loud runtime
  trap for a silent one, not a trap for a reject. Whether that is the right trade is a real
  question; the comment currently answers a different one.
* **THE ROOT IS NOT THE GUARD**, and the comment already says where it is: `emitIdentNode`'s
  kind-16 arm applies `ref.as_non_null` UNCONDITIONALLY, so a store-then-re-read of a
  `string | null` cell cannot be sound whatever the guard answers. Fixing that arm is what
  turns these 6 cells into `runs`; until then neither disposition is correct and the choice
  is between two failure classes.
* **Flat on the three ANNOTATED storage classes** (global, parameter, annotated local) × both
  assignment shapes, unconsumed. The un-annotated local is a loud check reject instead (see
  the second control), and every CONSUMED cell is a loud check reject.

**CLOSING EVIDENCE (#1938) — THE MEASUREMENT WAS RIGHT AND THE PREMISE UNDER IT WAS WRONG.**
Lifting the decline alone really does turn these 6 cells into `wasm trap: null reference`,
exactly as filed. But the reason that was the whole outcome — "`emitIdentNode`'s kind-16 arm
applies `ref.as_non_null` UNCONDITIONALLY" — is false at all three of its sites. Every one of
them reads

    if !nulStrReadStaysRaw() { … ref.as_non_null … }

and `nulStrReadStaysRaw()` is `pendingRawNullRead || pendingNulString`. The recover has been
conditional since the rule was written; what was missing is that the implicit-return
assignment position never declared itself a nullable-string TARGET, which is the second of the
two contexts the rule's own header names. So the choice this row framed — "fix the read rule
(bigger) or convert the silent outcome to a loud one" — had a third option that is smaller
than either: declare the context.

`emitReturnValue` now seeds `retNulString` from `fnAssignRetKind(fnPos)` — the SAME fact the
functype result valtype is minted from, beside the existing `inferNicheNullByName` niche seed
— so the re-read keeps the raw `(ref null $sTypeIdx)` the result declares. The READ RULE is
untouched, and so are its other consumers; the blast radius is one `if` reachable only for a
function whose implicit return is an assignment to a `string | null` cell.

Measured with everything else already in place (so this is the entry's own effect and not the
change's): straight-line grid 6 cells `check-clean invalid wasm → runs`, if-arm-join grid the
same 6, lambda grid 4, 0 backward in any of the three, and **no cell anywhere became a trap**.
Pinned by the `gs` row of `tests/cases/statements/tail-assign-cell-kinds.vl`.

---

### D30 — the CALLER's view of an inferred REF-VALUED map return from an if-arm tail assignment
**check-clean invalid wasm · 16 of a 192-cell if-arm-join grid · filed 2026-08-26 by the if-arm-join grid built to measure D27/D28/D29 · pre-existing (silent on master too, with the older `expected i32` message the guard's `i32` default produced)**

Repro:

    type S = { a: i32 }
    function mkR(v: i32): {[string]: S} {
      const m: {[string]: S} = Map()
      m["a"] = { a: v }
      return m
    }

    let g: {[string]: S} = mkR(3)
    let h: {[string]: S} = mkR(3)

    function f(c: boolean) {
      if c {
        g = mkR(9)
      } else {
        h = mkR(9)
      }
    }

    const r = f(true)
    print(r.size)
    // vl check rc 0 (two redundant-annotation hints); vl run:
    //   Invalid input WebAssembly code at offset 1171:
    //   type mismatch: expected (ref null $type), found (ref $type)

Control — the SAME program with a MONO value type (`{[string]: i32}`, and `m["a"] = v`), the
only change, correct — it prints 1.

Second control — the SAME program with the straight-line tail `g = mkR(9)` instead of the
tail `if`, the only change, correct.

Third control — the SAME program with the result UNCONSUMED (`f(true)` then `print(g.size)`),
the only change, correct.

* **THE CALLEE IS RIGHT AND THE CALLER IS WRONG.** #1938 gave the callee's result valtype its
  map SHAPE (`inferredRetMapSlot`, via `fnAssignRetSlot`), which is why the third control
  runs. The CALL SITE resolves the same function's map shape through `fnRetMapShapeSid`,
  whose un-annotated rung is `mapRetExprShape(fnRetExprOf(...))` — and `fnRetExprOf` reads the
  body's last STATEMENT, which for a tail `if` is not an expression at all. It answers -1, so
  `collectLocals` types the receiving `const r` at the MONO `$mapStruct` while the call pushes
  the ref-valued one. The straight-line control escapes because there `fnRetExprOf` IS the
  assignment node and `mapRetExprShape` falls through to its recorded type.
* **NOT A REGRESSION, and the message changed while the class did not.** Master rejects the
  same program at offset 1137 with `expected i32, found (ref $type)` — the decline's `i32`
  default — and the branch at 1171 with `expected (ref null $type), found (ref $type)`. Both
  are `vl check` rc 0 with a module the engine refuses.
* **THE OBVIOUS FIX IS A RECURSION HAZARD, WHICH IS WHY IT IS FILED RATHER THAN TAKEN.**
  Routing `fnRetMapShapeSid` through `inferredRetMapSlot` closes it, and opens the cycle
  `fnRetMapShapeSid → inferredRetMapSlot → fnAssignRetSlot → fnAssignCellMapShape →
  letMapShapeOf → mapShapeOfExpr → fnRetMapShapeSid`. An ANNOTATED cell short-circuits at
  `letMapShapeOf`'s annotation arm, but an un-annotated one whose initializer calls the very
  function being asked about does not: `let g = h()` beside `function h() { g = h() }` would
  recur without bound. The existing cycle through `mapRetExprShape` has no such leg. Needs a
  visited-set or a depth bound, which is a separate change with its own witness.

---

### D31 — [CLOSED 2026-08-26] a call ARGUMENT inherits the enclosing RETURN's nullable expectation
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · filed 2026-08-26 by D25's grid, which routed `generics/mono-nullable-arg-pin.vl`'s own `narrowed` control onto it · pre-existing, measured on this exact program against master's compiler**

Repro:

    function takeS(x: string): string { return x }
    function narrowed(x: string | null): string | null {
      if x != null { return takeS(x) }
      return null
    }
    print(1)
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref $type), found (ref null $type)

Control — the SAME call in the SAME function with a CONCRETE enclosing return, the only
change, and it prints `1`:

    function narrowed(x: string | null): string { … return "zz" }

Two more that run, isolating the axis: the call taken through a binding
(`const y = takeS(x); return y`), and the call not in return position (`return takeS(x).length`).

* **NO GENERICS ANYWHERE**, which is what separates it from D25. The callee is an ordinary
  function; the two boundaries are its PARAMETER and the CALLER's RETURN.
* **`expCtxHere()` SNAPSHOTS THE AMBIENT SEEDS.** `emitDirectCall` builds each argument's
  context from it, and at a `return f(x)` those seeds are the RETURN boundary's. The four
  nullable seeds were set only ever TO TRUE — `if cParamNulString { argCtx.nulString = true }`
  — never cleared, so a `string | null` RESULT expectation reached the ARGUMENT of a call whose
  parameter is a plain `string`, and the narrowed value kept its `(ref null $s)` rep under a
  `(ref $s)` param.
* **THE ONE-BIT DIFF IS THE WITNESS**, not an inference from the message: disassembled, the
  concrete-return control carries `local.get 0 ; ref.as_non_null ; return_call` and the filed
  shape carries `local.get 0 ; return_call`, on the same argument of the same call to the same
  function.
* **THE FIX IS ASSIGNMENT, NOT AN OR.** All four seeds (`nulBool`, `nulString`, `nulClosure`,
  `nulList`) now take the PARAMETER's answer and only the parameter's. The other four reps
  (`struct`, non-null list, `closure`, `variant`) already had their own explicit recover arms
  below; the seeded four had none because the seed was supposed to BE the answer.
* Graduated: `tests/cases/soundness/nullable-return-arg-seed.vl`. It reproduces on the parent
  commit and runs on this one.

---

### D32 — [CLOSED 2026-08-26] a `Circle[]` ref-list ELEMENT resolves its heap through the STRUCT table when a layout twin exists
**CLOSED 2026-08-26 — the repro now RUNS (prints `8` / `1` / `3`). Was: check-clean invalid wasm · found by D26's 240-cell grid (16 cells, the `list` consumption) · filed 2026-08-26 while closing D26 · pre-existing, identical on master (`c99838a8` and `7fe81e5b`) and on D26's branch — same 16 cells, same message · a DIFFERENT rung from D26 and unmoved by its fix**

Repro:

    type Dot = { r: i32 }
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function mkD(): Dot { return { r: 3 } }
    function useShape(): i32 {
      const s: Shape = { r: 1 }
      if s is Circle { return s.r }
      return -2
    }
    function circleList(): i32 {
      const c: Circle = { r: 8 }
      const xs: Circle[] = [c]
      return xs[0].r
    }
    print(circleList())
    print(useShape())
    print(mkD().r)
    // vl check rc 0 (four redundant-annotation HINTS, no error or warning); vl run:
    //   Invalid input WebAssembly code at offset 348:
    //   type mismatch: expected (ref null $type), found (ref $type)

Controls, each RUN:

* the same file with `Dot` DELETED — with no layout twin in `sNames` the element resolves
  through `uVarHeap`;
* the same file with `type Dot = { d: i32 }` (a struct that is NOT a layout twin);
* the same `Circle` value not put in a list (`return c.r` in place of the two list lines).

**AND THE TWIN DOES NOT HAVE TO BE THE CALLER'S OWN TYPE — ONE `std:array` CALL MINTS IT.**
This is the spelling a user meets, and it is why `std/array.vl`'s header names this row. There
is no `Dot`, no member-struct accumulator, and `circleList` calls no generic:

    import { reduce } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function bump(acc: Shape, x: i32): Shape {
      if acc is Circle { return { r: acc.r + x } }
      return acc
    }
    function shapeFold(): i32 {
      const s: Shape = { r: 1 }
      const out = reduce([1, 2], bump, s)
      if out is Circle { return out.r }
      return -2
    }
    function circleList(): i32 {
      const c: Circle = { r: 8 }
      const xs: Circle[] = [c]
      return xs[0].r
    }
    print(circleList())
    print(shapeFold())
    // vl check rc 0; vl run: Invalid input WebAssembly code at offset 687,
    //   type mismatch: expected (ref null $type), found (ref $type)

Control — **the same program with the one `reduce` call spelled as two direct `bump` calls**
(`const out = bump(bump(s, 1), 2)`), the only change: prints `8` / `4`. The monomorphized
`f: (A, T) => A` is the mint.

**EVERY `Circle[]` IN THE PROGRAM IS AFFECTED, not just a literal.** Measured on this branch
and on master, same program shape, only the list spelling varying:

| spelling | outcome |
|---|---|
| `const xs: Circle[] = [c]` | check-clean invalid wasm |
| `const xs: Circle[] = []` then `xs.push(c)` | check-clean invalid wasm |
| a `Circle[]` PARAMETER, called with the list | check-clean invalid wasm (`take$m0`) |
| a `Circle[]` STRUCT FIELD (`type Bag = { items: Circle[] }`) | check-clean invalid wasm |
| `const xs: Circle[] = []` never written | runs |
| **`const xs: Shape[] = [c]`, `is`-narrowed on read** | **runs — the remedy** |

* **THE PRODUCER AND THE CONSUMER DISAGREE, ARM FOR ARM.** The READ side
  (`exprVariantIndex`'s `Index` arm) resolves a `Cat[]` element through `uVarHeap` and gates
  on `structIndexByName(elemName) < 0` — an EXACT-NAME lookup, which `Circle` passes because
  a variant has no `sNames` row. The ELEMENT-HEAP side (`mAssignTypeIndices`' ref-pair loop
  in `emit_collect.vl`) tries `rlElemStructRow` FIRST and only falls through to
  `rlElemVariantHeap`; `rlElemStructRow`'s third rung is `repRowOfTyStruct`, the structural
  canon-key bridge, which returns `Dot`'s row. So the backing array is typed
  `(array (mut (ref null $Dot)))` while the value stored is `(ref $uVarHeap[Circle])`.
* **THE TWIN SIG PASS CARRIES THE SAME LADDER** (`rlSig`'s `else` arm) by design — its
  header says it "mirrors the `rlElemHeap` resolution below" — so a fix must move BOTH in
  lock-step or the dedup decision and the heap disagree.
* **DELIBERATELY NOT FIXED WITH D26.** Besides the two ref-pair-loop sites above,
  `rlElemStructRow` has SIX other call sites — `wasmEmit`'s element STORE (13564), PUSH
  (14215) and array-LITERAL (19787), `emit_classify`'s `rlSlotsLayoutTwin` (the ref-list
  slot dedup itself) and `structListPopGetElem` (`xs.pop()` / `xs.get(i)`) — and each would
  need the same gate, and `rlElemLitStructRow`'s header already records a MEASURED reason its own name
  rung is deliberately narrower ("changes the answer on 7 corpus calls and 311 fuzz
  programs — every one of them a both-decline today, i.e. exactly the -1 the variant route
  depends on"). This is the seam ROADMAP charters as repOf item (e), the variant/struct-table
  seam, whose LOUD half is already recorded there.

#### THE CLOSE — one predicate, read in two directions

`rlElemStructRow` now declines for an element name that is a registered union VARIANT and
not a registered plain struct:

    const ln = nonNulBaseOf(rlElemName[slot])
    const bn = structIndexByName(ln)
    if bn < 0 && variantIndexOf(ln) >= 0 { return -1 }   // <- added

That is the EXACT COMPLEMENT of the READ side's gate, which had stated the rule from the
consumer's end since the `{f: boolean}[]` fuzz finding: `exprVariantIndex`'s `Index` arm is
`if structIndexByName(ren) < 0 { return variantIndexOf(ren) }`. One predicate, two
directions — the array a `Cat[]` read unpacks through `uVarHeap` is now the array this side
types. Both of `mAssignTypeIndices`' passes ask the one function, so the SIG pass and the
HEAP pass moved in lock-step by construction; the six other `rlElemStructRow` consumers
(element STORE, PUSH, `__array_new__`, `rlSlotsLayoutTwin`) all treat -1 as "no struct hint",
which is already their default for every non-struct element kind.

**THE ANSWERING RUNG WAS MEASURED, NOT INFERRED.** A probe printing all three rungs at the
site, on the row's own filed program:

    ELEMROWPROBE slot=0 name=Circle arena=-1 byname=-1 canon=0 vi=0

Rungs 1 and 2 decline (a variant arm has no `sNames` row); rung 3 — `repRowOfTyStruct`, the
canon-key structural bridge — answers `Dot`'s row 0, while the variant table held the right
answer (`vi=0`) the whole time.

**THE DISASSEMBLY IS ONE TYPE INDEX.** `wasm-tools print` on the filed witness, master vs
this branch, everything else in `circleList` byte-for-byte identical:

    master   (type (;8;) (array (mut (ref null 0))))   ; 0 = Dot, the standalone row
    branch   (type (;8;) (array (mut (ref null 1))))   ; 1 = uVarHeap[Circle]

with `struct.new 1` pushing a `(ref 1)` into it in both — which is precisely the engine's
"expected (ref null $type), found (ref $type)", two DIFFERENT heap types behind one
placeholder.

**GRID — 480 cells, master `a80c6717` vs this branch.** Axes: twin presence (none / exact
layout twin / same-arity different-field-NAME / same-field different-TYPE / minted only by a
`std:array` generic instance) × consumption (element read / element written via `push` /
nested `Circle[][]` / map value / struct field / parameter / return / captured) ×
declaration order (4 placements of the twin block relative to the arms and the union) ×
arity (one twin / two twins / a twin that is itself an arm of a second union).

| | master | branch |
|---|---|---|
| runs | 280 | **420** |
| check-clean invalid wasm | 140 | **0** |
| loud check reject | 60 | 60 |
| loud emit reject / compiler trap / trap / wrong value | 0 | 0 |

**140 cells moved, every one `check-clean invalid wasm → runs`; 0 moved backward**, and the
branch has ZERO silent cells on the grid. The axes reproduce the filed controls exactly:

* **twin presence** — `exact` 56/96 and `stdmint` 84/96 fail on master; `namediff`,
  `typediff` and `notwin` are **0/96 each**. It is a LAYOUT bridge, not a name coincidence.
* **consumption** — 20/60 at each of the seven ref-list consumptions and **0/60 at the map
  VALUE**, which is a loud checker reject (``member access '.r' on non-object Circle | null``)
  identically on both sides. The 60 loud cells are the same 60 files in both baselines.
* **declaration order** — FLAT, 35/120 at each of the four orders. Unlike D1, order is not
  load-bearing here.
* **arity** — the cross-tab is the mechanism restated: `exact` fails at `one` 28/32 and
  `two` 28/32 but **`armtwin` 0/32**, because promoting `Dot` to an arm of a second union
  REMOVES its `sNames` row and so removes the very row the canon rung was finding. `stdmint`
  is 28/32 at all three, because the monomorphizer's anonymous `#anonN` row is not something
  a declaration can take away.

**CORPUS BYTE-IDENTITY.** 1,834 of the 2,258 `tests/cases/*.vl` compile under both master's
seed and this branch's, and all 1,834 are **BYTE-IDENTICAL**: 0 byte-different, 0 lost the
ability to compile, 0 gained it. The gate fires where the defect was and nowhere else.

Pinned as `tests/cases/unions/variant-element-list-beside-layout-twin.vl` (seven
consumptions, no import and no generic) and, for the `std:array` mint, by
`tests/cases/std/array-reduce-narrowed-variant-init.vl`.

#### THE CENSUS THE CLOSE OWED — one rung here, and a SECOND live rung at D26's source

D26 was a VARIANT index read through the STRUCT table. D32 is **not that mechanism**: no
index crosses a namespace here, a *lookup* does — a structural canon key resolving a nominal
question. Both are "asked the wrong table", at different rungs. Both patterns were swept:

* **`sHeapIdx[x] != uVarHeap[y]` comparisons** — three sites survive D26's deletion
  (`emit_classify.structIdxHasReboxVariant`, `wasmEmit`'s `emitUnionCoerce` rebox arm at
  ~4016, `wasmEmit.emitUnionBoxArg` at ~4458). All three are reachable, and two of them take
  their `ssi` from `structIndexOfExpr`.
* **`structIndexOfExpr`'s Call arm still reads the polymorphic slot UN-GATED.** D26 deleted
  the one bad CONSUMER; the PRODUCER is unchanged. `fRetStructIdx` holds four different
  namespaces by kind — a struct row (`struct`/`nulstruct`), a VARIANT index
  (`variant`/`nulvariant`, where `retAnnKindChain` leaves `fRetKind` at `"i32"`), a ref-list
  SLOT (`reflist`) and a map SHAPE (`map`) — and every other reader is kind-gated
  (`cloRetValSlot`'s two arms, `capturedVariantIndex`, the `fnsig` result at ~13073, whose
  comment says *"Kind-GATED like every other reader on the polymorphic companion slot"*).
  `fnRetStructIndexSid` was the one that was not.
* **MEASURED, not argued:** an in-compiler probe firing when `fnRetStructIndexSid` answers
  `>= 0` for a non-struct kind reaches **11 of the 2,258 corpus files** today —
  `soundness/call-result-union-arg.vl`, `soundness/call-result-union-binding.vl`,
  `std/array-reduce-narrowed-variant-init.vl`, `types/display-render-is-nominal.vl`,
  `types/variant-as-value.vl`, `unions/call-struct-arm-into-union-global-cell.vl`,
  `unions/declared-union-struct-arm-call-positions.vl`,
  `unions/inline-union-struct-arm-call-positions.vl`,
  `unions/inline-union-struct-arm-standalone-positions.vl`,
  `unions/unannotated-bind-variant-call-beside-plain-struct.vl` (D26's own pin) and
  `unions/variant-annotated-global-floor.vl`. Every one is a `: Circle`-annotated variant
  return whose VARIANT index is handed to `structIndexOfExpr`'s ~40 struct-namespace
  consumers. They all compile correctly today because each consumer happens to decline —
  which is exactly the state D26 was in until one consumer stopped declining.
* **The gate is in this change, and it is byte-neutral.** `fnRetStructIndexSid` now returns
  -1 unless `fRetKind` is `struct`/`nulstruct`. Measured over the same 2,258 files against
  the D32-fix-only compiler: 1,834 compile under both, **0 byte-different, 0 lost, 0
  gained**, and the 480-cell grid is identical (420/0/60). It is a HARDENING with zero
  observed behaviour change, not a fix for an observed defect — it removes the D26 mechanism
  at its source instead of at one consumer, and brings the last un-gated reader of the
  polymorphic slot in line with the convention the other four already state.

---

## 3. Shared-root analysis

### Root A — one floor, seven callers, four of which do not stand on it
**D3** (silent invalid wasm) and the loud `narrowed union binding is not a local or global`
family are the SAME decision site: `emitUnionBoxPush`, `compiler/wasmEmit.vl:3123`. Its
comment states the invariant it means to hold — *"a clean reject, not invalid wasm"* — and
the measurement says the invariant holds for three of the seven narrowing forms that reach
a captured box read (`is`, `match`, `??`) and fails for four (`!= null`, `== null`-else,
`&&`-guard, `while`-guard). The `null`-comparison forms narrow through a different
classifier that never consults the box path at all. **This is the highest-value grouping in
the inventory: one predicate away from turning 86 silent cells into 86 loud ones**, which is
strictly better even before anyone wires the capture.

Evidence that it is one root and not two: the loud and the silent forms are the same
program with one operator changed, on the same binding, at the same position, for the same
five reps; and the rep that is loud in ALL seven forms (`(string | i32) | null`) is exactly
the rep whose narrowed read has no second path.

### Root B — the map-view for-in lowering reads its receiver twice
**D2** (double evaluation) and **D5** (narrowed nullable map → invalid wasm) are the same
lowering. D2 shows the receiver expression is emitted twice; D5 shows that when the
receiver is a RECOVERED non-null temp, the second emission does not see the recover and
pushes the nullable wrapper. A single-emission receiver temp closes both. Both are specific
to `.keys()` / `.values()`: `.size`, index get, `.slice`, `.map`, `.filter` and a plain
list `for-in` are all correct at one evaluation (measured), so the shared site is the view
iterable, not for-in generally.

This grouping is the one to be most careful about, because the two rows have **no message
in common** — one has no message at all. They were grouped by the receiver-shape axis, not
by text.

### Root C — the forward reference, four consumers
**D1**'s four symptoms — a boolean printing `1`, a litunion printing its atom id, invalid
wasm, and `Type Ch1 is never` — are one unresolved field type read by four different
consumers (the print classifier, the atom widener, the emitter's field rep, the
never-folding check). The tell that it is one root is that swapping two declaration lines
fixes all four, and that the reps whose print is the DEFAULT classification are unaffected.

The `cannot assign {f: i32?} to 'w' of type {f: i32?}` message — a type reported as not
assignable to a type rendered identically — is the fifth consumer, the assignability check,
reached when the forward alias also carries `| null`. It is **158 cells**, and every one of
them is at (alias spelling, struct-field position), which is precisely the forward-declaration
axis: independent confirmation that Root C and this message are one site.

### Root D — "bare null needs a struct-typed context" is a GENERIC FALLTHROUGH and must not be used to group
192 cells carry that message across at least **three unrelated axes**: the capture storage
class (D9), the map-index-read nullable (D10), and a nullable-niche map VALUE type. They are
grouped here as three separate rows on purpose.

**BOTH DIRECTIONS OF THIS WARNING WERE RE-MEASURED WHILE CLOSING D9, AND ONE OF THE TWO
EXAMPLES ON THIS LINE WAS WRONG.**

* The one-axis-many-messages direction HOLDS and is now exact, not anecdotal: D9's single
  decision site (`emitNulIsNullTest`'s niche disjunction returning 0) reports `bare null
  needs a struct-typed context` from the `==`/`!=`/`while` callers, 96 cells, and `` `is`
  test but no union type declared`` from the `is`/`match` caller, 48 cells. One site, two
  messages, one fix, verified by an in-compiler probe at the site rather than by the text.
* **The example this paragraph used for it did NOT reproduce.** `S[] | null` at a capture
  does not report `ref valtype with no interned shape`: `exprNullableRefArray` already
  carried the capture arm, and that rep was CLEAN at the capture position before D9's fix as
  well as after. The claim was inherited, not re-run.
* The many-axes-one-message direction also holds and grew a live case: D20's `loopvar` leg
  carries D9's exact message from a DIFFERENT site (`forInElemKind`'s missing nullable arms).
  D9's fix moved 144 cells and 0 of them at `loopvar`, which is the cheapest possible proof
  that the two are not one root.

Message identity and root identity are independent in this compiler, in both directions —
and so is INHERITED evidence for either. Re-run the example before quoting it.

### Root E — the map-index read's implicit `T?` has no rep for the numeric reps
**[BOTH CLOSED — D10 by #1901/#1903/#1904, D6 on 2026-08-25.]**
**D6** (invalid wasm, numeric litunion) and **D10** (loud, `i32`/`i64`/`f64`/`f32`) are one
site with two severities. The evidence is the shared control: declaring the map's value type
as `T | null` fixes both, and `??`/`.values()` on the same map are correct in both. So the
defect is not the numeric rep and not the narrowing — it is that the type the index read
SYNTHESISES is not the type `T | null` interns to.

**THE GROUPING WAS RIGHT AND THE SAME RUNG CLOSED BOTH, one release apart, which is the
useful part of the record.** D10's fix (`emitMapGetScalarBox`) made the read's box
conditional on the probe; it then EXCLUDED the numeric litunion from its own predicate, on a
claim that a nullable numeric litunion rides the `-1` sentinel. It does not — the `-1` niche
is the STRING litunion's, whose rep is an interned atom ID with every negative spare, while a
numeric litunion reps as THE NUMBER and `1 | 2 | null` is the value-union box. Admitting the
family at the base scalar's atom is the whole of rung 1 of D6's fix. **The exclusion that
survives a fix is the part of it worth re-reading**: this one was written into three headers
and one corpus fixture, all four of which asserted the false half.

### Not shared, though it looks it
`f32[] | null` (D14) is NOT part of Root A or D despite also being a nullable niche: its
failure is in the typed-IR read path (`exprF32Array`, audit R2) and it failed at every
position including the ones where the other niches are clean. Filed separately — and
**CLOSED 2026-08-25** on its own, without touching either root, which is the separation
confirmed rather than merely asserted.

## 4. NOT A DEFECT

Everything in this section was probed on this tip and behaves correctly, is a documented
deliberate decline, or was **my own probe error**. It is here so no agent is spent on it.

### 4a. The orchestrator's stale list — every item confirmed WORKING

| shape | probe | result |
|---|---|---|
| a value-union box as a for-in LOOP VAR, narrowed by `is` | `for v in xs { if v is string … }` over `(string \| i32)[]` | `aa` / `7` — correct |
| `1 \| 2 \| null` with `if p != null` | `type N3 = 1 \| 2` ; param `N3 \| null` | `1` / `2` / `N` — correct |
| `.map`/`.filter` over `i32[] \| null`, and `boolean \| null` / `f64 \| null` reads | narrowed then `.map`, `.filter` | `2/2/true/1.25` and four `N` — correct |
| a litunion ATOM captured by a nested function, no narrowing | `type K4 = "p" \| "q"` ; capture `k` ; `print(k)` | `p` / `q` — correct |
| `let` + null initialiser + later `p = null` | `let p: string \| null = null` … `p = "aa"` … `p = null` | `true`/`aa`/`true` — correct |
| `mapkeys` over `boolean \| null` and `i32 \| null` map values | `for k in m.keys()` | `k`/`j`/`a` — correct |
| map-value reads with `is` and `!= null` | `{[string]: K \| null}` | `p`/`p` — correct **for this value rep**; see D10 for the numeric value rep, which is the live half |
| `exprIsF32` / `exprIsBool` member-union reads | `{a: f32, b: boolean}` reads | `true`/`true` — correct |

### 4b. Audit row R1 no longer reproduces
`per-rep-ladder-audit.md` R1 is filed as *"a DECLARED alias over a nullable niche … check-clean
INVALID WASM"* with this reaching program:

    type B = boolean | null
    const xs: B[] = [true, null]
    const a = xs[0]
    if a == null { print("N") } else { print(a) }

On this tip it prints `true` — **rc 0, correct, identical to the inline control**. The
alias-vs-inline axis was then measured properly (Leg E, 2,916 cells, 15 reps × 2 spellings ×
9 positions × 5 constructs × 2 inputs): the alias spelling has the **same** silent cell set
as inline (invalid wasm 4 vs 4 per numeric rep, 6 vs 6 for the numeric litunion) and **zero**
silent cells the inline spelling does not also have. What remains of R1 is LOUD: the alias
spelling loses 40–58 cells per construct to check rejects the inline spelling accepts, and
its most striking spelling is the forward-declaration case now filed as D1. **R1 as filed —
a silent alias/inline divergence — is closed; do not brief it.**

### 4c. Deliberate declines, confirmed by reading the message
* `print` of an un-narrowed nullable REF or numeric box — `print of {w: i32}? is type-valid
  but not yet supported by codegen — print the elements/fields individually`, and
  `print of a union value (i32?) … narrow it first`. Documented, helpful, and correct.
  470 cells of the sweep's loud check rejects are this.
* `print` of `string | null`, `boolean | null`, `K | null` **does** work and prints `null` —
  consistent with audit C4, and not to be confused with the above.
* `match` over a literal union — `match over a union with literal members is not supported —
  compare them with '==' in an if-chain`. 90 cells. Deliberate, names the fix.
* `?.length` / `?.size` on a nullable list/string/map — declines because `?.` reaches struct
  fields only. The message's "non-object" wording is filed under D12; the decline is not a
  defect.
* An i32-keyed Map/Set outside its supported positions — `emitProgram: an i32-keyed Map/Set
  is supported as a binding / parameter / return / '| null' / an ARRAY element`. A floor that
  names its own domain. (Its gap is the capture storage class, filed as D4.)

### 4d. MY OWN PROBE ERRORS — 136 cells of the sweep, excluded from every defect count
* **A nullable CLOSURE alias needs parentheses and my generator omitted them.**
  `type A = (i32) => i32 | null` parses as *a function returning `i32 | null`*, so 54 cells
  reported `return type mismatch: expected (i32) -> i32?, got null` and
  `cannot compare (i32) -> i32? with null`. The parenthesised form
  `type F = ((i32) => i32) | null` is **correct** (`print(src() == null)` → `true`;
  `if f != null { print(f(3)) }` → `4`). Had I filed the 54 cells I would have filed the
  parser's correct behaviour as a defect.
  **CORRECTION — the same probe error also hid 17 REAL silent cells, and they are now
  CLOSED.** The 54 cells above are the ones the unparenthesised spelling made LOUD. The
  residue — `read=call`, `con=is_t`, all seven positions, both the inline and the alias
  spelling — reached `vl check` rc 0 and a module that does not validate
  (`type mismatch: expected i32, found (ref $type)`), so it was never among the 136 and
  never in a defect count either. The mechanism is not the parse: `v is (i32) => i32` over
  a `v: (i32) => (i32 | null)` was gated on `assignable(tested, receiver)`, which accepts by
  RETURN COVARIANCE, so the THEN branch bound `v` at the unboxed-result type while the value
  repped boxed. A closure carries no runtime type tag, so the narrow could never have been
  true. `fnSlotAssignable` now enforces the rep invariance its own header already stated,
  all 17 cells grade `loud_check_reject`, and the `correct` column over the 322 closure
  cells is unchanged at 43. Pinned by
  `tests/cases/closures/error-is-functype-slot-rep-reject.vl` and — for the shape those
  cells were AIMED at, which works at every one of the seven positions —
  `tests/cases/closures/nullable-closure-is-narrow-positions.vl`.

  The lesson survives with its sign flipped: a probe-error SPELLING is not automatically a
  probe-error CELL. The 54 loud cells were the parser being right; the 17 silent ones were
  a real defect standing behind it, and excluding the family wholesale on the spelling is
  what kept them unfiled.
* **A nested `is Cat` inside `is Cat`.** My plain-leg `is_t` construct wrapped a read that
  was itself an `is` chain, making the inner else arm unreachable and correctly typed `Cat`;
  82 cells reported `no field 'd' on {c: i32}`. That is the checker being right.
* **A union rep's second value legitimately fails the `is` arm.** My first grader expected
  the read output where the else arm was correct, producing 10 false `wrong_value` cells for
  `vubox`. Fixed by recording, per rep, which value indices satisfy the `is` base; the
  count went to 0 and the four real silent columns were unaffected.
* Type declarations inside a function body are not statements
  (`emitProgram: unsupported statement in body`) — a probe error, not a defect.
* `.entries()` does not exist on a map (`unknown property 'entries'`) — a probe error.

### 4e. Cosmetic, recorded without a slice
A `T | null` map VALUE type read by index renders as `T??` in diagnostics
(`print of a union value (i32??) …`) rather than collapsing to `T?`. One `!= null` narrows it
correctly and the value is right, so this is a rendering/idempotence nit, not a behaviour
defect. 90 cells show the doubled render.

## 5. Grader discipline — what was proven, and how

### Sabotage, with the counts predicted before the run
30 cells were injected whose outcome is known by construction. The prediction was stated
before running and every leg hit exactly:

| injected | predicted | measured |
|---|---|---|
| programs printing a value the manifest does not expect | 12 `wrong_value` | **12** |
| programs whose callee runs twice, value lines still correct | 8 `wrong_evalcount` | **8** |
| programs with a list index out of bounds | 6 `trap` | **6** |
| clean controls that must not move | 4 `correct` | **4** |

So the two columns that read ZERO on the live population — `wrong_value` outside D1, and
`trap` — are zero because the population is clean there, not because the column is dead.

**Extended for the scope axis (2026-08-26).** The grader had never been shown to fire on a
program whose reading statements sit at module top level in the shape `--scopes mod` builds,
so 8 further cells make every column fire again there: 3 `wrong_value`, 2 `wrong_evalcount`,
2 `trap`, 1 `correct`. Predicted before the run and measured exactly — **15 / 10 / 8 / 5**
over 38 cells. `sabotage.py --legacy` still emits only the original 30 and still reports
**12 / 8 / 6 / 4**, so the published counts remain directly checkable. The module-scope
`correct` control and one of its `wrong_value` cells are the SAME PROGRAM under different
manifests, which is what proves the grader reads the expectation rather than the output.

### The fourth silent column was proven against an independent validator
`invalid_wasm` fires 97 times on the live population, and one instance was checked outside
the harness:

    vl build … -o c00254.wasm
      -> "not a valid WebAssembly module — it was written, but it cannot instantiate
          (this is a compiler emit bug)"
    wasm-tools validate --features all c00254.wasm
      -> "error: func 6 failed to validate … type mismatch: expected i32, found (ref $type)"

`compiler_trap` fires 4 times and was separated from `trap` by a measurement, not a guess:
the third `vl build` stage records whether a module was written (0 bytes → the compiler
trapped; >0 bytes → the program trapped).

That separation is the only reason D4 exists as an entry, and it was later re-proved LIVE
rather than merely reachable: on a 608-cell grid built for the class, a deliberate
out-of-bounds arena read injected into `checkFuncDeclNode` and gated on a function NAME
appearing in exactly 44 of those cells moved **44 cells** into `compiler_trap` and **0** into
`program_trap` or `invalid_wasm` (predicted 44 before the run), and the grid returned to its
pre-sabotage classification on all 608 cells after restoring the compiler from a saved,
`md5sum -c`-verified artefact.

### The WITNESS CHECKER's vocabulary was proven the same way (2026-08-26)
`check-filed-witnesses.py` grades this document's own rows, and it had one column doing two
jobs: a module the engine REFUSES and a module the engine LOADS whose PROGRAM then traps both
graded `silent_invalid_wasm`. That is not a naming nit — it sends the reader to the emitter
when the miscompile is in what the emitted code DOES, and D19 sat behind it for a day with a
status line worded to grade as filed while its prose said the truth.

The split now uses the same marker vocabulary `grade.py` separates its `invalid_wasm` and
`trap` columns with, and `--self-test` makes it fire on demand — three specimens whose outcome
is known by construction, predicted in source ahead of the run:

    python3 scripts/check-filed-witnesses.py --self-test
      want runs        got runs        ok
      want check_reject got check_reject ok
      want trap_loads  got trap_loads  ok

The third specimen (`print(xs.length)` then `print(xs[9])`) is the proof the state is a real
distinction rather than a rename: it emits a VALID module that prints `2` and then traps, and
the pre-change classifier routed it `silent_invalid_wasm`. **Re-grading all 24 rows under the
sharper classifier found no other row hiding behind the conflation** — D22, D23 and D24 stay
`silent_invalid_wasm`, which is now measured rather than assumed.

### Structural guarantees
* **One result file per cell.** `runcell.sh` writes `<cell>.res` and never appends to a
  shared file, so nothing can tear under `-P4`.
* **`records == cells` asserted on every run** — printed by `grade.py` as
  `cells=9126 result_files=9126 MATCH=OK` and `cells=219 result_files=219 MATCH=OK`.
* **Graded on the run value, never the build verdict.** D1's boolean cell is check-clean,
  run-clean, rc 0 — a build-verdict grader scores it a pass. It is the top row here.
* **Not a dead grader.** The 9,345 cells spread over 6 outcome columns with 21 distinct
  representations contributing and 17 positions contributing; the largest single column is
  69.5%, not 100%.
* **Harness-suspicion rule.** Any (position, construct) pair failing identically across ALL
  reps and both inputs was read by hand before being filed. That rule is what caught all
  five items in §4d — the `optchain` construct's 0-of-132 and the closure-alias 54 both
  tripped it.

## 6. Coverage gaps — axes not built, and why

Stated plainly rather than reported as a silent zero.

* **MODULE-SCOPE EXECUTION — was the largest of these, and is now BUILT** (2026-08-26, see
  "THE SCOPE AXIS"). Every cell used to run inside `function reader()`; the `global` position
  varied where the BINDING sat and never where the READ executed. Crossing it found 38 silent
  cells against a function-scope 0 on the same coordinates. The only combination still not
  covered is `pos=param` (780 coordinates), which has no module-scope spelling at all.
* **A MAP READ AT A MISSING KEY over a DECLARED-nullable value type — was not in the
  population, and is now** (`mapval_miss`). `mapval` only ever read a key it had just stored,
  so D19's own coordinate was absent from the grid that reported 0 silent; 31 of the 38 cells
  above live at the new position. **Read the generator before quoting a zero**: a coordinate
  that is not generated and a defect that is not present produce the same number.
* **Sets** (string-key and i32-key) — not built. The rep vocabulary in the audit lists them
  as reps a ladder must answer for, and the i32-keyed map defect (D4) suggests the i32-keyed
  SET is worth the same probe. No syntax for a set literal was located in the time budget.
* **Newtypes / brands** (`type EntityId = new i32`) — not built. Given D1, the interaction
  worth measuring is a `new` alias declared AFTER its user.
* **Nested arrays** (`i32[][]`) — not built beyond audit R7's existing note.
* **Generics / monomorphised positions** — not built. Audit R8 (`monoArgTyName` has no
  `nulmap` arm) has a reaching program already and was not re-derived here.
* **`flat` records** — not built.
* **A nullable CLOSURE as an ALIAS inside the generated grid** — generated with a parse
  error (§4d) and therefore NOT measured by the grid. It was measured by hand instead
  (correct), so the gap is in the grid's coverage, not in the finding.
* **Multi-module / import positions** — every cell is a single file.
* **`-O` / `wasm-opt` output** — every cell was graded on the unoptimised module. A silent
  defect that only appears after `wasm-opt` would not be visible here.
* **Struct-field ASSIGNMENT** as a position (`w.f = src()`) — only field *construction* and
  field *read* were built. D8's field leg shows assignment is a distinct axis with its own
  behaviour, so this is a real gap.
* **Deeper capture chains** — two levels were probed by hand (invalid wasm, consistent with
  D3); three or more were not.
* **Evaluation counts under `is` / `match` / place-narrowing constructs** — these mention the
  access expression more than once by construction, so their expected count is not 1 and they
  were graded for value only. A double evaluation *within* one syntactic mention of an `is`
  arm would not be caught. Given D2, this is the gap most likely to hold another
  wrong-evaluation-count cell.

## 7. Where the population disagrees with the audit's score

`per-rep-ladder-audit.md` records "check-clean SILENTLY WRONG output, reached: 0 + 26 (C4),
all closed" and states plainly that the 0 is its own scans' blind spot. This sweep is a
different population — programs by rep × position × construct × input, rather than ladders
by scan shape — and it finds **2 silently-wrong-value cells and 4 wrong-evaluation-count
cells** that no ladder scan would reach:

* D1's root is a declaration-ORDER dependency. No per-rep ladder is incomplete; the ladder is
  consulted before its table is populated. A scan for missing arms cannot see it.
* D2's root is an expression emitted twice. There is no rep, no arm and no fallthrough
  involved, and the cell is value-correct — only a side-effect counter distinguishes it.

Both are arguments for keeping the program-population sweep alongside the ladder audit
rather than in place of it.
