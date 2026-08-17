# Silent-class inventory #2 — the coverage gaps of inventory #1, measured

`silent-class-inventory.md` ended by declaring its own coverage gaps. **Those gaps are this
file's population.** Nothing here is inherited from a filing: every row was produced by
generating a program, running it, and grading the **run value and the evaluation count**
against an expectation computed in the generator from the rep's own values — never against a
build verdict.

Reproducible from this worktree's private `_scratch/` (untracked, per
`agent-playbook.md` §Scratch space):

| script | job |
|---|---|
| `_scratch/gen2.py` | the generator — six legs, writes one `.vl` (or one directory) per cell plus `manifest.json` with the axis-computed count |
| `_scratch/runcell2.sh` | one cell: `check` + `run`, and a third `build` stage **only when run failed**, recording whether a module was written |
| `_scratch/optcell.sh` | the `-O` / `-O3` leg: build through `wasm-opt`, then **run the optimised module** |
| `_scratch/sweep2.sh` | bounded runner, `xargs -P4` — four concurrent `vl` invocations, never more |
| `_scratch/grade2.py` | the nine-column classifier; asserts `records == cells` against the manifest's axis count |
| `_scratch/pivot2.py` | the tallies below |
| `_scratch/sabotage2.py`, `_scratch/PREDICTIONS.txt` | the grader proof, with the counts written down before the run |

`_scratch/` is **untracked by design** — `agent-playbook.md` requires it, because agents once
shared a scratchpad and one overwrote another's generator mid-run. So this file is written to be
self-contained: **every defect below carries its minimal program and its working control pasted
in full**, and every number carries its denominator, so nothing here depends on the scripts
surviving the worktree.

## 0. What was measured

| | |
|---|---|
| main grid cells generated and run | **5,180** |
| result files | **5,180** — `records == cells` asserted against the manifest's **axis-computed** count (5,180), not against files present |
| `-O` re-run of every cell that was correct | **4,118** |
| `-O3` re-run of the same set | **4,118** |
| grader-sabotage cells | 52 injected + 100 count-corrupted + 20 value-corrupted |
| `vl` invocations per cell | 2 (`check` + `run`), plus a third (`build`) only when the run stage failed; 2 more per opt rung |
| concurrency | 4, never more |
| runtime inputs per cell | **2 — every cell** (input 0 a present/matching value; input 1 `null` in the nullable legs, a second distinct value in the plain legs) |
| evaluation-count oracle | a module-scope counter incremented in the producer, printed as the **last line of every cell**; the EVAL leg overrides the expected count analytically per form |

The producer is called exactly once by construction in every cell of legs 1–4 and 6, so the
trailing count line is a hard oracle: any cell printing anything but `1` is a failing cell
whatever its values say. Leg 5 exists precisely to grade counts that are **not** 1.

### The nine outcome columns, kept strictly separate

| column | cells | / 5,180 |
|---|---|---|
| correct | 4,118 | 79.5% |
| **check-clean SILENTLY WRONG VALUE** | **2** | |
| **check-clean WRONG EVALUATION COUNT** | **0** | |
| **check-clean INVALID WASM** | **66** | |
| **program TRAP** (module written) | **0** | |
| **COMPILER TRAP** (no diagnostic, no module) | **8** | |
| loud check reject | 252 | |
| loud emit reject | 734 | |
| hint-only rc 1 | 0 | |
| other runtime failure | 0 | |
| **SILENT TOTAL** | **76** | 1.47% |

`hint_only_rc1` is zero **by construction and it was proved so**: sabotage leg S8 built four
files whose only diagnostics are a `[HINT]` (redundant annotation) and a `[WARNING]` (unused
function); `vl check` exits **0** on all four and they grade `correct`. The classifier keys
on the presence of an `[ERROR]` line anywhere in the whole diagnostic text, so a `[HINT]`
printed *above* a real `[ERROR]` lands in `loud_check_reject`, not here.

> **A grader defect I found and fixed, in the exact direction the brief warned about.** My
> first classifier binned *any* `vl check` rc 1 with no `[ERROR]` as `hint_only_rc1`. A
> compiler trap **at check time** has precisely that shape — rc 1, a bare wasm backtrace, no
> diagnostic — so a COMPILER TRAP would have been filed as "just a hint". The fixed
> classifier requires an actual `[HINT]`/`[WARNING]` line for that column and otherwise falls
> through to the compiler-trap test. Sabotage leg S4 is the regression proof.

## 1. Grid totals per axis, with denominators

### By leg

| leg | cells | correct | silent | wrong value | wrong count | invalid wasm | trap | compiler trap | loud check | loud emit |
|---|---|---|---|---|---|---|---|---|---|---|
| `reps` (gap reps × 19 positions × 5 constructs × 2 inputs) | 3,680 | 2,798 | 10 | 0 | 0 | 2 | 0 | **8** | 192 | 680 |
| `generic` (10 generic shapes × 23 reps × 2) | 460 | 384 | 32 | **2** | 0 | 30 | 0 | 0 | 14 | 30 |
| `garg` (9 argument FORMS × 19 reps × 2) | 342 | 298 | 34 | 0 | 0 | 34 | 0 | 0 | 0 | 10 |
| `assign` (8 assignment forms × 23 reps × 2) | 368 | 310 | **0** | 0 | 0 | 0 | 0 | 0 | 46 | 12 |
| `module` (5 import kinds × 23 reps × 2) | 230 | **230** | **0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `eval` (50 evaluation-count forms × 2) | 100 | 98 | **0** | 0 | **0** | 0 | 0 | 0 | 0 | 2 |
| **total** | **5,180** | **4,118** | **76** | 2 | 0 | 66 | 0 | 8 | 252 | 734 |

### By representation (all legs)

| rep | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| `set_str` `{[string]: boolean}` | 206 | 148 | **6** | 12 | 40 |
| `set_i32` `{[i32]: boolean}` | 206 | 134 | **8** | 12 | 52 |
| `map_str` `{[string]: i32}` | 206 | 148 | **6** | 12 | 40 |
| `map_i32` `{[i32]: string}` | 206 | 128 | **14** (6 invalid wasm + **8 compiler trap**) | 12 | 52 |
| `nt_i32` / `nt_i64` / `nt_f64` (`new` over a scalar) | 206 each | 194 each | 0 | 10 each | 2 each |
| `nt_f32` | 206 | 192 | **2** | 10 | 2 |
| `nt_str` (`new string`) | 206 | 200 | **4** | 2 | 0 |
| `nt_bool` | 206 | 204 | 0 | 2 | 0 |
| `nt_struct` (`new { x: i32 }`) | 206 | 192 | 0 | 12 | 2 |
| `nt_litunion` (`new` over `"p" \| "q"`) | 206 | 170 | 0 | 34 | 2 |
| `arr2_bool` `boolean[][]` | 206 | 136 | **2** | 10 | 58 |
| `arr2_i32` / `_str` / `_f64` / `_f32` / `_i64` / `_struct` | 206 each | 138 each | 0 | 10 each | 58 each |
| `arr3_i32` `i32[][][]`, `arr3_str` | 206 each | 138 each | 0 | 10 each | 58 each |
| `flat_rec` (`flat type` 3 fields) | 206 | 192 | 0 | 12 | 2 |
| `flat_nest` (`flat` containing `flat`) | 206 | 192 | 0 | 12 | 2 |
| `garg` base reps `g_i32`/`g_i64`/`g_f32`/`g_f64`/`g_bool`/`g_list_*`/`g_struct`/`g_litunion`/`g_nt_i32`/`g_flat` | 18 each | 18 each (16 for `g_i64`) | 0 (2 for `g_i64`) | 0 | 0 |
| `garg` `g_str` / `g_nt_str` | 18 each | 14 each | **4** each | 0 | 0 |
| `garg` `g_map_str` / `g_map_i32` / `g_set_str` / `g_set_i32` | 18 each | 12 each | **6** each | 0 | 0 |
| `garg` `g_arr2` | 18 | 8 | 0 | 0 | 10 |

### By position (`reps` leg, 3,680 cells)

