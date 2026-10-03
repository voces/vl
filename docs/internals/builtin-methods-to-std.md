# Built-in methods to std — survey and migration plan (lane BI, phase 1)

> Status: design survey. **No built-in is removed by this document**, and no compiler or std
> source changed. Every number below was measured on `origin/master` at `f6e17953b`
> (2026-10-03) unless the row says otherwise. The commands and prototypes live in §8.

**The ruling this implements (owner, 2026-10-03, A′, answering sunpa's SP-003):** compiler
built-in methods are **storage operations only**. Everything VL can write itself moves to std
and needs an explicit import. Auto-import, and method lookup into a type's std module, were
declined: the owner prefers explicit imports. That also retires the "configurable prelude"
that `docs/guide/strings-design.md` OQ-3 named as the ergonomic follow-on, because a prelude
is an auto-import. The split today is historical: `.map`, `.filter`, `.slice` and `.push`
were built in at #258, before generics, and `std:array` (#536) never absorbed them. Strings
have built-in `includes` and `indexOf`; lists get those from `std:array`.

**The short answer.**

- **Writable built-ins:** nine on lists and strings, plus a tenth that is redundant.
  - Lists: `map`, `filter`, `slice` and `get`.
  - Strings: `indexOf`, `includes`, and the code-point trio `cpAt` / `cpLen` /
    `isCharBoundary`.
  - `charCodeAt` is the redundant one: a second spelling of `s[i]`.
- **Storage built-ins that stay:**
  - lists: `push`, `pop`, `clear`, `length`, indexing;
  - strings: `length`, indexing, the `slice` view, `bytes`;
  - maps and sets: `set`, `get`, `add`, `has`, `delete`, `keys`, `values`, `length`,
    indexing.
- **Five prerequisites block the move.** Each was found by a prototype, not by reading.
  1. **Contextual lambda typing on the UFCS path (D1484, open).**
     `xs.map((v) => v + 1)` types today only because the built-in seeds `v`. The same call
     against a std generic is a check reject. **957 of the corpus's 958** `.map`/`.filter`
     sites pass exactly this un-annotated lambda.
  2. **`__array_copy__` lowers only i32/boolean/f64 lists.** A std `slice` built on it
     refuses at emit on i64, f32, string and record lists.
  3. **`__array_new__(n, f(x))` refuses at emit** when the fill is a call through a
     function-typed parameter. Hoisting the fill into a `const` works.
  4. **Any `__trap__("message")` in an imported module adds the print host imports**, even
     in a function nothing calls. `std:array`'s `filled` has one, so importing anything
     from `std:array` gives a module four host imports. The seed must load with none, so the
     compiler cannot import `std:array` today.
  5. **Two std modules cannot export the same `self` name to one file.**
     `import { indexOf } from "std:array"` beside `import { indexOf } from "std:str"` is
     `Duplicate binding`. Moving the string `indexOf`/`includes` therefore makes some call
     sites CHANGE spelling, which contradicts "call sites unchanged". `lastIndexOf` already
     has this problem today.
- **Performance parity.** These are fuel ratios at `-O` (std ÷ built-in, per element).
  - `slice` via `__array_copy__`: **1.06×**.
  - `map`: **1.29–1.51×**.
  - `filter`: **1.44–1.86×**.
  - string `indexOf`: **1.22×**.
  - `cpLen`: **0.82×**. The VL version is faster.

  The gap is the per-element bounds check and the heap-resident receiver. The built-in's
  loop has neither. A user's hand-written loop has both, so the fix that closes the gap is
  one every user loop wants (§3.3).
- **Compile cost.**
  - Importing a module into a plumb-shaped 2 MB unit costs **+15% to +22% guest fuel**,
    whatever is imported. Plumb's real units already import modules, so they have already
    paid it.
  - Separately, one anonymous lambda anywhere in that unit costs **+254%**. It is
    unrelated to this migration, and is reported in §3.5 because it dwarfs everything here.

---

## 1. Inventory — what the checker and the emitter recognise

The ground truth is the checker's member-call arms, `checkMemberCallNode`
(`compiler/typecheck.vl`). `builtinMethodClaims` reads the method-name tables `listMethodNames`
/ `strMethodNames` / `mapMethodNames`, and `memberRungOnTy` uses that answer to rank a
built-in above a field and a `self`-function (D2517). Five other places restate the same set,
and the removal has to update every one:

- `check_query.vl`'s `memcPush`, the editor completion list (strings only);
- `collMethodKind` and `builtinMethodEffect`, the effect tables;
- `holeArrMethod` and `holeMapMethod`, which make an un-annotated parameter a list or a map;
- `esMethodBuilds`, the allocation table;
- `rcwSameElems`, which covers `filter`, `slice` and `values`.

The emitter recognises the calls by name in `emit_collect`, `emit_mono`, `emit_classify` and
`wasmEmit`. Those sites are listed in §5.6.

A receiver with no row below has no built-in methods. That covers records, unions, functions,
type parameters and numbers. `n.toString()` is `std:fmt`'s, by the 2026-09-01 ruling that
this one generalises.

### 1.1 Lists — `T[]`, `readonly T[]`, and `u8[]` (the packed byte list)

| method | signature | class | std home | std today |
| --- | --- | --- | --- | --- |
| `xs[i]`, `xs[i] = v`, `.length` | — | **storage** | — | — |
| `push(...vs)` | variadic; a spread argument appends its source; pins an empty `[]`'s element type | **storage** | — | `std:array.extend` is the list-to-list twin |
| `pop()` | `→ T \| null` (`u8[]`: `i32 \| null`) | **storage** | — | — |
| `clear()` | `→ void`, O(1) length reset | **storage**: VL can only pop n times | — | — |
| `get(i)` | `→ T \| null` (`u8[]`: `i32 \| null`), a miss is `null` | **writable**: `if i < 0 \|\| i >= xs.length { null } else { xs[i] }` | `std:array` | none. **`std:idtable` exports a `get` already** (§4.6) |
| `slice(start, end?)` | `→` a NEW list, clamped, negatives count from the end; on a `readonly` receiver the result is a fresh `T[]`, otherwise the receiver's own type | **writable** (`__array_new_default__` + `__array_copy__`). Blocked by prerequisites 2 and 5 | `std:array`, and `std:bytes` for `u8[]` | none |
| `map(f)` | `f: (T) => U` with exactly one parameter, `→ U[]`; the element type seeds an un-annotated lambda | **writable**. Blocked by prerequisite 1 | `std:array` | `mapIndexed(self, f: (T, i32) => U)`. Its comment says "the core's bare `.map` passes only the element" |
| `filter(p)` | `p: (T) => boolean`, `→` same rule as `slice` | **writable**. Blocked by prerequisite 1 | `std:array` | none |

These answer by `std:array`'s UFCS today, not as built-ins: `indexOf`, `lastIndexOf`,
`includes`, `count`, `reduce`, `reverse`, `mapIndexed`, `extend`, `concat`, `sort`, `sorted`.
That is SP-003's asymmetry.

**`u8[]` is the hole in the "just move it" picture.** `u8` is a storage type, so a type
parameter never binds it and a `u8[]` is not a `T[]` (`` `u8[]` cannot be passed to a generic
parameter``, measured). Every `std:array` export misses `u8[]`, and its header says so.
Today `bytes.slice(1, 3)`, `bytes.get(i)` and `bytes.pop()` work as built-ins, while
`bytes.map`/`.filter` are already refused (`map callback: parameter expects i32, got u8`).
Moving `slice` and `get` therefore needs a `u8[]` twin in `std:bytes` with the same name,
which runs straight into prerequisite 5.

### 1.2 Strings

| method | signature | class | std home | std today |
| --- | --- | --- | --- | --- |
| `s[i]`, `.length` | a byte, a byte count | **storage** | — | — |
| `slice(start, end)` | **2 arguments required**, unlike the list form; a VIEW: `struct.new $str(s.backing, s.start + start, len)`, O(1), no copy | **storage**. VL has no route to a header over a shared backing: `fromCodePoints` re-encodes and copies. Stays | — | — |
| `bytes()` | `→ u8[]`, a COPY, one `array.copy` | **storage-adjacent**. VL could write it as a byte loop, but the built-in is a bulk copy between two storages (OQ-3 addendum). Recommend it stays (Q4) | — | `std:utf8.encodeUtf8` wraps it |
| `indexOf(sub)` | `→ i32`, -1 when absent, `""` found at 0 | **writable** | `std:str` | private `findFrom`; the header says "`indexOf` and `slice` stay in the core" |
| `includes(sub)` | `→ boolean` | **writable** | `std:str` | none |
| `charCodeAt(i)` | `→ i32` — **the BYTE at `i`, identical to `s[i]`** (measured: `"aé€".charCodeAt(1)` = `s[1]` = 195) | **writable, and redundant**. The name promises a UTF-16 code unit (JavaScript) and delivers a byte | **retire**, pointing at `s[i]` (Q3) | — |
| `cpAt(i)` | `→ i32`, the code point at byte offset `i`; U+FFFD mid-sequence; traps off the end | **writable**: a decode over `s[i]` | `std:str` (or `std:utf8`) | `std:utf8` decodes whole strings |
| `cpLen()` | `→ i32`, O(n) | **writable** | `std:str` | none |
| `isCharBoundary(i)` | `→ boolean`, a lead-bit test | **writable** | `std:str` | none |

`strings-design.md` OQ-3's **addendum** put `cpAt`/`cpLen`/`isCharBoundary`/`bytes` in the
core because each "needs the UTF-8 storage". By its own text, though, the storage is reachable
through `s[i]`: "which is the byte they would have to re-derive their answer from". Under A′
that makes the trio writable. `bytes` keeps the one argument the trio lacks, a bulk
`array.copy` against a per-byte loop. **A′ and the OQ-3 addendum disagree about the trio,
and that is an owner question (Q4), not this lane's call.**

### 1.3 Maps `{[K]: V}` and sets `Set<K>`

| method | signature | class |
| --- | --- | --- |
| `m[k]`, `m[k] = v`, `.length` | — | storage |
| `set(k, v)` (map only) | `→ void`, pins an empty `Map()`'s key and value | storage |
| `get(k)` (map only) | `→ V \| null` | storage |
| `add(k)` (set only) | `→ void`. On a `boolean`-valued map it is a refusal that names `m[k] = true` | storage |
| `has(k)`, `delete(k)` | `→ boolean` | storage |
| `keys()` | `→ K[]` | storage: reads the table's insertion-ordered key column |
| `values()` | `→ V[]` (set: `K[]`) | storage |

All of these read or write the hash table's own columns. VL has no way to reach those columns
except these methods, so **nothing moves**.

### 1.4 Not methods, listed so the inventory is complete

These ambient free built-ins are outside A′, which is about methods:

- `print`, `Map()`, `Set()`;
- `fromCodePoint(i32)`, `fromCodePoints(i32[])`, the only way to make a string from code points;
- the numeric intrinsics `sqrt`, `abs`, `floor`, `ceil`, `trunc`, `nearest`, `min`, `max`,
  `copysign`, `clz`, `ctz`, `popcnt`, `rotl`, `rotr`, `divU`, `remU`, `ltU`, `leU`, `gtU`,
  `geU` and the bitcasts. Each is one wasm instruction;
- std's floor: `__array_new__`, `__array_new_default__`, `__array_copy__`, `__trap__`.

Did-you-mean only: `.size`/`.count` → `.length`, `.append`/`.add` on a list → `.push`, and
`.contains` → `.includes`. The last one points at a name that, after the move, needs an
import.

---

## 2. Call-site census

**The population: call sites in `.vl` source, read only.** Counting has two steps.

1. A textual count of `.name(`, with comment lines and string-literal text stripped
   (`census.py`). The table shows **calls/files**.
2. A **type-accurate split** for the four names that two receiver kinds share (`split.py`).
   A scratch build of the checker has four arms disabled: list `slice`, list `get`, string
   `indexOf` and string `includes`. Each such site becomes a positioned error naming its
   receiver, and the errors are de-duplicated by (file, line, col). The split was
   control-checked on a 6-line file with one site of each kind, and it found all four.

| method (writable) | compiler/ | std/ | silent-sweep corpus | capability-probes | tests/ | plumb src+tools+vl-probes | sunpa | glean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| files scanned | 34 | 18 | 9,489 | 668 | 4,441 | 214 | 16 | 319 |
| list `.map` | 0 | 0 | 778 / 522 | 10 / 9 | 185 / 94 | 1 / 1 | 0 | 0 |
| list `.filter` | 0 | 0 | 180 / 112 | 0 | 92 / 51 | 0 | 3 / 1 | 0 |
| `.slice` (all) | 278 / 21 | 14 / 4 | 41 / 41 | 10 / 4 | 171 / 61 | 256 / 32 | 6 / 2 | 62 / 48 |
|   of which **list** (typed) | **1** | 0 | **21** | **8** | **72** | **20** | **8** | **0** |
| `.get` (all) | 65 / 6 | 0 | 195 / 183 | 68 / 41 | 162 / 75 | 3 / 2 | 2 / 1 | 2 / 2 |
|   of which **list** (typed) | **0** | 0 | **16** | **13** | **57** | **0** | **0** | **0** |
| `.indexOf` (all) | 36 / 4 | 0 | 20 / 20 | 0 | 53 / 25 | 63 / 13 | 0 | 0 |
|   of which **string** (typed) | **36** | 0 | **20** | 0 | **14** | **21** | 0 | 0 |
| `.includes` (all) | 7 / 2 | 0 | 20 / 20 | 0 | 24 / 12 | 43 / 3 | 1 / 1 | 0 |
|   of which **string** (typed) | **7** | 0 | **20** | 0 | **6** | **0** | 0 | 0 |
| `.charCodeAt` | 7 / 1 | 0 | 20 / 20 | 0 | 22 / 7 | 100 / 15 | 0 | 202 / 92 |
| `.cpAt` | 0 | 0 | 20 / 20 | 0 | 9 / 6 | 0 | 0 | 0 |
| `.cpLen` | 0 | 2 / 1 | 0 | 0 | 8 / 5 | 0 | 0 | 0 |
| `.isCharBoundary` | 0 | 0 | 20 / 20 | 0 | 9 / 4 | 0 | 0 | 0 |
| `.bytes` (stays) | 0 | 1 / 1 | 0 | 3 / 2 | 26 / 10 | 21 / 11 | 1 / 1 | 2 / 1 |

How to read the table:

- **The split is exact; the textual row is an upper bound.** Every list `.slice` the split
  did not count is a string slice, which stays.
- Every `.get` it did not count is a map's `get` (storage), `std:idtable`'s, or a user
  `self`-function.
- Every `.indexOf`/`.includes` it did not count already answers without a built-in, through
  `std:array`'s list function or a user `self`-function: in plumb, 42 `indexOf`s and all 43
  `includes`s.
- sunpa's list `.slice` reads 8 typed against 6 textual, because the textual pattern misses
  a call split across lines.

**Absent or partial trees:**

- `~/sunsuz` holds no `.vl` source.
- `~/veldt` is not on this machine.
- One plumb file, `vl-probes/synth/s4000.vl` (a 46 MB synthetic probe), runs the checker out
  of GC heap and is not in the split. It also fails without the scratch build.
- **`~/plumb/out` (309 GB, 32,143 generated `.vl` files) is excluded.** A seeded sample of
  300 files (554 MB) holds 36 `.slice(`, 33 `.charCodeAt(`, 4 `.bytes(` and 3 `.indexOf(`,
  so the transliterator does not emit the moving methods in bulk.

What the census says about the migration:

- **The compiler is nearly untouched.** It has 1 list `slice`, 0 `map`/`filter`/list `get`,
  43 string `indexOf`/`includes` and 7 `charCodeAt`. Its 277 string `slice`s stay built in.
- **The consumers are lightly touched.** plumb has 20 list slices, 21 string `indexOf`s and
  100 `charCodeAt`s. glean's whole exposure is **202 `charCodeAt`s**. sunpa has 8 list
  slices and 3 filters.
- **The corpus is where it bites.** 522 curated `distilled/named/` cells call `.map`/
  `.filter`, and **957 of the corpus's 958** such sites pass an un-annotated lambda
  (`lam.py`). In `tests/` the figure is 153 of 276, and 48 annotate. Without D1484, every
  one of those cells moves `runs → not-runs`, which the corpus gate blocks.

---

## 3. Performance parity

### 3.1 What the fast paths emit

- **`map` / `filter`** — `emitMapFilter`, 315 lines, plus the `mf*` classifiers and
  `collectMapFilterUse`. About 1,000 lines all told.
  - It evaluates the receiver once into a reserved scratch frame and builds the callback's
    closure once.
  - It allocates the destination backing with one `array.new_default` of exactly `n`
    elements, so it never grows.
  - It then runs `block { loop { i >= n br; … } }`. The element read is `array.get` on the
    **backing** with no logical-length check, because `i < n` is the loop's own condition.
    The callback is a `call_indirect` through the closure, and `filter` reads each element
    once (D3060).
  - It wraps the backing as `struct.new $list(back, j, n)`.
  - Every element kind has its own source and destination type pair (i32, f64, i64, f32,
    string, ref slot, packed `u8`).
- **list `slice`** — `emitArrSlice`, 151 lines. It clamps both bounds, then emits one
  `array.new_default` of the out length and one `array.copy`. It shares the map/filter
  scratch frame (D2332).
- **list `get`** — `emitListGetOr`/`Go`, 54 lines, a fused `xs.get(i) ?? d`.
- **string `slice`** — a view header. Stays.
- **string `indexOf` / `includes`** — `emitStrIndexOf`, 133 lines. A skip loop hoists
  `needle[0]`, and a verify loop runs inside it. `includes` is `indexOf != -1`.
- **`charCodeAt`** — the same guarded backing read that `s[i]` emits.
- **`cpAt` / `cpLen` / `isCharBoundary`** — a call to the `__utf8_dec__` / `__utf8_cplen__`
  helpers, or one lead-bit test.

The removable fast-path code in the named functions comes to **≈1,600 lines**, counting
function bodies only and excluding `emitStrBytes`. On top of that come the checker arms and
the name tables of §1.

### 3.2 Measurements

**The method.**

- Each prototype runs on a microbenchmark built at `-O` (`fuel.py`). The benchmark makes an
  N = 10,000 element list and applies the operation 50 times; for `slice`, each call's range
  covers almost the whole list. Its results feed a checksum that it prints.
- **Program fuel** is wasmtime's instruction count, so load cannot move it. wasmtime prints
  no total, so `fuel.py` finds the exact count by bisecting `-W fuel=N` to the smallest value
  that does not trap. The one host import is served by a no-op stub, and correctness was
  checked separately with `vl run`: every pair prints the same checksum.
- A build of the list setup alone is subtracted, and the remainder is divided by the 500,000
  element-visits.

**Fuel per element at `-O` (bytes of the `-O` module in brackets).** The `std` columns are
prototypes:

- `mapA` preallocates with `__array_new__(n, first)` and then does indexed stores;
- `filterP` and `mapP` push;
- `…F` reads with `for x in self`;
- `sliceP` is `__array_new_default__` + `__array_copy__`, and `sliceQ` pushes.

| op | elem | built-in | std, best variant | ratio | std, push variant | ratio |
| --- | --- | --- | --- | --- | --- | --- |
| map | i32 | 24.0 (322 B) | 34.1 `mapA` (507 B) | **1.42×** | 48.1 | 2.00× |
| map | f64 | 22.0 (553 B) | 33.1 `mapA` (743 B) | **1.51×** | 47.1 | 2.14× |
| map | record | 25.0 (358 B) | 36.1 `mapA` (558 B) | **1.44×** | 50.1 | 2.00× |
| map | string | 52.0 (450 B) | 67.1 `mapA` (654 B) | **1.29×** | 77.1 | 1.48× |
| filter | i32 | 28.3 (340 B) | 41.6 `filterF` (583 B) | **1.47×** | 47.6 | 1.68× |
| filter | f64 | 28.9 (578 B) | 47.9 `filterF` (825 B) | **1.66×** | 53.9 | 1.86× |
| filter | record | 30.3 (375 B) | 43.6 `filterF` (618 B) | **1.44×** | 49.6 | 1.64× |
| filter | string | 31.0 (386 B) | 50.1 `filterF` (629 B) | **1.62×** | 56.1 | 1.81× |
| slice (per call) | i32 | 20,055 (347 B) | 21,264 `sliceP` (505 B) | **1.06×** | 430,530 | 21.5× |
| slice (per call) | f64 | 20,055 (581 B) | 21,265 `sliceP` (741 B) | **1.06×** | 430,531 | 21.5× |
| slice (per call) | record | 20,055 (373 B) | **emit refusal** (prerequisite 2) | — | 440,525 | 22.0× |
| slice (per call) | string | 20,055 (387 B) | **emit refusal** (prerequisite 2) | — | 440,525 | 22.0× |

At `-O3` the ratios widen rather than close: i32 `map` is **1.71×** (20.0 against 34.2 per
element) and i32 `filter` **1.79×**.

**Strings.** The input is a 12,006-byte string, searched 200 times; the needle is found at the
end half the time and is absent half the time. The prototypes are in §8's `sproto.vl`.

| op | built-in, fuel/call | std prototype | ratio | `-O` bytes, built-in / std |
| --- | --- | --- | --- | --- |
| `indexOf` / `includes` | 216,100 | 264,200 | **1.22×** | 651 / 693 |
| `cpLen` | 440,200 | 360,200 | **0.82×** (VL faster) | 773 / 557 |

**Size.**

- One program with ten `map`+`filter` call sites builds to **1,619 B** with the built-ins and
  **1,729 B** with `std` (+7%) at `-O`.
- A std function is instantiated once per element type, while the built-in inlines a loop at
  every site. So the size cost is a constant per instantiation and shrinks relative to the
  program as the number of call sites grows.

### 3.3 Why std loses, and what closes it

The `-O` disassembly of `mapA` over `i32[]` shows two costs that the built-in does not pay.
The callback is not the difference: binaryen inlined it into the std instance, while the
built-in's loop keeps a direct `call`.

1. **Every `self[i]` and `out[i]` is bounds-checked against the wrapper's logical length**:
   `select(-1, i, i >=u len)` feeding `array.get`/`array.set`. The built-in reads the backing
   directly, because its loop bound is the length it read.
2. **The receiver stays on the heap.** In the built-in case binaryen's Heap2Local
   scalar-replaces the source list entirely, so its backing and length live in locals. With
   `std`, the list escapes into a call that is not inlined, so each access is a `struct.get`.
   binaryen does not inline a function containing a loop by default.

Neither cost is special to std. **It is exactly the cost of a user's own hand-written
`while i < xs.length { … xs[i] … }` loop.** So the fix that closes the gap is not a fast path
for std. It is **bounds-check elimination for an induction variable bounded by the receiver's
length, where nothing in the loop body shrinks the receiver**, and it speeds up every user loop
along with std. This document does not attempt it. The precedent for accepting the interim
cost is `toString`'s retirement (DECISIONS.md, 2026-09-01): the pure-VL renderer measured
5.7× the built-in, the lowering was **deleted rather than kept as a hidden fast path**, and
the cost became a library-quality item. These ratios (1.06×–1.86×) are well inside that
precedent.

**Do not keep the fast path behind the std name.** That would recreate the two-meaning problem
the `toString` ruling refused. It would also keep ≈1,600 lines alive, in the
ladder-per-element-kind shape whose missing arms are this compiler's signature defect
(OQ-3 reason 1).

### 3.4 Compile cost — `scripts/plumb-shape-cost.py`

**The gate itself passes on this branch, because nothing under `compiler/` changed:**

```
main fuel 7,854,055,344 against 8,063,154,591 (-2.6%, bar +5%) ok
tail fuel 5,706,407,684 against 5,854,853,494 (-2.5%, bar +5%) ok
plumb-shape cost ok
```

The CPU rows were not graded ("box busy"). The generated units contain **no** `map`, `filter`,
`slice`, `indexOf` or `includes`, so the gate cannot see this migration.

To price it, `plumb/plumb*.py` appends one small function to the MAIN unit and measures the
compiler's guest fuel. It uses the gate's own flags, `--names -O --import-memory`, with
`wasm-opt` skipped, as the fuel build skips it.

| unit variant | compile fuel | vs plain |
| --- | --- | --- |
| plain unit | 7,854,053,566 | — |
| + built-in `xs.map(namedFn).filter(namedFn)` | 8,340,934,950 | +6.2% |
| + the same through `std` prototypes (`./proto`) | 9,635,853,485 | +22.7% |
| + the same through a copy of `std:array` with the prototypes appended | 9,774,239,166 | +24.4% |
| + `import { mapA } from "./proto"` only, nothing called | 9,582,097,453 | +22.0% |
| + `import { indexOf } from "std:array"` only, nothing called | 9,029,009,418 | +15.0% |

**Almost all of the std cost is the IMPORT, not the functions.**

- An import that nothing calls costs 15–22% of the unit.
- On a 20-line program, importing and calling one name from `std:array` takes compile fuel
  from 3.4 M to 22.5 M.
- That points at the multi-module merge, not at monomorphization.
- plumb's real units already import `src/rt`, `src/sse` and others, so plumb has already
  paid this cost and the migration adds little to it. A single-module program pays it once,
  on its first std import. It is worth a profiling row of its own; the migration does not
  cause it.

### 3.5 An unrelated cliff the measurement tripped over

The same harness measured another variant: a 4-line tail holding **one anonymous lambda**
(`const f = (v: i32) => v * 3 + 1; return f(xs[0])`).

- Compile fuel went from 7.85 G to **27.81 G**, which is **+254%**.
- The same `map` with a NAMED function instead costs +6.2%.
- That is not a migration matter, and it is reported here because nothing else measures it.
  The plumb-shape units hold no lambda, so the gate is blind to it.

**Recommendation:** file it as its own row, using the witness in `plumb/plumb2.py`'s
`lambda-only` variant.

---

## 4. Semantic differences and name collisions (for the std-api-reviewer)

### 4.1 Callback typing (blocking)

The built-ins seed an un-annotated lambda's parameter from the element type. A UFCS call to
any `self`-function does not, and that is D1484 (open, clause 2).

- `[1, 2, 3].filterP((v) => v > 1)` is a check reject.
- `filterP([1, 2, 3], (v) => v > 1)` runs.
- `xs.sort((a, b) => a < b)` against `std:array.sort` fails the same way today.

D1484 must close before the first move.

### 4.2 `self` must be `readonly T[]`

The built-in `map`, `filter` and `slice` accept a `readonly T[]` view. A `self: T[]` std
function refuses one: ``no method 'filterP' for readonly i32[] — … a readonly list is not a
growable one``. The prototypes pass once retyped to `self: readonly T[]`, the convention
`std:array.concat` already follows. For the same reason, `std:array`'s
`indexOf`/`includes`/`count`/`reduce` probably want `readonly` too. That is a separate review
item.

### 4.3 The result type

- The built-in `filter` and `slice` return the receiver's own type, or a fresh `T[]` from a
  readonly view (`listBuiltResultTy`).
- A std `filter<T>(self: readonly T[], …): T[]` returns `T[]`.
- An alias of a list type is the same type, so nothing changes for one.
- A nominal list type would differ, if one exists. Check this before moving.

### 4.4 Defaults and arity

- The list `slice` takes 1 or 2 arguments. A default parameter reproduces it:
  `end: i32 = 2147483647` clamps to the length, and that was measured to work as UFCS.
- The string `slice` requires exactly 2. That inconsistency predates this lane, and the move
  does not touch it.

### 4.5 A shrinking receiver

- The built-in `map` reads the **backing** up to the `n` it read first. A callback that
  `pop`s the receiver therefore reads stale slots past the logical length, silently.
- A std `map` traps at the first index past the new length.
- The std behaviour is the safer one. It is still a change, and the rubric (§2, "silently
  lossy") says it should be stated.

### 4.6 Name collisions — prerequisite 5

VL has one flat namespace and no namespace import, and one file cannot import the same name
from two modules (`Duplicate binding … rename one`, measured). The moves create these
same-name pairs:

| name | modules exporting it after the move | today |
| --- | --- | --- |
| `indexOf`, `includes` | `std:array` (lists), `std:str` (strings) | list from std, string built in |
| `lastIndexOf` | `std:array`, `std:str` | **already collides today** |
| `slice` | `std:array` (`T[]`), `std:bytes` (`u8[]`) | both built in |
| `get` | `std:array` (`T[]`), `std:bytes` (`u8[]`), `std:idtable` (`IdTable<V>`) | lists/`u8[]` built in, `IdTable` from std |
| `map`, `filter` | `std:array` only (`u8[]` is already refused) | built in |

A file using both receiver kinds must alias one import and then **re-spell its call sites**
(`s.strIndexOf(…)`). The codemod's promise that call sites stay unchanged then breaks, and the
spelling is worse than today's. There are three ways out, and they belong in Q1:

- **(a) Receiver-overloaded imports:** two imports of one name are legal when both are
  `self`-functions whose `self` types are disjoint, and UFCS picks by receiver. This is a
  language change. `type-bound-ufcs-design.md` touches the same machinery for nominal types.
- **(b) Accept aliasing**, and price it per file.
- **(c) Distinct names**, for example `indexOfStr`. These are worse names, and std is close
  to permanent.

### 4.7 Hole receivers

An un-annotated parameter used as `xs.map(…)` is still made a list (`holeArrMethod`). The
prototype `mapA` on a hole receiver also runs (`function f(xs) { xs.mapA(…) }` prints 3). No
regression was observed here. `holeArrMethod` drops `map`/`filter` in the removal PR, and the
UFCS route has to keep inferring the list.

---

## 5. Migration plan

### 5.1 Order

Each move is **one PR per family**: it adds the std export, removes the built-in, and runs
the codemod over every in-repo tree. The two cannot coexist, because a `self`-function named
after a built-in member is refused at its declaration (D2475; measured on the prototype:
`` `map` is already a method of `T[]` … rename it``). So `std:array` cannot export `map` while
the built-in claims it.

**Step 0 — prerequisites.** None of these is a removal.

1. Close **D1484**: a UFCS call seeds lambda parameters as the free call does.
2. Lower `__array_copy__` for every list kind the built-in `slice` reaches: i64, f32,
   string and ref slots.
3. Fix `__array_new__` with a call-of-a-function-parameter fill.
4. Declare the print imports only when a reachable `__trap__` (or `print`) needs them, or
   give `std:array.filled` a message-free trap. This is what lets the compiler import
   `std:array` (§5.4).
5. A ruling on Q1, the collisions.
6. Make `vl check --json` emit `code` and `data` for type-stage diagnostics. Today it emits
   them only for lint, so the `ufcs-not-imported` (D1230) payload the codemod needs is
   missing from CLI output (measured: no `code` field on the type error).

**Step 1 — `charCodeAt` (no std export).**

- Retire it with a targeted note pointing at `s[i]`, which is the `stdFmtMovedNote`
  precedent.
- Rewrite `.charCodeAt(i)` to `[i]` mechanically. That is 7 sites in the compiler, 100 in
  plumb, 202 in glean, and the corpus and tests. The receiver needs parentheses only when it
  is not postfix-safe.
- Do it first because it needs no prerequisite and no std review.

**Step 2 — `map` and `filter` → `std:array`.** This needs Step 0 items 1 and 6. It is the
change SP-003 is about, and the one with the corpus exposure: 522 named cells.

**Step 3 — list `get` and `slice` → `std:array`, plus their `u8[]` twins in `std:bytes`.**
This needs items 2, 3 and 5. Without the `u8[]` twin, `bytes.slice(1, 3)` loses a capability.
That is a clause-2 regression, and the `runs` gate would catch it.

**Step 4 — the string search pair (`indexOf`, `includes`) → `std:str`.** This needs item 5.
The compiler takes the import here: it has 43 sites, and `std:str` pulls no host import
(measured).

**Step 5 — the code-point trio → `std:str`, if Q4 says so.**

Each step closes with the corpus gate. A cell that ran must still run, which is what forces
the codemod over `distilled/named/` and the census generators. Re-distil only if a class
splits.

### 5.2 The codemod — `scripts/codemods/builtin-to-std.py`

It follows `label-at.py`'s shape: `--check`, `PATH...`, a directory walked for `*.vl`, exit 0
when nothing needed rewriting, and comments and strings never touched. The difference is that
**the receiver type decides, and text cannot**. `.slice(`, `.get(`, `.indexOf(` and
`.includes(` are each shared between a moving built-in and one that stays (§2's split). So
the codemod is **diagnostic-driven**:

1. Run the post-removal compiler: `vl check --batch --json` over the targets (Step 0 item 6).
2. For each `ufcs-not-imported` diagnostic whose `data.modules` has exactly one entry, take
   the edit the checker already composes in `ufcsImportEditSuffix`:
   - add the name to an existing `import { … } from "<module>"`, or
   - insert a new import line after the leading import region.
3. If `data` proposes an alias (D1984: the file already binds the name), or names two modules,
   **decline and report**. Those are the Q1 cases.
4. Re-check the file. If its diagnostics are not a subset of the pre-edit set minus the fixed
   ones, revert the file. This is `vl check --fix`'s verify-and-revert, applied file by file.

Call sites are never edited, because `xs.map(f)` resolves once `map` is imported. The
exception is `charCodeAt`, Step 1's mechanical `[i]` rewrite, which the same script does as a
separate pass. It also handles generated sources: the census generators under
`scripts/silent-sweep/` emit the import line when a template spells a moved method.

**Alternative:** teach `vl check --fix` itself the `ufcs-not-imported` fixer, so consumers
need no script. That is the better end state (Q5). The Python driver is still needed for the
tree-wide in-repo pass and for `--check`.

### 5.3 The editor quick-fix — mostly built

D1230/D3122 already ship what this needs:

- **The `ufcs-not-imported` code** comes with `data.modules`. `stdRecvSpecsInto` finds a
  std export the program does not import yet, from the generated `compiler/std_receivers.vl`
  catalogue.
- **An LSP code action** writes the import: `codeActions.ts`'s `ufcsMissingImportAt` /
  `ufcsImportModules`.
- **UFCS completion with auto-import** comes from `typeFeatures.ts`'s probe.

The removal PR has to:

- regenerate the catalogue (`deno task gen-std`, gated by `tests/std_embedded_test.ts`) so
  the new exports are offered;
- delete the moved names from `memcPush`'s hand-written string list in `check_query.vl`;
- update the did-you-mean tables. `contains` → `includes` must stay correct;
- make the `u8[]` receiver's diagnostic offer `std:bytes`, not `std:array`, since
  `stdRecvFits` already refuses a `u8[]` against `T[]`.

### 5.4 The compiler's own uses

**Interpolation is unrelated.** The compiler cannot use interpolation because the
desugaring calls into `std:fmt`/`std:str`, and those pull in host imports. The rule is "the
seed loads with no host imports", not "the compiler imports no std".

The measurement (`imports.py`, each a one-function module built with `vl build`):

| imported and called | host imports in the module |
| --- | --- |
| built-in `map`, `filter`, `slice`, `get` | none |
| `std:str.split` | none |
| prototypes `mapA`, `mapP`, `filterP`, `sliceP`, `sliceQ` | none |
| `std:array.indexOf`, `sort`, `concat`, `filled` — **any one** | `__print_i32__`, `__print_bool__`, `__print_char__`, `__print_str_flush__` |
| the same `std:array`, with `filled`'s message-`__trap__` deleted | none |
| a never-called local function holding `__trap__("x")` | the same four |

**So:**

- The compiler can import `std:str` today.
- It can import `std:array` once Step 0 item 4 lands. The emitter declares the print family
  for any message-carrying `__trap__` in the merged program, whether or not it is reachable.
- Its own exposure is small: 1 list `slice`, 0 `map`/`filter`/list `get`, 43 string search
  sites and 7 `charCodeAt`.
- `compiler-no-interpolation` refuses only an interpolated string, so a plain std import
  passes it.

### 5.5 Consumer notification

The order follows the standing priority: sunpa first, plumb paused.

- One entry per consumer issues file — `~/sunpa/docs/vl-issues.md` (SP-003's status line),
  `~/plumb/docs/vl-issues.md`, `~/glean/docs/vl-issues.md` — naming the step, the import to
  add, and the codemod command.
- A `CHANGELOG.md` entry per step.
- The compile-time answer is the D1230 diagnostic, which already names the exact import line.
  A consumer who ignores the notes still gets a one-line fix at every site, plus the
  quick-fix in the editor.
- Exposure by consumer: glean is touched only by Step 1 (202 `charCodeAt`). sunpa is touched
  by Steps 2–3 (3 filters, 8 list slices). plumb is touched by Steps 1, 3 and 4 (100, 20 and
  21 sites).

### 5.6 The removal step (per family)

Delete the checker arm, and the name from each of the tables of §1. Then delete the
emitter's recognisers:

- `callIsMapFilter`, `callIsArrSlice`;
- the `memProp == "map"`/`"filter"` tests in `emit_collect` (`collectMapFilterUse`, `mfScan`)
  and in `emit_mono` (two sites);
- `emit_classify`'s `mf*` family;
- `wasmEmit`'s `emitMapFilter`, `emitArrSlice`, `emitMfElem`, `emitMfInvoke`;
- the scratch-frame reservation `fnUsesMapFilter`. `slice` shares it, so it goes with the
  last of the three.

Then:

- Run the codemod over `compiler/`, `std/`, `scripts/` and `tests/`.
- `refresh-compiler.sh --prove-fixpoint`.
- Run the corpus gate with **0 `runs → not-runs`**. Read `→ silent` too.
- Run the seed-size gate. It should FALL.
- Run the ratchets, and use `--why` on each fall.

The frozen TS compiler is not touched, under the native-only policy.

---

## 6. Open questions for the owner

Each question carries a recommendation.

**Q1 — Same-name std exports for different receivers (`indexOf`, `includes`, `lastIndexOf`,
`slice`, `get`).** Should a file be able to import `indexOf` from `std:array` and from
`std:str` at once, with UFCS picking by receiver?

- *Recommendation:* **yes**. Allow two imports of one name when both are `self`-functions
  whose `self` types are disjoint, and make a free call to such a name a refusal that asks
  for the method spelling.
- Without it, Steps 3–4 make mixed files alias and re-spell call sites. That is worse than
  today, and `lastIndexOf` already shows it.
- If declined, the fallback is (b), accept aliasing. Not (c), new names.

**Q2 — May a std function carry a compiler fast path?** *Recommendation:* **no**, as with
`toString`. Accept 1.06×–1.86× for now, and file bounds-check elimination for
length-bounded induction loops as a perf row (§3.3). It pays off for every user loop, not
only std.

**Q3 — `charCodeAt`: move it or retire it?** It returns the byte that `s[i]` returns, under a
JavaScript name that promises a UTF-16 unit. *Recommendation:* **retire** it, with a
targeted note naming `s[i]`. There are 330+ mechanical rewrites in total.

**Q4 — The code-point trio and `bytes`.** A′ ("everything VL can write moves") contradicts the
OQ-3 addendum ("needs the storage → core").

- *Recommendation:* **move `cpAt`, `cpLen` and `isCharBoundary` to `std:str`.** All three are
  writable over `s[i]`, and `cpLen` measured faster in VL.
- **Keep `bytes`** as storage. It is one `array.copy` between two storages, which no VL loop
  matches.
- Record that A′ supersedes the addendum, and supersedes OQ-3's prelude follow-on.

**Q5 — Codemod delivery.** Should it be a repo script or `vl check --fix`?
*Recommendation:* **both**. Teach `vl check --fix` the `ufcs-not-imported` fixer (single
candidate, verify-and-revert), so a consumer runs one command. A thin
`scripts/codemods/builtin-to-std.py` drives the in-repo pass and `--check`.

**Q6 — List `get`.** It is writable, but it is one line and its `?? d` form is fused today.
*Recommendation:* **move it** with `slice` (Step 3), so the rule has no exception. Then the
`get` collision with `std:idtable` and `std:bytes` falls under Q1.

**Q7 — `readonly` on `std:array`'s existing readers.** Should `indexOf`, `includes`, `count`,
`reduce`, `reverse` and `mapIndexed` take `self: readonly T[]`? *Recommendation:* **yes**,
in the Step 2 PR. It costs nothing and `concat` already does it. The new
`map`/`filter`/`slice` must take it, or they lose the `readonly` receivers they accept today
(§4.2).

**Q8 — Order of Steps 2–4.** *Recommendation:* the order in §5.1. `charCodeAt` goes first
because it is free. Then `map`/`filter`: it answers SP-003 and only needs D1484. Then
`slice`/`get`, which need the `u8[]` twins. The string pair goes last, because it alone needs
Q1.

---

## 7. Findings to file (none filed here — this lane was given no row-id range)

| finding | witness | class |
| --- | --- | --- |
| `__array_new__(n, f(x))` with `f` a function-typed parameter: `emitProgram: __array_new__ fill names no element rep, and its destination names none either` | `function mk(xs: i32[], f: (i32) => i32): i32[] { const out = __array_new__(xs.length, f(xs[0])); out }` then `print(mk([1, 2, 3], (v: i32) => v * 2)[2])`. Hoisting `f(xs[0])` into a `const` runs | loud emit reject, clause 2 |
| `__array_copy__` over i64, f32, string and record lists: `__array_copy__ supports i32/boolean/f64 lists natively` / `expects list (T[]) operands` | `sliceP` (§8) over `["a", "b", "c"]` or `[10 as i64, 20 as i64]` | loud emit reject, clause 2 |
| A message-carrying `__trap__` in a function nothing calls still declares four print host imports | `function never(n: i32): i32 { if n < 0 { __trap__("x") }; n }` plus `export function f(xs: i32[]): i32 { return xs.length }` → four imports | cost and seed-blocking, not a miscompile |
| One anonymous lambda in a 2 MB plumb-shaped unit: compile fuel 7.85 G → 27.81 G | `plumb/plumb2.py`, `lambda-only` | compile-cost cliff |
| Importing any module into the same unit: +15–22% compile fuel, with nothing called | `plumb/plumb3.py`, `import-proto-unused` | compile cost |

D1484 is the open row for the UFCS lambda-typing gap. It needs no new row.

---

## 8. Reproduction

The scratch scripts were run under `taskset -c 0-15`, against a seed refreshed from
`f6e17953b` with `--prove-fixpoint` (the 1-compile rung). They are kept outside the repo,
because the doc is the deliverable:

| script | purpose |
| --- | --- |
| `bench/proto.vl` | `mapA`, `mapP`, `mapF`, `filterP`, `filterF`, `sliceP`, `sliceQ` |
| `bench/sproto.vl` | `indexOfS`, `includesS`, `cpLenS` |
| `bench/gen.py`, `bench/sgen.py` | the microbenchmarks |
| `bench/fuel.py` | `-O` build, then exact wasmtime fuel by bisection on `-W fuel=N`, with a no-op import stub |
| `bench/cfuel.py` | compiler fuel under `VL_FUEL=1` |
| `bench/imports.py` | the host-import table of §5.4 |
| `plumb/plumb{,2,3}.py` | the plumb-shape variants |
| `census.py` | the textual census |
| `split/split.py` | the typed census, with the four-arm scratch checker |
| `lam.py` | the un-annotated-lambda census |

Each prototype is ≤ 25 lines of VL, and its body is quoted in the tables above by the name it
carries.
