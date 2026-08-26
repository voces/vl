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
| D19 | check-clean invalid wasm | as filed, still live |
| D20 | loud emit reject | **NEW 2026-08-25** — filed while closing D14. Its `capture` leg WAS D9 and is closed; **264 cells remain** at `loopvar` + `mapval`, and the repro is re-filed on `loopvar`. Three legs, three sites — proven by D9's fix reaching exactly one |
| D21 | loud emit reject | **NEW 2026-08-25** — filed while closing D9: the one capture BINDING FORM its fix does not reach (an un-annotated local), 168 of a 728-cell population, flat across every rep |

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

### D19 — a MISS on a DECLARED-nullable numeric-litunion map, read at MODULE SCOPE, traps
**check-clean invalid wasm as the witness checker grades it — but the module LOADS and the miss TRAPS at run time · found while closing D6, filed unfixed · module scope only**

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
  D6 fix (`md5 ac93932e`, 3354 bytes), so this change neither caused nor cures it.
* **The classifier cannot say what this is.** `check-filed-witnesses.py`'s outcome vocabulary
  has no "loads then traps" — a module that exists and a non-zero run rc grades
  `silent_invalid_wasm`. The status line above is worded so the row grades as filed while the
  prose says what actually happens; a trap-loads outcome is the honest addition to make to
  that vocabulary when someone next touches it.
* **The value type is DECLARED nullable**, so this is not D6's implicit-`T?` seam: the map
  stores boxes and the miss arm hands back a `ref.null` that the module-scope read path
  dereferences without the recover the function-scope path applies. The axis is the STORAGE
  CLASS of the binding, not the value rep — which is D9's axis, not Root E's.
* Deliberately NOT pinned in the corpus: `maps/numlit-value-annotated-miss.vl` carries the
  control inside a function and names this row in a comment, because pinning a trap freezes
  it as contract.

---

### D20 — a NULLABLE LIST is a loud emit reject at `loopvar` and `mapval` — for every list rep
**loud emit reject · 264 cells (`loopvar` 120 + `mapval` 144) · filed 2026-08-25 alongside D14, because it is what D14's residue turned out to be. Its `capture` leg was D9 and no longer reproduces; the repro below is RE-FILED on `loopvar` so this row grades against a leg that is still live**

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
loop over the SHARED-backing `(i32[] | null)[]`, which is clean at this position.

**THE THREE LEGS ARE THREE SITES, PROVEN BY A FIX THAT REACHED EXACTLY ONE OF THEM.** D9's
change (the capture storage class in `exprNulScalarListKind` / `exprNullableMap` /
`exprNulClosure`) moved 144 cells and **0 at `loopvar`, 0 at `mapval`** — so the shared
`bare null needs a struct-typed context` between the capture and loopvar legs was message
identity, not root identity, exactly as §3's Root D warns in the direction people forget.

* **`loopvar` is `forInElemKind`, not a classifier storage class.** A loop variable IS a
  declared local (`declareForInLocals` → `addLocalName`), so `declaredKind` reaches it; the
  kind STORED there is the non-null one. Its ref-array ladder splits the nullable niche for
  element kind 4 (`nullist`), for a nullable struct (`nulstruct`) and for `(string | null)[]`
  (`nulstr`), and does NOT split it for element kinds 6 / 7 / 8 / 10 / 9 — the four
  distinct-backing leaf lists and the nested ref array. That is why `i32[] | null` escapes at
  `loopvar` and the other five do not.
* **Adding those five arms is site 1 of N and was MEASURED as a severity regression, not
  shipped.** Returning `nulstrlist` / `nulf64list` / `nuli64list` / `nulf32list` /
  `nulreflist` from `forInElemKind` (with the matching `fiLk` / `fiVarIdx` rows in
  `declareForInLocals`) turns all **120 loopvar cells from `loud emit reject` into
  check-clean INVALID WASM** — `type mismatch: expected (ref null $type), found (ref $type)`
  — because the element READ still recovers the slot non-null. The loop-var slot kind and the
  element read/recover have to move together, the way the `nullist` arm's do. Reverted; this
  paragraph is the measurement that makes the leg schedulable.
* A GRADER FOOTGUN this row tripped, recorded so the next partial closure does not: the
  status line's vocabulary is first-match ordered and `closed` is the FIRST entry, so the
  literal word anywhere on that line makes `check-filed-witnesses.py` expect the whole row to
  RUN. A row closing one leg of several must say so in its BODY, and keep the word off the
  `**…**` line.
* **`mapval` is the mv rep layer and shares nothing with either.** Its message is an explicit
  capability decline — *"no rep for a union-member struct, a nullable list, or a nullable
  litunion-result closure"* — and it fires for `i32[] | null` too, which is the rep that
  escapes at both other positions. A nullable-list map VALUE needs an mv slot that does not
  exist, which is a layout change, not a missing arm.

**THIS IS NOT D14 AND IT IS NOT f32-SPECIFIC**, which is the whole reason it is filed
separately. When D14 closed, `list_f32` reached exact parity with `list_f64` — 0 differing
cells of 340 — and the cells that stayed loud stayed loud in BOTH. Re-probed one program per
(position, rep) against the current compiler:

| position | `i32[]` | `S[]` | `string[]` | `i64[]` | `f64[]` | `f32[]` | message |
|---|---|---|---|---|---|---|---|
| capture | runs | runs | ~~LOUD~~ runs | ~~LOUD~~ runs | ~~LOUD~~ runs | ~~LOUD~~ runs | **CLOSED — was D9** |
| loopvar | runs | LOUD | LOUD | LOUD | LOUD | LOUD | `bare null needs a struct-typed context` |
| mapval | LOUD | LOUD | LOUD | LOUD | LOUD | LOUD | `unsupported map value type` |

* **Flat on**: the list's ELEMENT type, except that the shared i32-list backing escapes at
  `loopvar`. `mapval` declines for every rep including `i32[]`.
* **Varies on**: nullability. The non-nullable list is clean at both remaining positions.
* Grid counts at `c0ee3089`, nullable leg only: ~~capture **96**~~ (closed), loopvar **120**,
  mapval **144** loud-emit cells. Message split across the two live legs: 144 `unsupported map
  value type`, 80 `bare null needs a struct-typed context`, 40 `` `is` test but no union type
  declared``.
* **Do not read the size of this row as difficulty, and do not read its three messages as one
  axis.** Nothing in D14's fix touched it (that branch moved 174 cells, none at these
  positions) and nothing in D9's fix touched what is left of it (144 cells, all at `capture`).

---

### D21 — an UN-ANNOTATED captured local loses its `| null` for EVERY nullable rep
**loud emit reject · 168 of a 728-cell capture population · filed 2026-08-25 while closing D9, because D9's fix reaches every capture form EXCEPT this one**

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