| position | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| `const_local` / `let_local` / `param` / `ret_ann` / `global` / `field` / `field_assign` / `elem` / `elem_assign` | 230 each | 228 each | 0 | 2 each | 0 |
| `ret_unann` / `callres` / `field2_assign` | 46 each | 46 each | 0 | 0 | 0 |
| `capture_local` | 230 | 104 | **2** (compiler trap) | 2 | 122 |
| `capture_param` | 230 | 102 | **4** (2 invalid wasm + 2 compiler trap) | 2 | 122 |
| `capture2` (two levels) | 230 | 104 | **2** (compiler trap) | 2 | 122 |
| `capture3` (three levels) | 230 | 104 | **2** (compiler trap) | 2 | 122 |
| `field_place` (narrow `h.f` **in place**) | 184 | 78 | 0 | 2 | **104** |
| `elem_place` (narrow `xs[0]` **in place**) | 184 | 22 | 0 | **162** | 0 |
| `mapval` | 184 | 94 | 0 | 2 | 88 |

**`capture2` and `capture3` land on exactly the same outcome vector as `capture_local` for
every rep.** Chain depth beyond one level is **not** an axis in this population — a
first-class negative result, and one of the brief's named gaps closed.

### By construct (`reps` leg)

| construct | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| `direct` (plain leg) | 736 | 654 | **10** | 0 | 72 |
| `nenull` (`if x != null`) | 736 | 544 | 0 | 40 | 152 |
| `eqnull_else` | 736 | 544 | 0 | 40 | 152 |
| `is_t` (`if x is T`) | 736 | 544 | 0 | 40 | 152 |
| `match_null` | 736 | 512 | 0 | 72 | 152 |

### By nullability and by runtime input

| axis | cells | correct | silent |
|---|---|---|---|
| plain (non-nullable) | 2,236 | 1,974 | **76** |
| nullable | 2,944 | 2,144 | **0** |
| input 0 (present/matching) | 2,590 | 2,059 | 38 |
| input 1 (`null` / second value) | 2,590 | 2,059 | 38 |

**Every silent cell in this population is in the PLAIN leg; the nullable leg is silent-free
in 2,944 cells.** That is the exact inverse of inventory #1, where `nullable` held 97 of 107
silent cells — because inventory #1's population was nullable narrowing and this one's is
containers, brands and monomorphisation. Both inputs still had to be run: the split is 38/38,
and the two `wrong_value` cells are one per input with *different* wrong values (`1` for
`true`, `0` for `false`), so a one-input probe would have found half of that defect and known
nothing about the other half.

### The `-O` / `wasm-opt` leg

| rung | cells | correct | any other column |
|---|---|---|---|
| `-O` (binaryen `-O`), module rebuilt and the OPTIMISED module run | 4,118 | **4,118** | 0 |
| `-O3` (`--closed-world -O3 --gufa -O3`, the release profile) | 4,118 | **4,118** | 0 |

**There is no optimisation-only defect in this population.** Every cell that was correct
unoptimised is correct at both rungs, graded on the value the optimised module prints against
the same independent expectation. (`wasm-opt` is reached through `VL_WASM_OPT=$PWD/node_modules/.bin/wasm-opt`;
without it `vl build -O3` exits 1 with `-O3 requires wasm-opt` — read that before reading a
zero.)

## 2. Ranked live defects

Ranked **compiler trap above everything**, then silent before loud; within silent, wrong
value → wrong count → invalid wasm → trap; within a class, flat-across-many-reps before
single-rep.

---

### D1 — an i32-keyed MAP captured by a nested function TRAPS INSIDE THE COMPILER
**COMPILER TRAP · 8 cells of 8 reachable · check-clean, no diagnostic, no module written**

    function body() {
      const m: {[i32]: string} = Map()
      m[1] = "x"
      function inner() { print(m.length) }
      inner()
    }
    body()
    // vl check: "Checked 1 file, no errors."   (rc 0)
    // vl run / vl build:  wasm trap: out of bounds array access
    //                     note: an index outside the bounds of an array.
    // NO MODULE WRITTEN.

**Control** (a string-keyed map in the identical shape — prints `1`):

    function body() {
      const m: {[string]: i32} = Map()
      m["a"] = 1
      function inner2() { print(m.length) }
      inner2()
    }

**Second control** (the same i32-keyed map read *without* the capture — prints `1`):

    function body() {
      const m: {[i32]: string} = Map()
      m[1] = "x"
      print(m.length)
    }

* **Named root**, from `vl build compiler/entry.vl --names`:

      sFieldIndex ← memberUnionFieldName ← memberUnionReadKind ← exprString
        ← exprHasStrOp ← blockHasStrOpScan ← blockHasStrOp ← fnHasStrOp
        ← emitFuncCode ← emitCodeSection ← emitModule ← emitProgram ← compileSrc

  The **string-op scratch-frame detector** walks the nested function's member read;
  `exprString` asks `memberUnionReadKind` → `memberUnionFieldName` → `sFieldIndex` with a
  struct index that is out of range for an i32-keyed map. It is not the emit *lowering* — it
  is the pre-pass that decides whether the function needs a string scratch frame.
* **Triggered by**: both inputs; there is no runtime, so the input is irrelevant.
* **Flat on**: the capture storage class (**local and parameter both**), and the chain depth
  (**one, two and three levels all trap**), and on `print` (it also traps with
  `n = m.length` and no `print` at all), and on the read form (`m.length` and `m[1] ?? "N"`
  both trap).
* **Varies on**: the map's **KEY** rep only. The string-keyed twin is correct at all four
  capture positions in the plain leg (2/2 cells each, 8/8) and carries **zero** compiler traps
  anywhere in its 206 cells; the i32-keyed twin is 8/8 compiler traps at the same four boxes.
  That is the whole experiment: one character of the type annotation, every other axis held.
* **This CORRECTS a correction.** `CHANGELOG.md`'s A-forin-map-recv entry states *"Also
  corrected a filed claim: an i32-keyed map does **not** trap the compiler (140 i32-keyed
  cells double-evaluate exactly like string-keyed)"*. That measurement was in the **for-in
  receiver** context and is not disputed. At the **capture** position the trap is live on this
  tip, on 8 of 8 cells, with the named backtrace above. Inventory #1's D4 was right about the
  shape and reported it at `m.size`; it is still there.
* **Distinct root from D2 below**: frame-for-frame the two backtraces share nothing. D1 is in
  `emitProgram`'s scratch detector; D2 is in `checkProgram`.

---

### D2 — an empty array literal returned from an ANNOTATED lambda kills `vl check` itself
**COMPILER TRAP · already filed in `CHANGELOG.md`, re-measured and re-rooted here**

    function body() {
      const fq: () => i32[] = () => { return [] }
      print(fq().length)
    }
    body()
    // vl check: rc 1, NO diagnostic at all, a bare wasm backtrace.
    // No module written.

**Control** (a non-empty literal — prints `1`):

    const fq: () => i32[] = () => { return [0] }

* **Named root**: `nulElemListRetName ← checkFuncDeclNode ← checkNode ← checkLetDeclNode
  ← checkNode ← checkFuncDeclNode ← checkNode ← checkProgramNode ← checkNode
  ← checkProgram ← checkSrc ← cliCheckCurFile`. An out-of-bounds array access inside the
  **checker**, not the emitter.
* Filed as *"Found and **not** fixed, a distinct compiler trap"* in the A-forin-map-recv
  CHANGELOG entry. Recorded here with its **named** root so the next reader does not have to
  re-derive it, and used as sabotage leg **S4** — the only shape I could find that makes the
  `compiler_trap` column fire at CHECK time, which is what exposed the grader defect above.

---

### D3 — `print` of a BOOLEAN ARRAY ELEMENT inside a GENERIC body prints `1` / `0`
**check-clean SILENTLY WRONG VALUE · 2 cells of 2 reachable in the grid, one per input; widened
by hand to the 1-dimensional `boolean[]`, a rep the grid did not carry**

    function gtake<T>(x: T) {
      print(x[0][1])
    }
    function body() {
      const xs: boolean[][] = [[true, false]]
      gtake(xs)
    }
    body()
    // vl check rc 0.   Output: 0        <- WRONG, must be `false`
    // with [[false, true]] the output is 1, must be `true`

