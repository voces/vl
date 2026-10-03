# Built-in methods to std — survey and migration plan (lane BI, phase 1)

> Status: design survey. **No built-in is removed by this document**, and no compiler or std
> source changed. Every number below was measured on `origin/master` at `f6e17953b`
> (2026-10-03) unless the row says otherwise. The commands and prototypes live in §8.

**The ruling this implements (owner, 2026-10-03, A′, answering sunpa's SP-003):** compiler
built-in methods are **storage operations only**. Everything VL can write itself moves to std
and needs an explicit import. Auto-import, and method lookup into a type's std module, were
declined: the owner prefers explicit imports. A prelude is an auto-import, so A′ also bears on
the "configurable prelude" (`docs/internals/modules-design.md` §2, "No *default* prelude, but
a *configurable* one", about line 319), which `docs/guide/strings-design.md` OQ-3 named as the
ergonomic follow-on for the string methods. Recording that supersession is owner question
O7. The split today is historical: `.map`, `.filter`, `.slice` and `.push`
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
- **Six prerequisites block the move.** Each was found by a prototype, not by reading.
  1. **Contextual lambda typing on the UFCS path (D1484, open).**
     `xs.map((v) => v + 1)` types today only because the built-in seeds `v`. The same call
     against a std generic is a check reject. **957 of the corpus's 958** `.map`/`.filter`
     sites pass exactly this un-annotated lambda.
  2. **`__array_copy__` lowers only i32/boolean/f64 lists.** A std `slice` built on it
     refuses at emit on i64, f32, string and record lists (D3549).
  3. **`__array_new__(n, f(x))` refuses at emit** when the fill is a call through a
     function-typed parameter (D3548). Hoisting the fill into a `const` works.
  4. **Any `__trap__("message")` in an imported module adds the print host imports**, even
     in a function nothing calls. `std:array`'s `filled` has one, so importing anything
     from `std:array` gives a module four host imports. The seed must load with none, so the
     compiler cannot import `std:array` today (D3550).
  5. **Two std modules cannot export the same `self` name to one file.**
     `import { indexOf } from "std:array"` beside `import { indexOf } from "std:str"` is
     `Duplicate binding`. Moving the string `indexOf`/`includes` therefore makes some call
     sites CHANGE spelling, which contradicts "call sites unchanged". `lastIndexOf` already
     has this problem today.
  6. **An INFERRED list of anonymous records cannot reach any generic `T[]` parameter
     (D3557, filed with this doc).** `const xs = [{ x: 1 }, { x: 2 }]` then `len(xs)` with
     `len<T>(xs: T[])` refuses at emit: `only i32, i64, f64, f32, boolean, struct, union,
     array, or string parameters are supported`. So do `xs.reverse()` from `std:array` and a
     free `mapB(xs, (p) => …)`. The built-in `xs.map`/`.filter`/`.slice` take the same list,
     so moving them without this fix loses a capability.
- **Performance parity.** These are fuel ratios at `-O` (std ÷ built-in, per element).
  - `slice` via `__array_copy__`: **1.06×**.
  - `map`: **1.29–1.51×**.
  - `filter`: **1.44–1.66×**.

  Each range is the BEST prototype variant per element kind (§3.2). The push-based variants
  reach 1.48–2.14×.
  - string `indexOf`: **1.22×**.
  - `cpLen`: **0.82×**. The VL version is faster.

  The gap is the per-element bounds check and the heap-resident receiver. The built-in's
  loop has neither. A user's hand-written loop has both, so the fix that closes the gap is
  one every user loop wants (§3.3).
- **Compile cost.**
  - Importing a module into a plumb-shaped 2 MB unit costs **+15% to +22% guest fuel**,
    whatever is imported (D3551). Plumb's real units already import modules, so they have already
    paid it.
  - Separately, one anonymous lambda anywhere in that unit costs **+254%**, and the built-in
    `.map`/`.filter` called with lambdas costs **+256%**, the same cliff. It is a lambda cost,
    not a method cost, and is reported in §3.5 because it dwarfs everything here.

---

## 1. Inventory — what the checker and the emitter recognise

The ground truth is the checker's member-call arms, `checkMemberCallNode`
(`compiler/typecheck.vl`). `builtinMethodClaims` reads the method-name tables `listMethodNames`
/ `strMethodNames` / `mapMethodNames`, and `memberRungOnTy` uses that answer to rank a
built-in above a field and a `self`-function (D2517). Other tables are keyed by method NAME,
and the removal has to visit every one. They do **not** restate the built-in set: several
already mix std names in, because they answer for a name whatever resolves it. A removal
must therefore delete a built-in's own row and keep any name a std function also answers to.

- `check_query.vl`'s `memcPush`: the editor completion list, strings only, hand-written.
- `collMethodKind`: `includes`, `indexOf`, `join` and `keys` are `CM_READS`. The first three
  are `std:array`/`std:str` names on a list.
- `builtinMethodEffect`: the mutators `push`, `add`, `pop`, `clear`, `set`, `delete`.
- `collIsListSpelling`: `push`, `pop`, `clear`, `get`, `includes`, `indexOf`, `join`, mixed
  the same way.
- `holeArrMethod` and `holeMapMethod`, which make an un-annotated parameter a list or a map.
- `esMethodBuilds`: the allocation table. It also lists std names (`concat`, `join`, `split`,
  `toString`, `toUpperAscii`, `toLowerAscii`).
- `rcwSameElems`, which covers `filter`, `slice` and `values`.
- `builtinMethodRunsArgs`: `map` and `filter`, the only built-ins that run a function.

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
| `bytes()` | `→ u8[]`, a COPY, one `array.copy` | **storage-adjacent**. VL could write it as a byte loop, but the built-in is a bulk copy between two storages (OQ-3 addendum). Recommend it stays (O6) | — | `std:utf8.encodeUtf8` wraps it |
| `indexOf(sub)` | `→ i32`, -1 when absent, `""` found at 0 | **writable** | `std:str` | private `findFrom`; the header says "`contains`, `indexOf` and `slice` stay in the core" |
| `includes(sub)` | `→ boolean` | **writable** | `std:str` | none |
| `charCodeAt(i)` | `→ i32` — **the BYTE at `i`, identical to `s[i]`** (measured: `"aé€".charCodeAt(1)` = `s[1]` = 195) | **writable, and redundant**. The name promises a UTF-16 code unit (JavaScript) and delivers a byte | **retire**, pointing at `s[i]` (O4) | — |
| `cpAt(i)` | `→ i32`, the code point at byte offset `i`; U+FFFD mid-sequence; traps off the end | **writable**: a decode over `s[i]` | `std:str` (or `std:utf8`) | `std:utf8` decodes whole strings |
| `cpLen()` | `→ i32`, O(n) | **writable** | `std:str` | none |
| `isCharBoundary(i)` | `→ boolean`, a lead-bit test | **writable** | `std:str` | none |

`strings-design.md` OQ-3's **addendum** put `cpAt`/`cpLen`/`isCharBoundary`/`bytes` in the
core because each "needs the UTF-8 storage". By its own text, though, the storage is reachable
through `s[i]`: "which is the byte they would have to re-derive their answer from". Under A′
that makes the trio writable. `bytes` keeps the one argument the trio lacks, a bulk
`array.copy` against a per-byte loop. **A′ and the OQ-3 addendum disagree about the trio,
and that is an owner question (O5, O7), not this lane's call.**

**What `std:str` holds today, for comparison.** OQ-3 kept 15 names in `std:str`; the module
now also exports `backwards` (code points reversed), and every one of them is already an
import. `compact()` (`strings-design.md` §Header: copy a small view out of a large backing)
was deferred and exists nowhere yet. If it lands it is storage, not writable: VL has no
route from bytes to a fresh string backing except re-encoding through `fromCodePoints`,
which is not a byte copy for an off-boundary view.

### 1.3 Maps `{[K]: V}` and sets `Set<K>`

| method | signature | class |
| --- | --- | --- |
| `m[k]`, `m[k] = v`, `.length` | — | storage |
| `set(k, v)` (map only) | `→ void`, pins an empty `Map()`'s key and value | storage |
| `get(k)` (map only) | `→ V \| null` | storage |
| `add(k)` (set only) | `→ void`. On a `boolean`-valued map it is a refusal that names `m[k] = true` | storage |
| `has(k)`, `delete(k)` | `→ boolean` | storage |
| `keys()` | `→ K[]` | storage: reads the table's insertion-ordered key column |
| `values()` | `→ V[]` (set: `K[]`) | storage: reads the value column. See the cost note below |

All of these read or write the hash table's own columns, so **nothing moves**.

`values()` is the one a reader could call writable: `for k in m.keys() { out.push(m[k] ?? d) }`
gives the same list in the same order. It stays storage on cost, measured: a 10,000-entry
`{[i32]: i32}`, 50 calls, `-O`, fuel per call:

| spelling | fuel per call | ratio |
| --- | --- | --- |
| built-in `m.values()` | 200,023 | 1.00× |
| built-in `m.keys()` (the column read alone) | 200,023 | 1.00× |
| VL `keys()` + one `m[k]` probe per key | 961,419 | **4.81×** |

The VL spelling allocates the key list and then pays a full hash probe per entry to recover
a value the table already holds in order. `values()` is the value column's twin of `keys()`,
so the two stay together.

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
| files scanned | 34 | 18 | 9,489 | 668 | 4,441 | 214 | 20 | 319 |
| list `.map` | 0 | 0 | 778 / 522 | 10 / 9 | 185 / 94 | 1 / 1 | 0 | 0 |
| list `.filter` | 0 | 0 | 180 / 112 | 0 | 92 / 51 | 0 | 3 / 1 | 0 |
| `.slice` (all) | 278 / 21 | 14 / 4 | 41 / 41 | 10 / 4 | 171 / 61 | 256 / 32 | 12 / 5 | 62 / 48 |
|   of which **list** (typed) | **1** | 0 | **21** | **8** | **72** | **20** | **9** | **0** |
| `.get` (all) | 65 / 6 | 0 | 195 / 183 | 68 / 41 | 162 / 75 | 3 / 2 | 3 / 2 | 2 / 2 |
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
- **sunpa is re-measured on one snapshot** (its working tree at 2026-10-03 16:10, 20 files;
  it grew from 16 during the survey, which is what the first reading's 8-typed-against-6-textual
  mismatch was). Both columns now come from the same files: 12 textual `.slice(`, of which 9
  are list slices: 5 on `f32[]`, 2 on `f64[]`, 1 on `Intent[]` and 1 on `u8[]`. The other 3
  are string slices. Seven of the nine need a prerequisite: the six `f32[]` and record slices
  need prerequisite 2, and the `u8[]` slice needs the `std:bytes` twin (prerequisite 5).

**Absent or partial trees:**

- `~/sunsuz` holds no `.vl` source.
- `~/veldt` is not on this machine.
- One plumb file, `vl-probes/synth/s4000.vl` (a 46 MB synthetic probe), runs the checker out
  of GC heap under the scratch checker and is not in the split.
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
- **list `get`** — `emitListGetOr`/`Go`, 54 lines, a fused `xs.get(i) ?? d`. Beyond that,
  15 emitter sites test `memProp == "get"` (8 in `emit_classify`, 4 in `wasmEmit`, 1 each in
  `emit_collect`, `emit_mono` and `emit_rewrite`) and 5 more sit in `typecheck` outside the
  method arms. Most serve a list `get` and a map `get` alike, so the removal splits each by
  receiver rather than deleting it (§5.6).
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
the cost became a library-quality item. These ratios (1.06×–1.66× for the best variant of
each operation) are well inside that
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
- The BUILT-IN `xs.map(lambda).filter(lambda)` in the same position costs **+256%**
  (7.85 G → 27.99 G), the same cliff, so the cost is the lambda's and not the method's.
- The same `map` and `filter` with NAMED functions instead cost +6.2%.
- That is not a migration matter, and it is reported here because nothing else measures it.
  The plumb-shape units hold no lambda, so the gate is blind to it.

Filed as **D3551**, with the import cost of §3.4 beside it.

---

## 4. Semantic differences and name collisions (for the std-api-reviewer)

### 4.1 Callback typing (blocking)

The built-ins seed an un-annotated lambda's parameter from the element type. A UFCS call to
any `self`-function does not, and that is D1484 (open, clause 2).

- `[1, 2, 3].filterP((v) => v > 1)` is a check reject.
- `filterP([1, 2, 3], (v) => v > 1)` runs.
- `xs.sort((a, b) => a < b)` against `std:array.sort` fails the same way today.

D1484 must close before the first move.

### 4.1a Inferred anonymous-record lists (blocking) — D3557

The built-ins take any list. A generic `T[]` parameter does not take an INFERRED list of
anonymous records: `const xs = [{ x: 1 }, { x: 2 }]` passed to `len<T>(xs: T[])` refuses at
emit, and so do `xs.reverse()` and a free `mapB(xs, (p) => …)`. Annotating the binding, naming
the record type, or annotating the lambda's parameter each rescues it, and the built-in
`xs.map((p) => p.x + 1)` runs. So moving `map`, `filter`, `slice` or `get` before D3557 closes
turns a running program into an emit refusal. The ablation is in the row.

### 4.2 `self` must be `readonly T[]`

The built-in `map`, `filter` and `slice` accept a `readonly T[]` view. A `self: T[]` std
function refuses one: ``no method 'filterP' for readonly i32[] — … a readonly list is not a
growable one``. The prototypes pass once retyped to `self: readonly T[]`, the convention
`std:array.concat` already follows. For the same reason the existing readers
(`indexOf`, `lastIndexOf`, `includes`, `count`, `reduce`, `reverse`, `mapIndexed`, `sorted`)
probably want `readonly` too; that changes existing signatures, so it is owner question O9.

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
spelling is worse than today's. There are three ways out, and they belong in O1:

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
5. A ruling on O1 and O2, the collisions.
6. Make `vl check --json` emit `code` and `data` for type-stage diagnostics. Today it emits
   them only for lint, so the `ufcs-not-imported` (D1230) payload the codemod needs is
   missing from CLI output (measured: no `code` field on the type error).
7. Close **D3557**: an inferred list of anonymous records reaches a generic `T[]` parameter.
   Without it, `xs.map(…)` over `[{ x: 1 }, …]` runs today and refuses at emit after Step 2.

**Step 1 — `charCodeAt` (no std export).**

- Retire it with a targeted note pointing at `s[i]`, which is the `stdFmtMovedNote`
  precedent.
- Rewrite `.charCodeAt(i)` to `[i]` mechanically. That is 7 sites in the compiler, 100 in
  plumb, 202 in glean, and the corpus and tests. The receiver needs parentheses only when it
  is not postfix-safe.
- Do it first because it needs no prerequisite and no std review.

**Step 2 — `map` and `filter` → `std:array`.** This needs Step 0 items 1, 6 and 7. It is the
change SP-003 is about, and the one with the corpus exposure: 522 named cells.

**Step 3 — list `get` and `slice` → `std:array`, plus their `u8[]` twins in `std:bytes`.**
This needs items 2, 3, 5 and 7. Without the `u8[]` twin, `bytes.slice(1, 3)` loses a capability.
That is a clause-2 regression, and the `runs` gate would catch it.

**Step 4 — the string search pair (`indexOf`, `includes`) → `std:str`.** This needs item 5,
and O1's answer.
The compiler takes the import here: it has 43 sites, and `std:str` pulls no host import
(measured).

**Step 5 — the code-point trio → `std:str`, if O5 says so.**

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
   **decline and report**. Those are the O1 cases.
4. Re-check the file. If its diagnostics are not a subset of the pre-edit set minus the fixed
   ones, revert the file. This is `vl check --fix`'s verify-and-revert, applied file by file.

Call sites are never edited, because `xs.map(f)` resolves once `map` is imported. The
exception is `charCodeAt`, Step 1's mechanical `[i]` rewrite, which the same script does as a
separate pass. It also handles generated sources: the census generators under
`scripts/silent-sweep/` emit the import line when a template spells a moved method.

**Alternative:** teach `vl check --fix` itself the `ufcs-not-imported` fixer, so consumers
need no script. That is the better end state (plan decision P1). The Python driver is still needed for the
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
- It can import `std:array` once Step 0 item 4 lands (D3550). The emitter declares the print
  family for any message-carrying `__trap__` in the merged program, whether or not it is
  reachable. `-O` drops the unused imports, but the seed is built without it.
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
  by Steps 2–3 (3 filters, 9 list slices, seven of which need a prerequisite). plumb is touched by Steps 1, 3 and 4 (100, 20 and
  21 sites).

### 5.6 The removal step (per family)

Delete the checker arm, and the built-in's row from each of the tables of §1, keeping any
name a std function also answers to (`collMethodKind`, `collIsListSpelling` and
`esMethodBuilds` already carry std names). Then remove the emitter's recognisers, family by
family:

- **`map` / `filter` / list `slice`:**
  - `callIsMapFilter`, `callIsArrSlice`;
  - the `memProp == "map"`/`"filter"` tests in `emit_collect` (`collectMapFilterUse`,
    `mfScan`) and in `emit_mono` (two sites);
  - `emit_classify`'s `mf*` family;
  - `wasmEmit`'s `emitMapFilter`, `emitArrSlice`, `emitMfElem`, `emitMfInvoke`;
  - the scratch-frame reservation `fnUsesMapFilter`. `slice` shares it, so it goes with the
    last of the three.
- **list `get`:**
  - `emitListGetOr` / `emitListGetOrGo`;
  - the 15 emitter sites and 5 checker sites that test `memProp == "get"` (§3.1). These are
    **split, not deleted**: most read `get` on a list and on a map, and the map half stays.
    The split keys on the receiver's type or on `memberCallRungOf(ix)`, which
    `emit_rewrite.vl` already does (`!= MC_RUNG_SELF_FN`), never on the name alone. After the
    removal, a list `get` reaches these sites as a `self`-function call.
- **The string methods:**
  - the string-method dispatch in `wasmEmit` (one `exprIsStrMethod` test per method,
    beside the `slice` and `bytes` ones that stay): the `indexOf`/`includes`, `charCodeAt`,
    `cpAt`, `cpLen` and `isCharBoundary` arms. `exprIsStrMethod` itself stays, because the
    string `slice` (3 callers) and `bytes` still use it;
  - `exprIsStrIndexOf` and its reservation arm in `exprHasStrOp`;
  - `emitStrIndexOf`;
  - the lowerings `emitStrCharCode`, `emitStrCpAt`, `emitStrCpLen` and
    `emitStrIsCharBoundary`, and the `__utf8_cplen__` helper body (`emitUtf8CpLenFnCode`) once
    nothing calls it. `__utf8_dec__` stays: two other lowerings call it.
- **The name tables:** `collIsListSpelling` loses `get` (and `includes`/`indexOf` only if the
  std functions do not need the list classification it gives them). `holeArrMethod` loses
  `map` and `filter`, and the UFCS route must still infer the list (§4.7).

Then:

- Run the codemod over `compiler/`, `std/`, `scripts/` and `tests/`.
- `refresh-compiler.sh --prove-fixpoint`.
- Run the corpus gate with **0 `runs → not-runs`**. Read `→ silent` too.
- Run the seed-size gate. It should FALL.
- Run the ratchets, and use `--why` on each fall.

The frozen TS compiler is not touched, under the native-only policy.

---

## 6. Open questions for the owner

One decision per question, a code sample per option, and a recommendation. The process
choices that need no ruling are in §6.10.

### O1 — Can one file import the same name from two std modules?

`indexOf`, `includes`, `lastIndexOf`, `slice` and `get` will each be exported by more than
one module, for different receivers (§4.6).

**(a) Yes, when both are `self`-functions over disjoint `self` types.** UFCS picks by
receiver.

```vl
import { indexOf } from "std:array"
import { indexOf } from "std:str"
const i = [1, 2, 3].indexOf(2)     // std:array
const j = "abc".indexOf("b")       // std:str
```

**(b) No. A file that needs both aliases one, and its call sites change spelling.**

```vl
import { indexOf } from "std:array"
import { indexOf as strIndexOf } from "std:str"
const i = [1, 2, 3].indexOf(2)
const j = "abc".strIndexOf("b")
```

**(c) No, and std gives the two functions different names.**

```vl
import { indexOf } from "std:array"
import { indexOfStr } from "std:str"
const j = "abc".indexOfStr("b")
```

*Recommendation: (a).* With (b), every mixed file is worse than it is today, and the codemod
cannot promise unchanged call sites; `lastIndexOf` already has this problem. (c) spends
near-permanent std names on a namespace limitation.

### O2 — Under O1 (a), what does a FREE call to such a name do?

**(a) Refuse it, and ask for the method spelling.**

```vl
import { indexOf } from "std:array"
import { indexOf } from "std:str"
indexOf("abc", "b")
// error: `indexOf` names two imported functions; call it as a method, `"abc".indexOf(…)`
```

**(b) Resolve it by the first argument's type, the same rule UFCS uses.**

```vl
indexOf("abc", "b")   // std:str's, chosen by the string first argument
```

*Recommendation: (a).* Free-call resolution stays name-only, so the overloading lives in one
place, the method spelling. It can be widened to (b) later without breaking anything that
compiles under (a).

### O3 — May a std function keep a compiler fast path behind its name?

**(a) No. The std body is the program, and its cost is a library and optimizer item.**

```vl
// std/array.vl
export function map<T, U>(self: readonly T[], f: (T) => U): U[] {
  // the VL loop below is what every call compiles to
  …
}
```

**(b) Yes. The std function is a thin wrapper over an emitter intrinsic.**

```vl
// std/array.vl
export function map<T, U>(self: readonly T[], f: (T) => U): U[] {
  return __list_map__(self, f)   // lowered by today's emitMapFilter
}
```

*Recommendation: (a)*, as with `toString`. The measured cost is 1.06×–1.66× for the best
variant of each operation (§3.2), well inside the 5.7× that ruling accepted. The fix is
bounds-check elimination for loops bounded by the list's length (§3.3), which speeds up
every user loop as well. (b) keeps about 1,600 lines alive in the per-element-kind shape
whose missing arms are this compiler's most common defect.

### O4 — `charCodeAt`: retire it, or move it?

It returns the byte `s[i]` returns, under a JavaScript name that promises a UTF-16 unit.

**(a) Retire it. The refusal names the replacement.**

```vl
const b = s[i]
// s.charCodeAt(i) → error: `charCodeAt` is not a string method — `s[i]` is the byte at `i`
```

**(b) Move it to `std:str` unchanged.**

```vl
import { charCodeAt } from "std:str"
const b = s.charCodeAt(i)
```

*Recommendation: (a).* (b) spends a permanent std name on a duplicate whose name misleads.
The cost of (a) is about 350 mechanical rewrites, 302 of them in plumb and glean.

### O5 — Do `cpAt`, `cpLen` and `isCharBoundary` move to `std:str`?

**(a) Yes. They need an import.**

```vl
import { cpLen, cpAt } from "std:str"
const n = s.cpLen()
```

**(b) No. They stay built in under the OQ-3 addendum's "needs the storage" rule.**

```vl
const n = s.cpLen()   // no import
```

*Recommendation: (a).* All three are writable over `s[i]`, which is the A′ test. The
addendum's own text concedes that `s[i]` reaches the bytes, and `cpLen` measured 0.82× in
VL. Usage is small: 20 corpus cells, 26 test sites and 2 in std, and no consumer.

### O6 — Does `bytes()` stay built in?

**(a) Yes, as storage: one `array.copy` between the string's backing and a `u8[]`.**

```vl
const b = s.bytes()   // no import
```

**(b) No. It moves to `std:str` as a byte loop.**

```vl
import { bytes } from "std:str"
const b = s.bytes()   // one array.get_u and one array.set per byte
```

*Recommendation: (a).* It is the only conversion between two storages, and a bulk copy is
what no VL loop can express. `std:utf8.encodeUtf8` already wraps it.

### O7 — Does A′ supersede the OQ-3 addendum and the configurable prelude?

The OQ-3 addendum is `strings-design.md`. The prelude is `modules-design.md` §2, "No
*default* prelude, but a *configurable* one", about line 319; OQ-3 named it as the
ergonomic answer for the string methods.

**(a) Yes, both. Every std name is an explicit import, test files included.**

```vl
import { split } from "std:str"
import { expect, toEqual } from "std:test"   // in a test file too
```

**(b) The addendum, yes. The prelude stays a future option for configured file sets.**

```jsonc
// vl.json
{ "prelude": { "**/*_test.vl": ["std:test"] } }
```

```vl
expect(1 + 2).toEqual(3)   // no import in a matching test file
```

*Recommendation: (a).* It matches the ruling's stated preference for explicit imports, and
the prelude was never built, so retiring it breaks nothing. Record it in `DECISIONS.md` and
mark both documents' sections as superseded.

### O8 — Does the list `get` move?

It is a one-line function, and `xs.get(i) ?? d` is fused in the emitter today.

**(a) Move it to `std:array`, with a `std:bytes` twin for `u8[]`.**

```vl
import { get } from "std:array"
const v = xs.get(i) ?? 0
```

**(b) Keep it built in, as the one writable exception.**

```vl
const v = xs.get(i) ?? 0   // no import
```

*Recommendation: (a)*, so the rule has no exception. Its collision with `std:idtable` and
`std:bytes` is then O1's.

### O9 — Do `std:array`'s EXISTING readers take `self: readonly T[]`?

That covers `indexOf`, `lastIndexOf`, `includes`, `count`, `reduce`, `reverse`,
`mapIndexed` and `sorted`. It changes eight existing signatures.

**(a) Yes. A read-only view can call them.**

```vl
import { indexOf } from "std:array"
function find(xs: readonly i32[]): i32 { return xs.indexOf(3) }   // accepted
```

**(b) No. They keep `self: T[]`.**

```vl
function find(xs: readonly i32[]): i32 { return xs.indexOf(3) }
// error: no method 'indexOf' for readonly i32[] — … a readonly list is not a growable one
```

*Recommendation: (a)*, in the Step 2 PR. It only widens what is accepted, and `concat`
already does it.

### 6.10 Plan decisions — not owner questions

These follow from the rules already in force. They are recorded here so the reviewer can
check them.

- **P1 — Codemod delivery.** Teach `vl check --fix` the `ufcs-not-imported` fixer (single
  candidate module, verify-and-revert), so a consumer runs one command. A thin
  `scripts/codemods/builtin-to-std.py` drives the in-repo pass and `--check` (§5.2).
- **P2 — Step order.** As §5.1. `charCodeAt` goes first because it is free. `map`/`filter`
  answer SP-003 and need D1484 and D3557. `slice`/`get` need the `u8[]` twins and the
  `__array_copy__` lowering. The string pair goes last, because it alone needs O1.
- **P3 — The new exports take `self: readonly T[]`.** `map`, `filter`, `slice` and `get`
  must accept every receiver the built-ins accept today, read-only views included (§4.2).
  Anything else is a capability loss, which the gate refuses.
- **P4 — One PR per family**, adding the export and removing the built-in together, because
  D2475 forbids the two existing at once (§5.1).

---

## 7. Rows filed with this document

| row | finding | class |
| --- | --- | --- |
| D3548 | `__array_new__(n, f(x))` refuses when `f` is a function-typed parameter; hoisting the call into a `const` builds (prerequisite 3) | loud emit reject, clause 2 |
| D3549 | `__array_copy__` lowers only i32, boolean and f64 lists; string, record, i64 and f32 lists refuse (prerequisite 2) | loud emit reject, clause 2 |
| D3550 | a message-carrying `__trap__` in a function nothing calls declares four print host imports in a plain build (prerequisite 4) | runs; the cost is the import list |
| D3551 | one anonymous lambda in a plumb-sized unit costs +254% compile fuel, and an unused import +15–22% (§3.4, §3.5) | runs; a PERF row graded by its fuel numbers |
| D3557 | an inferred list of anonymous records cannot reach a generic `T[]` parameter (prerequisite 6) | loud emit reject, clause 2 |

D1484, the UFCS lambda-typing gap (prerequisite 1), was already open.

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