**Control** (the identical body with a CONCRETE parameter — prints `false`):

    function take(x: boolean[][]) {
      print(x[0][1])
    }

**The same defect one dimension down** (`1`, must be `true`; the concrete control prints
`true`):

    function gtake2<T>(x: T) { print(x[0]) }
    const xs: boolean[] = [true, false]
    gtake2(xs)

* **Triggered by**: both inputs, with *different* wrong values (`false`→`0`, `true`→`1`), which
  is why the two-input requirement matters even for a two-cell defect.
* **The sub-axis experiment, holding the generic function and the observation fixed**:

  | inside `gtake<T>(x: T)` | prints | verdict |
  |---|---|---|
  | `print(x)`, `T = boolean` (a scalar) | `true` | correct |
  | `print(x[0])`, `T = boolean[]` | `1` | **WRONG** |
  | `print(x[0][1])`, `T = boolean[][]` | `0` | **WRONG** |
  | `print(x[0])`, `T = f64[]` | `1.5` | correct |
  | `print(x[0])`, `T = string[]` | `aa` | correct |
  | `print(x[0][1])`, `T = i32[][]`/`string[][]`/`f64[][]`/`f32[][]`/`i64[][]`/`{a:i32}[][]`/`i32[][][]`/`string[][][]` | — | correct, 16 of 16 grid cells |
  | `if x[0][1] { print("T") } else { print("F") }`, `T = boolean[][]` | `F` then `T` | **correct** |
  | `print(x[0][1] == false)`, `T = boolean[][]` | `true` | **correct** |
  | `const z = gid(xs); print(z[0])` — the read OUTSIDE the generic body | `true` | correct |
  | `print(x.f)`, `T = {f: boolean}` | — | loud `[ERROR]: member access '.f' on non-object T` |

* **So the axis is exactly: an INDEX read of a boolean array, inside a monomorphised body, in
  `print` position.** The scalar boolean is fine, the branch and the comparison are fine, the
  same read one call frame out is fine, and every other element rep is fine.
* **Narrower than it looks, and the narrowing is the diagnosis**: the stored value is right —
  only the `print` classification is wrong; it takes the i32 printer. Same class as
  inventory #1's D1 ("a *print-classifier* lookup, not a storage bug"), reached through a
  monomorphised parameter instead of a forward type reference.
* At the same position `set_*` / `map_*` / `flat_*` / `nt_struct` are a LOUD check reject
  (`member access '.length' on non-object T`, 14 cells) — so an unbounded `T` refuses member
  access but *admits* indexing, which is the inconsistency that lets this through (see D14).

---

### D4 — a generic call whose ARGUMENT is an annotated local, a field read or an element read silently emits an i32 parameter
**check-clean INVALID WASM · 34 cells, the largest silent family, flat across 7 reps × 3 argument forms**

    function gid<T>(x: T): T { return x }
    function body() {
      const y: string = "aa"
      const z = gid(y)
      print(z)
    }
    body()
    // vl check rc 0, "Checked 1 file, no errors."
    // vl run:  Invalid input WebAssembly code at offset 216:
    //          type mismatch: expected i32, found (ref $type)

**Control** (delete the annotation — prints `aa`):

    const y = "aa"
    const z = gid(y)

**Three more controls, all correct**: the literal directly (`gid("aa")`); a **parameter**
(`function use(y: string) { print(gid(y)) }`); a module **global**, annotated or not
(`const gy: string = "aa"` … `gid(gy)`).

* **Triggered by**: both inputs — the module fails to validate, so neither input runs.
* **The complete argument-form × rep map** (the experiment holds the generic function, the
  observation and the runtime input fixed and varies ONLY how the argument reaches the call;
  `.` correct, `W` check-clean invalid wasm, `e` loud emit reject; two cells per box, one per
  input):

  | rep | `gid(src())` | annotated local | un-annotated local | param | global ann | global un-ann | `gid(w.f)` | `gid(xs[0])` | captured local |
  |---|---|---|---|---|---|---|---|---|---|
  | `i32`, `f32`, `f64`, `boolean`, `i32[]`, `string[]`, `f64[]`, `{a:i32}`, `"p"\|"q"`, `new i32`, `flat` | `..` | `..` | `..` | `..` | `..` | `..` | `..` | `..` | `..` |
  | `i64` | `..` | `..` | `..` | `..` | `..` | `..` | `..` | **`WW`** | `..` |
  | `string` | `..` | **`WW`** | `..` | `..` | `..` | `..` | **`WW`** | `..` | `..` |
  | `new string` | `..` | **`WW`** | `..` | `..` | `..` | `..` | **`WW`** | `..` | `..` |
  | `{[string]: i32}` | `..` | **`WW`** | `..` | `..` | `..` | `..` | **`WW`** | **`WW`** | `..` |
  | `{[i32]: string}` | `..` | **`WW`** | `..` | `..` | `..` | `..` | **`WW`** | **`WW`** | `..` |
  | `{[string]: boolean}` (Set) | `..` | **`WW`** | `..` | `..` | `..` | `..` | **`WW`** | **`WW`** | `..` |
  | `{[i32]: boolean}` (Set) | `..` | **`WW`** | `..` | `..` | `..` | `..` | **`WW`** | **`WW`** | `..` |
  | `i32[][]` | `..` | `..` | `..` | `..` | **`ee`** | **`ee`** | **`ee`** | **`ee`** | **`ee`** |

* **Flat on**: the runtime input (2/2 every time), and on whether the generic result is bound
  to a `const` first or read through directly (`gid(y)` bound vs `print(gid(y).length)` — both
  fail identically, 10 cells each).
* **Varies on**: the ARGUMENT FORM (annotated local / field read / element read fail; call,
  literal, param, global, capture succeed) and the REP (`string`, `new string`, the four
  map/set spellings, plus `i64` at the element-read form only).
* **Root, and the compiler's own source states the mechanism.** `monoArgTyName`
  (`compiler/emit_mono.vl:315`) names the type a generic parameter is instantiated at. Its
  annotated-local branch answers for exactly three spellings — `monoStructAnnName` (struct
  and struct-array), `isUName` (union), `monoCompositeListAnnName` (composite-element list) —
  and the expression classifiers below it (`exprString`, `exprMap`) *cannot* read a local's
  type during monomorphization because the locals table is built post-mono. The file says so
  three times, once per spelling it already fixed:

      // A STRUCT- or struct-ARRAY-typed ANNOTATED local … During monomorphization the
      // locals table isn't built (buildLocals is post-mono), so the `exprStruct`/
      // `exprRefArray` cases below can't classify it, defaulting the type param to i32

  There is **no arm for `string`, none for a `{[K]:V}` spelling, and none for a newtype over
  `string`**, so those arguments fall to the `"i32"` catch-all at the bottom and the
  instance's parameter is declared `i32` over a body doing string/map/set work. The same file
  already documents this exact failure mode for the litunion spelling it fixed: *"the wasm
  parameter took the i32 default while every consumer in the body still classified the name as
  a string … INVALID WASM."*
* **The floor exists and these spellings do not stand on it.** The same function has a LOUD
  floor — `emitProgram: monomorphize: unsupported argument type for 'x' in a call to 'gid'`,
  which is what the `i32[][]` row above reports (10 cells). One predicate away, 34 silent
  cells become 34 loud ones.

---

### D5 — a generic function forwarding its own type-parameter-typed parameter to a second generic call
**check-clean INVALID WASM · 8 cells · same root as D4, different branch, DIFFERENT MESSAGE**

    function gid<T>(x: T): T { return x }
    function gwrap<T>(x: T): T { return gid(x) }
    function body() {
      const m: {[string]: i32} = Map()
      m["a"] = 1
      m["b"] = 2
      const z = gwrap(m)
      print(z.length)
    }
    body()
    // vl check rc 0.
    // vl run:  Invalid input WebAssembly code at offset 1711:
    //          type mismatch: current function requires result type [(ref (id 4))]
    //          but callee returns [i32]

**Control** (make the forwarding function CONCRETE — prints `1`):

    function gid<T>(x: T): T { return x }
    function wrapc(x: {[string]: i32}): {[string]: i32} { return gid(x) }

* **Triggered by**: both inputs. Note the argument here is a **call** (`gwrap(src())` in the
  grid), which is the form D4's table shows to be *safe* — the failure is one hop inside, at
  `gid(x)` where `x` is `gwrap`'s own parameter whose annotation is the substituted `T`.
* **Flat on**: all four map/set reps (`{[string]:i32}`, `{[i32]:string}`,
  `{[string]:boolean}`, `{[i32]:boolean}`), 2 cells each.
* **Varies on**: whether the forwarding function is generic. Concrete → correct.
* **Same root as D4, and this is why it is filed separately in the ranking but grouped in
  §3**: the failing arm is `monoArgTyName`'s `paramTypeNode` branch, which has the identical
  three-spelling repertoire (`monoStructAnnName` / `isUName` / `monoCompositeListAnnName`) and
  the identical missing map/set/string arms. **`… but callee returns [i32]`** names the `"i32"`
  catch-all directly. The message differs from D4's entirely, which is the "same root,
  different message" case again.

---

### D6 — a generic `T[]` parameter given an ARRAY LITERAL of `f32` elements
**check-clean INVALID WASM · 2 cells**

    function gfirst<T>(xs: T[]): T { return xs[0] }
    function body() {
      const a: f32 = 1.5
      const z = gfirst([a])
      print(z)
    }
    body()
    // vl check rc 0.
    // vl run:  Invalid input WebAssembly code at offset 302:
    //          type mismatch: expected i32, found f32

**Control** (the same call with an `i64` element — prints `5`):

    const a: i64 = 5 as i64
    const z = gfirst([a])

**Second control** (a CONCRETE first — prints `1.5`):

    function firstc(xs: f32[]): f32 { return xs[0] }

**Third control, and the argument that this is Root A**: the same `f32` case with the array
**pre-bound to a local** is a LOUD emit reject, not a bad module —

    const xs: f32[] = [1.5]
    const z = gfirst(xs)
    // emitProgram: monomorphize: expected an array argument for `xs` in a call to `gfirst`

* **Varies on**: the element scalar (`f32` fails; `i32`, `i64` succeed) and the argument
  spelling (an array LITERAL is silent, a pre-bound local is loud). `exprF32Array` cannot
  claim an array literal whose element is an Ident, so the argument falls past every list arm
  to `exprArray`'s catch-all, which pins `i32[]` — the exact mechanism the file's own comment
  describes for the `i64[]`/`f32[]` arms it added.
* The `i64` cell in D4's table (`gid(xs[0])` over an `i64[]`) is the same omission at the
  Index classifier: `gid(<i64 local>)` and `gid(<i64 field>)` are both correct, only the
  i64-array **index read** is not classified.

---

### D7 — an i32-keyed SET passed as a PARAMETER and captured by a nested function
**check-clean INVALID WASM · 2 cells**

    function mk(): {[i32]: boolean} {
      const s: {[i32]: boolean} = Set()
      s.add(1)
      return s
    }
    function body(s: {[i32]: boolean}) {
      function inner() { print(s.length) }
      inner()
    }
    body(mk())
    // vl check rc 0.
    // vl run:  Invalid input WebAssembly code at offset 1217:
    //          type mismatch: expected (ref null $type), found (ref $type)
    //          [in function `inner`]

**Control** (the same set as a captured **LOCAL** — prints `1`):

    function body() {
      const s = mk()
      function inner2() { print(s.length) }
      inner2()
    }

**Second control** (a **string**-keyed set as a captured parameter — prints `1`).

* **Flat on**: both inputs (populated and empty set).
* **Varies on**: the capture STORAGE CLASS. A parameter is invalid wasm; a local is correct,
  and so are two- and three-level captures of a local. **This is the opposite axis from D1**:
  the i32-keyed *map* traps for local and parameter alike, the i32-keyed *set* fails only for
  the parameter. The Set flavour carries its own shape sentinel (`-5`, see
  `tests/cases/sets/i32-keyed-basics.vl`), so map and set are separately classified here, and
  the measurement says so.

---

### D8 — assigning to a struct FIELD inside the block where that field is narrowed non-null
**loud check reject · 46 cells · flat across 23 of 23 reps**

    type W = { f: string | null }
    function src(): string | null { return "bb" }
    function body() {
      const w: W = { f: "aa" }
      if w.f != null {
        w.f = src()
        print(w.f)
      } else {
        print("NUL")
      }
    }
    body()
    // [ERROR]: cannot assign string? to string

**Control** (assign after the narrowed block — prints `aa` then `false`):

    if w.f != null { print(w.f) } else { print("NUL") }
    w.f = src()
    print(w.f == null)

* **Flat on**: **every rep in the grid, 23 of 23**, 2 cells each — sets, maps, all eight
  newtypes, all nine nested-array shapes, both flat records. The rendered type differs per rep
  (`cannot assign {[i32]: boolean}? to {[i32]: boolean}`,
  `cannot assign {value: i32, tt: i32, pad: i32}? to {value: i32, tt: i32, pad: i32}`, …) but
  the shape is one.
* **Varies on**: the assigned value's type. Assigning a non-nullable `T` inside the block is
  accepted, so the check is against the **flow-narrowed** type rather than the declared one.
* This is inventory #1's D8 (`cannot assign null to string` for a *binding*) re-measured at
  the **struct-field-assignment** position, which #1 listed as a coverage gap. Still live, and
  now with a flat-across-every-rep count. Assignment should be checked against the field's
  DECLARED type; narrowing constrains reads, not writes.

---

### D9 — a NESTED ARRAY captured by a nested function is a loud emit reject
**loud emit reject · 360 cells — the largest loud family in the sweep**

    function body(xs: i32[][]) {
      function inner() { print(xs[0][1]) }
      inner()
    }
    body([[1, 2]])
    // vl check rc 0.
    // vl run:  emitProgram: ref valtype with no interned shape

**Control** (the identical read, not captured — prints `2`):

    function body(xs: i32[][]) { print(xs[0][1]) }

* **Flat on**: all **nine** nested-array reps (`i32[][]`, `string[][]`, `f64[][]`, `f32[][]`,
  `i64[][]`, `boolean[][]`, `{a:i32}[][]`, `i32[][][]`, `string[][][]`), all **four** capture
  positions (local, parameter, two levels, three levels), all **five** constructs
  (`direct`, `!= null`, `== null`-else, `is T`, `match null`), both inputs — 9 × 4 × 5 × 2 =
  **360**, and the message is byte-identical in every one.
* **Varies on**: nothing inside its own family. Outside it, the same nine reps are correct at
  every non-capture position (`const_local` 228/230, `field` 228/230, `global`, `param`,
  `elem`, `ret_ann`, `field_assign`, `elem_assign` all 228/230).
* A **fifth** message for the same axis appears in the `garg` leg: an `i32[][]` **global** as a
  generic argument reports `emitProgram: monomorphize: unsupported argument type` (see D4's
  table), which is the loud floor in a different subsystem.

---

### D10 — PLACE-NARROWING a nullable struct field, then using it, is a loud emit reject for container reps
**loud emit reject · 104 cells · two messages, one axis**

    type W = { f: i32[][] | null }
    function src(): i32[][] | null { return [[1, 2]] }
    function body() {
      const w: W = { f: src() }
      if w.f != null { print(w.f[0][1]) } else { print("NUL") }
    }
    body()
    // vl check rc 0.
    // vl run:  emitProgram: index receiver is not an array or string

**Control** (bind the field to a temp, then narrow the temp — prints `2`):

    const t = w.f
    if t != null { print(t[0][1]) } else { print("NUL") }

**Second control, and it is what makes this a REP axis rather than a place axis** — the same
in-place narrow over a **plain** `i32[]` field prints `2`:

    type W2 = { f: i32[] | null }
    if w.f != null { print(w.f.length) } else { print("NUL") }

* **Flat on**: all four narrowing constructs and both inputs.
* **Varies on**: the field's rep. In-place field narrowing is **correct** for all eight
  newtypes (8/8 each), both flat records (8/8), and a plain `i32[]`; it is a **loud emit
  reject** for the nine nested arrays (64 cells, `index receiver is not an array or string`)
  and for both maps, both sets and `{a:i32}[][]` (40 cells,
  `field access receiver is not a struct`). Two messages, one axis.

---

### D11 — PLACE-NARROWING an array ELEMENT, then using it, is a loud CHECK reject for all but the niche reps
**loud check reject · 162 cells of 184**

    function src(): i32[][] | null { return [[1, 2]] }
    function body() {
      const xs: (i32[][] | null)[] = [src()]
      if xs[0] != null { print(xs[0][0][1]) } else { print("NUL") }
    }
    body()
    // [ERROR]: cannot index non-array i32[][]?

**Control** (bind the element, then narrow — prints `2`):

    const t = xs[0]
    if t != null { print(t[0][1]) } else { print("NUL") }

* **Flat on**: all four constructs and both inputs.
* **Varies on**: the rep, and the split is the *narrowing story*, not the message. In-place
  element narrowing **works** for `new string` (8/8) and `new boolean` (8/8) — the reps whose
  nullable is a NICHE — and fails for everything else: the four box newtypes report
  ``[ERROR]: `as` supports numeric conversions only`` (the narrow did not happen, so the
  `as` unwrap sees `NtI32?`), the nine nested arrays report `cannot index non-array …?`, and
  maps, sets, `new { x: i32 }` and both flat records report
  `member access '.length' on non-object …?`. **Three messages, one axis.** So this is not
  "index place-narrowing is unimplemented" — it is implemented and reaches only the niche reps.
* Inventory #1 measured `elem_place` at 150 loud check of 204 on scalar reps; this is the same
  family on the gap reps, at 162 of 184.

---

### D12 — a nullable MAP or SET captured by a nested function: one axis, three messages
**loud emit reject · 128 cells**

    function mk(): {[string]: i32} | null {
      const m: {[string]: i32} = Map()
      m["a"] = 1
      return m
    }
    function body() {
      const x: {[string]: i32} | null = mk()
      function lvl1() {
        if x != null { print(x.length) } else { print("NUL") }
      }
      lvl1()
    }
    body()
    // vl check rc 0.
    // vl run:  emitProgram: bare null needs a struct-typed context

**Control** (the identical narrow, not captured — prints `1`).

* **Flat on**: all four reps (`{[string]:i32}`, `{[i32]:string}`, `{[string]:boolean}`,
  `{[i32]:boolean}`) and both inputs.
* **Varies on the narrowing form and the storage class, and that is the whole finding**:

  | form × storage | verdict |
  |---|---|
  | `if x != null` / `== null`-else at a captured **LOCAL** (and 2- and 3-deep) | `bare null needs a struct-typed context` (48) |
  | the same at a captured **PARAMETER** | `field access but no struct type declared` (16) |
  | `if x is {[K]:V}` / `match x { null => … }` at any of the four | `` `is` test but no union type declared`` (64) |

  Three messages for one (rep × position) axis — a direct echo of inventory #1's Root D
  warning that message identity and root identity are independent in both directions.

---

### D13 — a NESTED ARRAY as a map VALUE, and an i32-keyed map/set as a map value
**loud emit reject · 88 cells**

    function src(): i32[][] { return [[1, 2]] }
    function body() {
      const m: {[string]: i32[][] | null} = Map()
      m["k"] = src()
      const t = m["k"]
      if t != null { print(t[0][1]) } else { print("NUL") }
    }
    body()
    // emitProgram: unsupported map value type (no rep for a union-member struct,
    //              a nullable list, or a nullable litunion-result closure; …)

* 72 cells for the nine nested-array reps × 4 constructs × 2 inputs, plus 16 for the i32-keyed
  map and set at the same position, which report the i32-keyed floor instead.
* **The i32-keyed floor's message contradicts itself** and that is worth one line of a slice
  on its own:

      emitProgram: an i32-keyed Map/Set is supported as a binding / parameter / return /
      `| null` / an ARRAY ELEMENT / a closure result / a map value
      — not inside '{[string]:{[i32]:boolean}}'

  It lists **"a map value"** among the supported positions and then declines being a map
  value. 32 cells carry it, at three different positions (`mapval`, `fa_mapval_assign`,
  `gbox`).

---

### D14 — the `garr` / `gbody` generic shapes over container and record reps
**loud emit reject 26 cells + loud check reject 14 cells**

| shape | reps | verdict |
|---|---|---|
| `gfirst<T>(xs: T[])` | the nine nested arrays | `emitProgram: nested arrays are not supported` (18) |
| `gfirst<T>(xs: T[])` | `flat_rec`, `flat_nest`, `new {x:i32}` | `emitProgram: struct array elements are not supported` (6) |
| `function gtake<T>(x: T) { print(x.length) }` | both maps, both sets, both flats, `new {x:i32}` | `[ERROR]: member access '.length' on non-object T` (14) |
| the same body | `new ("p"\|"q")` | `emitProgram: print of a literal-union atom whose type carries no member texts` (2) |

Controls: the concrete (non-generic) twin of each is correct. `gtake<T>` is arguably by design
(an unbounded `T` has no members) — but note that `x[0][1]` **is** admitted on an unbounded `T`,
which is how D3 gets through. The two decisions disagree with each other, and that disagreement
is the actionable part.

---

## 3. Shared-root analysis

### Root A — `monoArgTyName`, one function, three arms, a loud floor several spellings skip
**D4** (34 silent), **D5** (8 silent), **D6** (2 silent) and the loud rows
`monomorphize: unsupported argument type for 'x'` (10) and
`monomorphize: expected an array argument for 'xs'` are the same decision site:
`monoArgTyName`, `compiler/emit_mono.vl:315`.

Evidence that it is **one root** and not four:

1. Every silent verdict names the `"i32"` catch-all directly — `expected i32, found (ref $type)`,
   `expected i32, found f32`, `but callee returns [i32]`.
2. The same program with the annotation **deleted** is correct (D4's un-annotated column), which
   is exactly the branch (`ld.letType < 0 && ld.letInit >= 0`) that recurses into the
   classifiable initialiser.
3. The same argument delivered as a **param, global, literal or call** is correct, because those
   forms reach classifiers that *can* answer.
4. Making the forwarding function **concrete** fixes D5, isolating the arm to
   `paramTypeNode`'s substituted annotation.
5. The **loud floor is in the same function** and fires for `i32[][]` at module scope. So the
   invariant "every argument spelling either gets named or hits the floor" is violated by
   exactly the spellings with no arm: `string`, a newtype over `string`, `{[K]:V}` in both key
   flavours, `i64` at an index read, and `f32` in an array literal.
6. The file's own comments describe this failure mode three times, once per spelling already
   fixed, including the sentence *"the wasm parameter took the i32 default while every consumer
   in the body still classified the name as a string … INVALID WASM"*.

**This is the highest-value grouping here: one arm-set away from turning 44 silent cells into
44 loud ones**, which is strictly better before anyone teaches the monomorphizer the spellings.
Four different messages and two different severities from one site — the strongest instance in
either inventory of "shared ROOT, unshared OUTCOME".

### Root B — the capture position for heap containers: a shared POSITION, and I could only establish a shared OUTCOME
**D1** (compiler trap, i32-keyed map), **D7** (invalid wasm, i32-keyed set as a param),
**D9** (loud, nested arrays), **D12** (loud, nullable maps/sets) all live at the four capture
positions and nowhere else — 122 loud + 2 silent + 2 compiler-trap cells per capture position,
against 2 of 230 at every non-capture position.

I can state the **position** is shared. I cannot state the decision site is, and the evidence is
against it: D1's named backtrace runs through `fnHasStrOp`'s scratch-frame **pre-pass**
(`emitFuncCode`), while D9 and D12 are floors inside the emit **lowering** and D7 is a slot type
mismatch with no floor at all. Three different subsystems reached from one storage class.
**Filed as a shared outcome.**

### Root C — place-narrowing: a shared REWRITE, two different stages
**D10** (struct field, loud EMIT) and **D11** (array element, loud CHECK) are both fixed by the
same source rewrite — bind the place to a temp — and both have that rewrite as their control: the
temp-binding `field` and `elem` positions are **182 of 184** correct each in the nullable leg
(228 of 230 counting the plain leg), against `field_place` 78/184 and `elem_place` 22/184. But
they fail at **different stages** and their rep splits do not
match: D10 works in place for newtypes, flat records and a plain `i32[]` and fails for
containers; D11 works in place only for the *niche* reps (`new string`, `new boolean`) and fails
for the boxes too. **Shared outcome-shape, not a proven shared root**, and the differing rep
splits are the reason to say so.

### Not shared, though the position invites it
**D3** (`boolean[][]` printing `0` inside a generic body) is NOT part of Root A. Root A is about
*naming the instantiated type*; D3's instance is named correctly enough to index two dimensions
and produce the right value — only the `print` classifier picks the i32 printer. Its nearest
relative is inventory #1's D1, a print-classifier lookup against an unpopulated table, reached
from a different direction.

## 4. NOT A DEFECT

Everything here was probed on this tip and is correct, is a documented deliberate decline, or was
**my own probe error**. It is here so no agent is spent on it.

### 4a. Sets: there is NO set literal, and the decline is well-messaged
The brief asked whether a set-literal syntax exists. It does not, and every near-miss spelling
declines loudly and usefully:

| spelling | verdict |
|---|---|
| `const s: {[string]: boolean} = { "a", "b" }` | `[ERROR]: expected ':' but found ','` |
| `… = #{ "a", "b" }` | `[ERROR]: Unexpected character '#'` |
| `… = Set("a", "b")` | `[ERROR]: Set expects no arguments` |
| `… = {}` | `[ERROR]: An object literal isn't a map value — construct a map with 'Map()' (or a set with 'Set()'), e.g. 'let m: {[string]: i32} = Map()'` |

**`Set()` is the only constructor**, the type spelling is `{[K]: boolean}`, and the surface is
`.add` / `.has` / `.delete` / `.length` / `.values()` plus a bare `for x in s`
(`tests/cases/sets/basics.vl` is the spec). The whole set population was built on `Set()`
accordingly: 148/206 (`set_str`) and 134/206 (`set_i32`) correct, with every non-correct cell
accounted for by D7 and the loud families D10/D11/D12/D13/D14. **Sets in every non-capture,
non-place-narrow position are clean.**

### 4b. Evaluation counts inside `is` / `match` / place-narrowing constructs — the axis flagged as most likely to hide a defect is CLEAN
**98 of 100 cells correct, `wrong_evalcount` = 0**, over 50 forms × 2 inputs, each form's
expected count derived analytically from the number of times the side-effecting sub-expression
is written in the source. Forms measured, all at the predicted count:

* narrowing a CALL result: `if src() is string`, `match src() { null => … }`,
  `if src() != null`, `src() ?? "DD"`, `src() == null` — **1 each**.
* an INDEX whose subscript has the effect: `if xs[ii()] != null` guard only — **1**; guard *and*
  body — **2** on the hit input, **1** on the miss (short-circuit); `xs[ii()] is string` — **1**;
  `match xs[ii()]` — **1**; `xs[ii()] = 5` — **1**.
* compound assignment, the **documented** counts: `xs[ii()] += 5` — **2**
  (B14: *"`x[i] += v` works and inherits the native-array rule that a compound assignment
  re-evaluates receiver and index"*); `zz[ii()][ii()] += 7` — **4**; `zz[ii()][ii()] = 7` — **2**;
  `zz[ii()][ii()]` read — **2**.
* a MAP/SET key with the effect: `m[kk()] = 3`, `m[kk()] ?? 0`, `m.has(kk())`, `m.delete(kk())`,
  `s.add(kk())`, `s.has(kk())`, `s.delete(kk())` — **1 each**;
  `m[kk()] = (m[kk()] ?? 0) + 1` — **2**; `if m[kk()] != null { print(m[kk()]) }` — **2**/**1**.
* a RECEIVER with the effect, across **five** for-in views: `for q in rr()` over a list, over a
  map (bare), `rr().keys()`, `rr().values()`, over a Set (bare and `.values()`) — **1 each**;
  `rr().length` for list/map/set, `rr()["a"] ?? 0`, `rr()[i]`, `rr().map(…)`, `rr().has("a")` —
  **1 each**.
* a struct receiver narrowed through a field: `if rr().f != null` guard only — **1**; guard and
  body — **2**; two independent reads — **2**.
* a struct-UNION receiver: `if rr() is Cat`, `match rr() { Cat => … Dog => … }` — **1 each**.
* newtype / flat / generic receivers: `rr() as i32`, `rr().tt`, `gid(rr())`, `gid(gid(rr()))` —
  **1 each**.
* `&&` guards: `if srcn() != null && 1 == 1` — **1**; `srcn() != null && srcn() != null` — **2**
  on the hit input, **1** on the miss.
* an if-EXPRESSION condition: `const q = if srcn() > 3 { 1 } else { 2 }` — **1**.

The two non-correct cells are D13's map-index-read family (`bare null needs a struct-typed
context`), which is a *value*-channel reject, not a count. **The `.keys()`/`.values()` double
evaluation that was inventory #1's D2 is fixed and stays fixed at every one of the five views.**

### 4c. Multi-module / imports — 230 of 230 correct
5 import kinds × 23 reps × 2 inputs, every cell a real multi-file program:

* `imp_fn` — `util.vl` exports the producer and the counter; the entry imports both.
* `imp_type` — only the TYPE crosses, including `export flat type FR = { … }` and
  `export type NtI32 = new i32`; the producer stays in the entry and annotates with the imported
  name.
* `imp_generic` — `util.vl` exports `gid<T>`; the entry calls it on the rep value.
* `imp_reexport` — a three-file chain, `entry → mid → util`, with
  `export { src, nCalls } from "./util"` and `export { FR } from "./util"`.
* `imp_annot` — the producer AND the type both imported, then used as a struct-field type in the
  entry.

**Zero silent, zero loud, at both inputs, for every one of sets, i32-keyed sets, both maps,
eight newtypes, nine nested-array shapes and both flat records.** A first-class
"this entire family already works".

### 4d. `-O` / `wasm-opt` output — 4,118 of 4,118 correct at BOTH rungs
Every cell that graded `correct` unoptimised was rebuilt with `-O` and again with `-O3` (the
release profile `--closed-world -O3 --gufa -O3`) and the **optimised module was run**, graded on
the same independent expectation. Nothing moved in either direction. There is **no
optimisation-only defect in this population**.

### 4e. Struct-field ASSIGNMENT as a position — clean apart from D8
| form | cells | correct |
|---|---|---|
| `h.f = src()` | 46 | 46 |
| `h.f = zed(); h.f = src()` | 46 | 46 |
| `gh.f = src()` on a module-global struct | 46 | 46 |
| `h.f = src()` inside a nested function that captures `h` | 46 | 46 |
| `h.f[0] = src()` (element of a field) | 46 | 46 |
| `xs[0].f = src()` (field of an element) | 46 | 46 |
| `m["k"] = src()` then narrowed read | 46 | 34 (12 loud: D13's floors) |
| `h.f = src()` **inside the narrowed block** | 46 | **0 — D8** |

Plus, in the `reps` leg, `field_assign` 228/230, `field2_assign` (`n.inner.f = src()`) 46/46 and
`elem_assign` 228/230. Assignment is a clean position; the one live defect on it is D8, and it is
a *checker* rule, not a storage problem.

### 4f. Capture chains beyond two levels add no axis
`capture2` (two levels) and `capture3` (three levels) produce **identical outcome vectors** to
`capture_local` for all 23 reps × 5 constructs × 2 inputs — 104 correct / 2 compiler trap /
2 loud check / 122 loud emit, three times over. Depth is not an axis in this population; the
storage class (local vs parameter) is, and only for D7.

### 4g. `flat` records, including the `RowAddr` fused-row idiom
`flat_rec` and `flat_nest` are 192/206 each, and all 14 non-correct cells are accounted for:
**8** D11 (`elem_place`), **2** D14 (`gbody`), **2** D8 (`fa_narrowed_block`), **2** D14
(`garr`). Flat records are correct as a binding, parameter, return, global, struct
field, array element, narrowed map value, in-place-narrowed struct field, under all four
narrowing constructs, at all four capture positions, through six generic shapes, across all five
import kinds, and at both `-O` rungs.

The A15 fused-row idiom works as documented — no compiler support needed, and it computes:

    flat type TVr = { value: i64, tt: i32, pad: i32 }
    type RowAddr = new i32
    function slotAt(base: i32, i: i32): RowAddr { return (base + i * TVr.size) as RowAddr }
    function tt(r: RowAddr): i32 { return (r as i32) + TVr.tt }
    // slotAt(0, 2) -> 32 ;  tt(that) -> 40 ;  TVr.size -> 16 ;  TVr.tt -> 8

### 4h. Newtypes / brands
`nt_bool` 204/206, `nt_str` 200/206, `nt_i32`/`nt_i64`/`nt_f64` 194/206, `nt_f32` 192/206,
`nt_struct` 192/206, `nt_litunion` 170/206. The A14 rules hold everywhere they were probed: a
syntactic LITERAL is brand-polymorphic in every position; `as` is both construction and unwrap
**and is numeric-only**, so a newtype over `string` / `boolean` / a struct / a litunion is read
without a cast; `print` of a newtype over a litunion prints the member text (`p`), not the atom
id. The brand-specific silent cells are `nt_str`'s **4** (D4 — `new string` as an
annotated-local and as a field-read generic argument) and `nt_f32`'s **2** (D6 — the f32 array
literal as a generic `T[]` argument, which the controls show is the plain `f32` element, not the
brand). Every other non-correct newtype cell is D11 (`elem_place`, 8 per box rep), D8
(`fa_narrowed_block`, 2 per rep) or the documented `match`-over-litunion decline (32).

### 4i. Nested arrays outside the capture and place-narrow positions
All nine nested-array reps are 138/206, and every one of the 68 non-correct cells belongs to
**D9** (capture, 40 per rep), **D10** (`field_place`, 8), **D11** (`elem_place`, 8), **D13**
(map value, 8), **D14** (`garr`, 2) and **D8** (`fa_narrowed_block`, 2) — 40+8+8+8+2+2 = 68,
exactly. Measured correct by hand and by grid: `xs[0][1]` read and assign, `xs[1].push(7)`, nested
`for`-in, three-deep indexing, `string[][]`/`f64[][]`/`f32[][]`/`i64[][]`/`boolean[][]`/`S[][]`,
and `i32[][]` at every non-capture position including as a struct field, an array element and a
narrowed map value.

### 4j. Deliberate declines, confirmed by reading the message
* `match` over a literal-member union — `match over a union with literal members is not
  supported — compare them with '==' in an if-chain, got NtK?`. **32 cells**, all
  `nt_litunion` × `match_null`. Names the fix. (It is arguably wrong that `match x { null => … }`
  on `NtK | null` is refused for the *null* discrimination, but the decline is documented.)
* `as` is numeric-only: `type Nm = new string` … `n as string` →
  ``[ERROR]: `as` supports numeric conversions only``. My first probe filed this as a finding; it
  is the documented rule, and `print(n)` is the right spelling.
* `print` of an un-narrowed union: `print of a union value (i32?) is type-valid but not yet
  supported by codegen — narrow it first`. 2 cells, and one of them was my own probe error (4k).
* An i32-keyed Map/Set outside its supported positions — a floor that enumerates its own domain,
  though the enumeration contradicts itself (see D13).

### 4k. MY OWN PROBE ERRORS — found and fixed in the generator before concluding
Excluded from every count above; the numbers in §1 are post-fix.

* **A non-literal default for a newtype is not brand-polymorphic.** My first `zed()` returned
  `0 - 1` for `type NtI32 = new i32`. `0 - 1` is not a syntactic LITERAL, so brand adoption does
  not apply and **38 cells** reported `return type mismatch: expected NtI32, got i32`. That is
  the checker being right. Fixed to a literal (`3`).
* **The first grid conflated element/field STORAGE with PLACE-NARROWING.** `elem` and `field`
  both narrowed the place itself, so **256 cells** read as storage defects when they are D10 and
  D11. Split into `elem`/`elem_place` and `field`/`field_place`; the storage positions bind a
  temp and are 228/230 and 182/184 correct, which is what turned D10/D11 into findings with
  clean controls instead of a smear across two axes.
* **`print(m["k"])` is an un-narrowed `i32?`.** My map-increment eval form ended with it and
  reported the documented `print of a union value` `[ERROR]` for 2 cells. Fixed to
  `print(m["k"] ?? 0)`; the form then measures its count (2) correctly.
* **`key() in m` inside `print(...)` is a parse error** — `[ERROR]: expected ')' but found 'in'`.
  Not pursued; the `in` operator was dropped from the eval leg rather than filed.
* **A variable named `is`** — `[ERROR]: expected an identifier but found 'is'`. `is` is a hard
  keyword.
* **`m["k"].length` on a map of sets** is `member access '.length' on non-object
  {[string]: boolean}?` — the map index read's implicit `T?`, documented; my probe forgot to
  narrow.
* **My own grader**, twice: the `hint_only_rc1` hazard described in §0, and a sabotage total I
  wrote as 48 when the legs sum to 52 — caught by the `records == cells` assertion firing
  `MATCH=MISMATCH` on the generator's own axis arithmetic, which is exactly the failure mode the
  assertion exists for.

## 5. Grader discipline — what was proved, and how

### Sabotage, with the counts written down before the run (`_scratch/PREDICTIONS.txt`)

| injected leg | predicted | measured |
|---|---|---|
| S1 programs printing a value the manifest does not expect (12) | 12 `wrong_value` | **12** |
| S2 the callee runs twice, value lines still correct (8) | 8 `wrong_evalcount` | **8** |
| S3 a list index out of bounds (6) | 6 `trap`, 0 `compiler_trap` | **6 / 0** |
| S4 the empty-array-from-annotated-lambda shape (4) | 4 `compiler_trap`, 0 `trap` | **4 / 0** |
| S5 `gid(<annotated string local>)` (4) | 4 `invalid_wasm` | **4** |
| S6 a plain type error (4) | 4 `loud_check_reject` | **4** |
| S7 `src() ?? 0` on a non-nullable (4) | 4 `loud_emit_reject` | **4** |
| S8 hint-and-warning-only files (4) | **0** `hint_only_rc1` and 4 `correct` | **0 / 4** |
| S9 clean controls that must not move (6) | 6 `correct` | **6** |

**Nine legs, nine exact hits.** The `trap` / `compiler_trap` separation is measured, not guessed:
S3's programs write a module (the third `build` stage records its size) and S4's do not.

### Expectation-corruption, run over the SAME programs

| corruption | predicted | measured |
|---|---|---|
| X1 — count line `+1` on all 100 EVAL-leg cells | 96 `wrong_evalcount`, 0 `correct`, 2 `loud_check`, 2 `loud_emit` | **98 / 0 / 0 / 2** |
| X2 — value AND count corrupted on 20 cells that were correct | 20 `wrong_value`, 0 `wrong_evalcount` | **20 / 0** |

X2 is exact, and it proves the ranking rule the columns depend on: **a wrong value outranks a
wrong count.**

X1 is reported as a **miss of my own bookkeeping, not of the grader**. I wrote the prediction
from a grid snapshot taken *before* I fixed the `print(m["k"])` probe error (4k). Post-fix the
eval leg is 98 correct + 2 loud emit, so the correct prediction was 98/0/0/2 — which is what was
measured, cell for cell: every correct cell moved to `wrong_evalcount` and the two loud cells did
not move, because **a loud verdict outranks a corrupted count**. The lesson is the brief's own:
a prediction must be re-derived after any generator change, or it silently measures the wrong
grid.

### Structural guarantees
* **One result file per cell.** `runcell2.sh` and `optcell.sh` each write `<cell>.res` and never
  append to a shared file, so nothing can tear under `-P4`.
* **`records == cells` asserted against the AXIS count**, printed by `grade2.py` as
  `cells=5180 result_files=5180 MATCH=OK` **and**
  `axis_computed_cells=5180 generated=5180 MATCH=OK`. The second line is the one a polluted
  directory cannot fake, and it caught my sabotage arithmetic.
* **Graded on the run value, never the build verdict.** D3 is check-clean, run-clean, rc 0 — a
  verdict-grader scores it a pass; it is the top silent row here. Conversely D6's control is a
  *loud* cell whose program is *more* correct than the silent one beside it.
* **Not a dead grader.** 5,180 cells spread over **6 of the 9 columns** (`correct`,
  `wrong_value`, `invalid_wasm`, `compiler_trap`, `loud_check_reject`, `loud_emit_reject`); the
  largest is 79.5%, not 100%; **32 of 43 reps** and **29 of 101 (leg, position) pairs**
  contribute cells to more than one column. The three columns that did not fire on the live
  population — `wrong_evalcount`, `trap`, `hint_only_rc1` — were each proved live (or proved
  zero-by-construction) by a sabotage leg with a predicted count.
* **Harness-suspicion rule.** Any (position, construct) pair failing identically across ALL reps
  and both inputs was read by hand before being filed. That rule is what produced the two
  generator fixes in 4k — `elem_place`/`field_place` and the newtype `zed()` — and both would
  otherwise have been filed as defects.
* **A named compiler separates trap roots.** `vl build compiler/entry.vl --names -o named.wasm`,
  then `--compiler named.wasm`, turns the two compiler traps' backtraces into VL function names.
  D1 and D2 share **zero** frames: D1 is `emitProgram → emitFuncCode → fnHasStrOp → … →
  sFieldIndex`, D2 is `checkSrc → checkProgram → … → nulElemListRetName`. Without the names both
  are "13 frames of wasm function indices" and would have been one row.

## 6. Coverage gaps of my own

Stated plainly rather than reported as a silent zero.

* **Closures / function values as a rep** — not built. D2's shape lives there and the playbook
  records that the fuzzer's grammar never reaches `emitCapturedCall`, so a closure rep would need
  a constructed population. The whole `(…) => …` family is unmeasured here.
* **`f32[]` and `i64[]` as first-class reps of the main grid** — they appear only in the `garg`
  leg. Their non-generic positions are inherited from inventory #1 (`list_f32` was its
  worst-served rep at 76/340) and were **not** re-measured.
* **Set and map ITERATION as a construct** — `for x in s`, `.values()`, `.keys()` are measured
  only in the eval leg, at one receiver form each. The main grid's constructs are read-and-narrow
  only, so "sets iterate correctly at every position" is **not** established.
* **`flat` layout REJECTS** — a `boolean` field, a heap-reference field, a generic field, a cycle.
  The corpus pins them (`tests/cases/types/flat-*-rejects.vl`); I measured only the accepting half
  plus the fused-row idiom.
* **Nested-array MUTATION at the capture position**, and `push` / `slice` / `map` / `filter` over
  a nested array — only `[i][j]` read, `[i][j]` assign and `push` at a local were measured (all
  correct, by hand).
* **Generics beyond one type parameter and one level of alias** — `gpair<A,B>` and `Box<T>` were
  built; `Box<Box<T>>`, a generic alias as a generic argument, and recursive generic aliases were
  not. The corpus has cases for all three.
* **Multi-module × the CAPTURE position, and multi-module × generics-over-containers.** The module
  leg used `const_local` and `field` only, so its 230/230 licenses "imports are clean for these
  reps at these two positions", **not** "imports are clean everywhere". Crossing the module axis
  with D4's argument forms is the obvious next probe.
* **A third set input** (populated / empty / after-`delete`) — only populated vs empty were run,
  so a defect that needs a tombstone would not be visible.
* **`-O` / `-O3` on cells that are NOT correct at `-O0`.** By construction the opt leg is a
  regression check on the clean subset: a loud reject stays loud and an invalid module cannot be
  optimised. An `-O`-only *improvement* (a module that is invalid at `-O0` and valid after) would
  not be visible either.
* **The i32-keyed floor's full enumerated domain.** Its message lists seven positions; I measured
  binding, parameter, return, `| null`, array element and map value, but not "a closure result".
* **`wasm-tools validate` on each invalid module.** The engine's rejection was taken as the
  verdict (it is the same validator `vl run` uses); I spot-checked disassembly only through the
  reported offsets and messages, not per cell.

---

## Orchestrator's note at integration — the base, and what has since closed

This sweep ran against master `61ea4def`. **Three PRs landed while it ran** (#1449 the
aliased-write perf fix, #1450 the compiler-trap class, #1451 the narrowing-overlay leak), so its
findings need re-deriving on the tip before any of them is briefed — the same staleness that
retired fourteen rows from inventory #1.

Re-derived on master `9907d711`:

| row | filed | on the tip |
|---|---|---|
| **D3** silently wrong value | `gtake<T>(x)` printing `x[0][1]` over `boolean[][]` gives `0` | **LIVE** — prints `0` where the direct read prints `false` |
| **D4** invalid wasm | `const y: string = "aa"; gid(y)` | **LIVE** — check-clean invalid wasm; deleting the annotation prints `aa`, so the annotation is the axis |
| **D8** loud check, 46 cells | `if w.f != null { w.f = src() }` | **CLOSED by #1451** — now accepted, which is exactly what that slice widened |
| **D1** compiler trap, 8 cells | a captured `{[i32]: string}` | **does not reproduce at my spelling** on the tip (`.length` on a captured i32-keyed string map checks clean). #1450 fixed the captured-map trap family; whether D1's exact shape survives needs the sweep's own program, not mine |

**On D1 and the CHANGELOG:** the sweep says it "corrects a CHANGELOG correction", on the grounds
that the earlier work measured the *for-in receiver* rather than the *capture*. That reading is
fair about #1450's pre-merge state, but #1450 shipped a capture-position fix too, and my probe of
the captured i32-keyed string map is clean on the tip. **Both claims are about different
positions, and neither is simply wrong** — which is itself the lesson: a defect named by its
*outcome* (a compiler trap) and its *value type* still needs its **position** stated, or two
findings about different positions read as a contradiction.

**Root A is the live, high-leverage item** and is now in flight: D3 + D4 + D5 + D6 plus two
already-loud rows, all at `monoArgTyName`'s missing arm-set, with the loud floor **in the same
function** that these spellings route around.

## What this sweep measured as CLEAN — the part that stops agents being wasted

- **Nullability inverted.** Nullable cells: **2,944 → 0 silent.** Plain cells: 2,236 → 76. That is
  the exact inverse of inventory #1, where nullable reps held nearly every silent cell. The
  nullable-rep programme has done its job; **the remaining silent class is in PLAIN types**, and
  briefs should stop reaching for nullable axes first.
- **Evaluation counts inside `is` / `match` / place-narrowing are clean** — 98 of 100 over 50
  forms, **0 wrong counts**, including the documented `+=` counts of 2 and 4. I had flagged this as
  the likeliest place another eval-count defect hid, after two were found nearby. It was not.
- **Multi-module 230/230** across five import kinds, including `export flat type`, an exported
  newtype, and a three-file re-export.
- **`-O` and `-O3` both 4,118/4,118**, with the optimised module rebuilt and run.
- **Capture depth beyond one level is not an axis** — identical vectors, so the earlier
  "three-level chain" worry is settled.
- Struct-field assignment, `flat` records including the fused-row idiom, and the brand rules all
  hold.

## Two process notes worth keeping

**Its grader binned `vl check` dying inside `vl-compiler.wasm` as "just a hint"** — the exact
failure direction the brief warned about, caught and fixed before any conclusion. A compiler trap
is not a diagnostic, and a grader that classifies by exit code alone will merge the two.

**It reported one prediction MISS of its own bookkeeping** (a sabotage predicted 96/0/2/2 and
measured 98/0/0/2, because the prediction was written from a snapshot taken before its own probe
fix). Nine other legs hit exactly. Reporting the miss is the standard.

**A brief contradiction it resolved sensibly and flagged:** I asked it to commit its generator into
`_scratch/`, while the gates require `git status` clean apart from the doc with `_scratch/`
*untracked*, and the playbook forbids `git add`-ing it. It followed the gate, left the harness
untracked, and made the doc self-contained instead — every repro and control pasted in full. The
brief was wrong; future briefs should ask for a self-contained doc rather than a committed harness.
