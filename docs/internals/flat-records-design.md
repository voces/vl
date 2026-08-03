# Flat record layouts (webcraft P1.2)

The C-struct tier: a record whose **byte layout is declared, not chosen**. WasmGC
structurally cannot provide it — no layout control, no inline aggregates, no way to ask
where a field sits (`memory-gc-design.md`'s permanent-ceiling table) — so a program that
must match a foreign layout byte-for-byte has to compute addresses by hand over
`std:buffer`.

The forcing customer is the **Lua 5.3 VM**: bit-exact `pairs()` order requires replicating
Lua's `Table` / `Node` / `TValue` layouts and hash behaviour. Second customer: wc3 rule
tables and any state whose layout must match the TS twin exactly.

The ask, as `docs/webcraft-requirements.md` §P1.2 spells it:

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }   // explicit order, fixed size 16
const stack = buf.rows<TValue>(offset, count)
stack[i].tt          // i32.load at offset + i*16 + 8
```

This document records what shipped, what did not, and the ruling behind each — with the
alternative each ruling beat.

---

## 0. What shipped, and the phasing argument

The ask is three features wearing one syntax:

| | what it is | state |
| --- | --- | --- |
| **(a)** `flat type` declarations with computed offsets and size | a **declaration** feature | **SHIPPED** |
| **(b)** `buf.rows<T>(off, n)` | a **generic accessor** feature | FILED (§6.1, sketched §10) |
| **(c)** `stack[i].tt` | **index-then-field sugar** over linear memory | **WRITABLE IN USER SPACE** (§9) — as `stack[i].tt()` |

**(c) needed no compiler work in the end.** §6.2 filed it as blocked on a bracket that
did not parse; B14 shipped that bracket, and the remaining half — making `.tt` an offset
add rather than a materialized row — turns out to be a **library idiom**, not a language
feature: have `"[]"` return a row-ADDRESS newtype. §9 is the pattern, the codegen proof
that it fuses, and the one divergence (`.tt()`, not `.tt`).

They are separable, and (a) is the one that carries the value. The measurement that decides
the phasing is §6.3's: **with (a) alone, every accessor the Lua VM needs is already
expressible in pure VL**, and the thing (a) removes is the failure mode the tier exists to
prevent.

Today, without this feature, a program that wants Lua's `TValue` writes:

```vl
// the layout lives in the programmer's head and in these three literals
const TVALUE_SIZE = 16
function ttAt(base: i32, i: i32) { return __load_i32__(base + i * 16 + 8) }
```

The `16` and the `8` are **hand-computed from a layout that is written down nowhere**. Add
a field, reorder two, widen an `i32` to an `i64`, and every one of those literals is
silently wrong — the program still compiles, still runs, and reads the wrong bytes. That is
the exact defect class this tier exists to prevent, and it is the one (a) closes:

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }
function ttAt(base: i32, i: i32) { return __load_i32__(base + i * TValue.size + TValue.tt) }
```

The declaration is now the single source of truth and the addresses are derived from it.
What (b) and (c) buy on top is **boilerplate** — one accessor pair per field per type — not
expressiveness. That is a real cost and they should land; it is not a correctness cost, and
it does not gate the Lua port the way the layout does.

**Zero emitter lines.** Like P1.5's newtypes, this whole feature is erased before the
emitter runs (§4). `flat` is a checker-side validation plus a constant fold; `emit_*.vl` and
`wasmEmit.vl` are untouched, and a `flat type` emits exactly the bytes the same declaration
without `flat` emits.

---

## 1. Syntax: `flat type N = { … }`

**RULING: the modifier is a prefix, `flat type N = { … }`, and `flat` is a CONTEXTUAL
keyword recognized only immediately before the `type` keyword.**

`type` is a hard lexer keyword (`TYPE`), so the guard is exact and total: an `IDENT`
followed by the `type` keyword is **not a legal statement in VL today** under any parse.
Verified on master — `flat type TValue = { … }` parses as an expression statement `flat`
followed by the declaration and dies at `undeclared identifier 'flat'`. So every token
sequence this newly accepts was previously a hard error, and **no existing program can
change meaning**. That is a stronger guarantee than P1.5's `new` got (which needed a
second-token lookahead to keep `type N = new` meaning "alias of the type named `new`").

`flat` remains a legal identifier everywhere else, including as a variable named `flat`, a
field named `flat`, and a type named `flat`. Pinned.

### Alternatives

- **`type N = flat { … }`** — ride the exact position P1.5's `new` marker rides. This was a
  genuine contender and it is **cheaper**: the formatter reprints a type declaration from a
  **verbatim source slice** starting at the declaration's `pos`, which is the `type`
  keyword's start, so an infix marker is inside the slice for free while a prefix marker is
  outside it and gets **silently deleted by `vl fmt`**. Rejected anyway: the prefix is the
  spelling the requirements doc asks for, it is the C/Rust idiom (`#[repr(C)]`, `packed`),
  and it reads as what it is — a property of the declaration, not of the body. The formatter
  hazard is real and was found by reading `emitTypeOrUnionDecl`; the fix is one line (start
  the declaration's `pos` at the `flat` token) and it is **pinned by a `vl fmt` idempotence
  fixture**, because a hazard whose fix is not pinned is a hazard.
- **A hard `flat` keyword.** Free against this repo (zero occurrences as an identifier in
  `compiler/`, `std/`, `tests/cases/`) but reserves a common word language-wide for one
  declaration form. Same reasoning that rejected it for `new`.
- **`@flat` / `#[flat]` attribute syntax.** VL has no attribute grammar; adding one for a
  single modifier is a language surface out of proportion to the feature.

### `export flat type` needed a second scanner

`compiler/driver.vl`'s `modScan` is a **token-level** module front end that runs before any
parse: it reads `export`, then the declaration keyword, then the declared NAME at a fixed
offset. A contextual keyword between `export` and `type` moves the name one token along, and
until the scanner learned the pair, `export flat type TValue = { … }` was **not recorded as
an export at all** — a sibling importer got `"TValue" is not exported by "./lib"` on a line
that plainly says `export`.

This is the shape worth carrying forward: **a contextual keyword has to be recognized by
every scanner that reads the declaration form, not just by the parser**, and a token-level
scanner cannot ask the parser what it decided. `new` (P1.5) never hit this because it sits
*after* the `=`, past everything `modScan` reads. Pinned by
`tests/cases/modules/flat-record-export/`.

The census that found it also cleared the other three token-level `"TYPE"` scanners:
`parser.vl`'s `isStmtKeyword` (a `{`-disambiguator — `flat` falls through to "block", which
is correct) and `driver.vl:1032`'s keyword classifier (an LSP highlighting set; `flat` is
highlighted as an identifier, exactly as `new` is — a cosmetic gap shared with the shipped
precedent, filed not fixed).

### Scope: top-level declarations only

A `flat type` inside a function body is not measured — but neither is a plain `type`. VL's
declaration pass walks the top-level statement list only, so a nested `type Inside = { … }`
is `unknown type 'Inside'` on master too. Verified against master's own compiler, both
spellings. This is inherited scope, not a limitation of `flat`, and widening it is a change
to where declarations register, not to this feature.

### `flat` requires a record body

`flat type N = i32`, `flat type N = A | B`, `flat type N = { a: i32 } & { b: i32 }` are all
**rejected in the parser**, where the declaration form is decided. A flat type is a layout,
and a scalar alias, a union and an intersection do not have one. The parser recovers by
parsing the declaration as the ordinary non-flat alias it would otherwise be, so there is no
cascade.

This is why `UnionDecl` gains **no** `udFlat` field: every non-record body parses as a
`UnionDecl`, and rejecting at the syntactic fork means the marker never has to travel.
`TypeDecl` gains one `i32` (`tdFlat`), exactly mirroring `tdNew`.

---

## 2. The layout rule: NO IMPLICIT PADDING

**RULING: offsets are the running sum of the declared field widths; the size is the total.
The compiler never inserts a byte. There is no alignment requirement and no trailing pad.**

```
flat type TValue = { value: i64, tt: i32, pad: i32 }
        value  offset 0   width 8
        tt     offset 8   width 4
        pad    offset 12  width 4
        TValue.size = 16
```

which is exactly the requirements doc's own arithmetic — "fixed size 16", "`i32.load` at
`offset + i*16 + 8`".

### Why, and why the spec's own example is the argument

The spec's example carries an **explicit `pad: i32` field**. Under C's natural-alignment
rules `struct { int64_t value; int32_t tt; }` is *already* 16 bytes — the trailing pad is
inserted for you — so the `pad` field would be redundant. It is in the example because its
author expects `{ value: i64, tt: i32 }` to be **12 bytes**. That is the no-implicit-padding
rule, stated by the customer in the shape of a field.

Three further reasons:

1. **Unaligned access is legal in wasm.** The alignment immediate on `i32.load`/`i32.store`
   is a *hint*; it does not affect semantics, and a misaligned access is well-defined, not a
   trap. So there is no correctness argument for padding — only a performance one, and
   paying it silently is not this tier's bargain.
2. **Implicit padding cannot express a packed layout.** A tier whose entire purpose is
   matching a foreign layout must be able to match *any* foreign layout, including a packed
   one. Natural alignment is the special case you can always reach by writing the pad field;
   packed is one you can never reach if the compiler pads for you.
3. **Silent layout drift is the defect class this feature exists to prevent.** A rule where
   the compiler decides some of the offsets puts the decision back in a place the programmer
   cannot see, which is where it already is today.

### Alternatives

- **C / natural alignment** (each field aligned to its own width, struct aligned to its
  widest, size rounded up). Rejected: (2) and (3) above. It is also the rule most likely to
  *appear* to work and then disagree with a hand-written TS twin on one field.
- **Explicit `packed` / `align(n)` modifiers**, C-rules by default. Deferred, not rejected:
  it is the right end state if a customer ever wants natural alignment *and* packing, and
  no-implicit-padding is the forward-compatible half (adding `align` later widens; removing
  automatic padding later would break every program).
- **Pad automatically but warn.** Rejected — a warning that must be read to avoid a silent
  wrong answer is a silent wrong answer.

### Consequences worth stating

- Misalignment is the **programmer's** problem, and it is a performance problem, not a
  correctness one.
- `flat type X = { a: i32, b: i64 }` is 12 bytes with `b` at offset 4, straddling an 8-byte
  boundary. That is legal, deliberate, and pinned.
- Field **order is layout**. There is no reordering, ever, for any reason.

---

## 3. The field-type rule: scalars, newtypes over scalars, nested flat

**RULING: a flat field's type must be one of `i32` (4), `i64` (8), `f32` (4), `f64` (8), a
nominal newtype whose base is one of those, or another `flat` type (its own computed size).
Everything else is a reject.**

The rejects, each with its reason:

| field type | why |
| --- | --- |
| `string` | a heap reference; no byte width |
| `T[]` | a WasmGC array reference |
| `Map`/`Set` | heap references |
| `(…) => T` | a function reference |
| `T \| null` | a nullable has no in-memory discriminant in this tier |
| `A \| B` | a union box is a heap reference |
| a non-`flat` record | it has no layout — that is what `flat` means |
| `boolean` | **see below** |
| a type parameter `T` | no width until instantiation (§6.1) |

### `boolean` is rejected, deliberately

VL's `boolean` is an `i32` at the wasm level, so 4 bytes would be the *consistent* answer.
It is rejected anyway: anyone reaching for this tier is matching a foreign layout, C's
`bool` is **1 byte**, and a `boolean` field that silently occupies 4 is a 3-byte drift in
exactly the code whose value is byte-comparability. `flag: i32` is a one-word fix with zero
ambiguity, and the reject says so.

This is an instance of the standing rule below.

> **Every ruling in this section chose the REJECT when in doubt, because widening a reject
> later is backward-compatible and narrowing an accept is not.** A program that today writes
> `flag: i32` keeps working if `boolean` is ever admitted; a program that today writes
> `flag: boolean` and gets 4 bytes breaks the day anyone decides 1 byte was right.

### Newtypes compose for free

`type EntityId = new i32` in a flat field is accepted at width 4 with **no code for it**. A
newtype's arena index is a second index over the same `Ty` payload, so "is this a `TyPrim`
named `i32`" answers exactly as the base answers (`newtype-design.md` §3.1). The interaction
is measured (§7.1), not assumed — but it was free, and it is the second time P1.5's
representation choice has paid a feature it was not designed for.

### Nested flat types INLINE

```vl
flat type Inner = { a: i32, b: i32 }        // size 8
flat type Outer = { x: i32, k: Inner }      // size 12, k at offset 4
```

`Outer.k` is 4 — the offset of the nested record's **first byte**. Reaching a nested field
is `Outer.k + Inner.a`, which composes by addition because both are byte offsets from their
own record's start. This is why the constant surface (§5) needs only **one** level of
member access: nesting composes with `+` instead of with syntax.

Sizes resolve in dependency order with a **cycle guard**: `flat type A = { b: B }` +
`flat type B = { a: A }` is an infinite layout and is rejected by name, not by hanging.
Self-reference (`flat type A = { a: A }`) is the same reject. A flat type may only nest a
flat type **declared before it is needed** in the resolution order; the resolver is a
fixpoint over the declaration list, so declaration order in the source does not matter — only
acyclicity does.

### Generic flat types are rejected

`flat type Box<T> = { v: T }` is rejected at the declaration. A type parameter has no width,
and the generic-alias registry memo-keys applications by a synthesized name — branding *that*
is a separate design, exactly as it was for newtypes (`newtype-design.md` §5). Filed in §6.1,
where it is the thing standing between here and a generic `rows<T>`.

---

## 4. Zero cost: `flat` is erased before the emitter runs

**A `flat type` is an ordinary record type that has additionally been validated and
measured.** It is not a separate tier of value. `flat type TValue = { … }` still declares a
WasmGC struct usable exactly where the same declaration without `flat` is usable, and it
emits **byte-identical** bytes (§7.2).

This is the ruling that made the feature small, so it is worth stating as one:

**RULING: `flat` ADDS validation and constants; it SUBTRACTS nothing.** A flat type is not
barred from being a value, a field, an array element, a return type.

The alternative — **`flat` marks a layout descriptor that cannot be a value** — is the
purist reading and was rejected. It would mean a new kind of declaration that four dispatch
sites in the emitter must learn about, it would forbid the perfectly reasonable
`const v: TValue = { … }` staging struct, and it buys nothing: nothing is *unsound* about a
flat type also being a GC struct. It also does not foreclose §6.2 — under either reading,
`stack[i].tt` is a fused load that never materializes a struct.

Erasure falls out: the marker (`tdFlat`) is read by exactly one consumer, the checker's
declaration pass. The constants (§5) are folded into `NumLit` nodes **in the arena** by the
checker, so by the time the emitter runs there is no `Member` node left to lower and no flat
type left to recognize. The `P.nodes[ix] = P.nodes[…]` in-place rewrite is the technique
`desugarMatchAt` already uses for `match`.

---

## 5. Reading the layout: `N.size` and `N.<field>`

**RULING: `N.size` is the record's total byte size; `N.f` is field `f`'s byte offset. Both
are `i32` constants folded at check time.**

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }

const row = base + i * TValue.size     // 16
const tt  = __load_i32__(row + TValue.tt)   // + 8
```

The receiver is a **type name**, which is not a value, so `N.f` can only ever mean layout
metadata — there is no expression whose field it could be. The interception is guarded three
ways and cannot reach an existing program: the receiver must be a bare identifier, the
identifier must name a **flat** type, and it must **not** resolve as a value binding (a
local named `TValue` wins, and shadows the layout constants).

Reading `N.f` where `N` is a declared but **non-flat** type is a targeted error naming
`flat`, rather than the `undeclared identifier 'N'` master gives — that message is the
discoverability path for the whole feature.

### The `size` collision, and why it is a reject

A flat type that declares a field named `size` makes `N.size` ambiguous. **The declaration
is rejected**, with a message naming the collision. Loud beats either silent resolution:
"field wins" hides the record's size behind a field name, "size wins" hides a field's offset,
and both are silent wrong answers in address arithmetic.

### Alternatives

- **Two levels: `N.size` and `N.f.offset` / `N.f.size`.** Strictly more expressive (a
  field's *width*, not just its offset) and it dodges nothing — `N.size` is still ambiguous
  against a field named `size` at the first hop. It also costs an intermediate
  field-descriptor type in the checker for the inner access to have a type. Rejected on
  cost; **`N.f.size` (a field's width) is the one thing the shipped surface cannot express**,
  and it is filed.
- **`sizeOf(T)` / `offsetOf(T, f)` call syntax.** Collision-free, C-familiar. Rejected: the
  second argument is a bare field name in an expression position, which is a grammar VL does
  not have anywhere else; and the intrinsic route would put two names into the builtin list,
  which is a five-file membership set (`driver`, `typecheck`, `emit_classify`,
  `emit_sections`, `wasmEmit`) and a standing "classifier taught half a set" hazard. The
  dotted form touches one function.
- **Declaration-synthesized globals** (`TValue_SIZE`, `TValue_tt_OFFSET`). Zero new
  expression syntax, but it invents a naming convention, pollutes the module namespace with
  N+1 identifiers per declaration, and collides with a user constant of the same name.
- **`N.size` folding for non-flat records too.** Rejected: a non-`flat` record's layout is
  WasmGC's business and the compiler does not know it. Answering would be a lie.

---

## 6. What is NOT in this phase

### 6.1 `buf.rows<T>(offset, count)` — blocker 2 SHIPPED (§11), blocker 1 REFUTED

This section filed two blockers. **One was real and is now closed; the other was never a
blocker for this feature at all.** §11 re-derives both by building.

1. ~~**Generic flat types are rejected** (§3), so there is no `flat` declaration to
   instantiate.~~ **STALE — the premise misidentifies whose generic is needed.** `rows<T>`'s
   `T` ranges over *concrete* flat records (`TValue`, `Node`); what is generic is the
   **container**, and a generic container is an ordinary generic alias that has always been
   legal. Generic `flat` declarations remain rejected and remain unrelated (§11.4).
2. `T.size` for a parameter needs the fold to run **after** monomorphization substitutes the
   argument, and the fold currently runs in the checker where `T` is still a parameter.
   **REAL, and closed by §11**: the checker types the member and the monomorphizer folds it,
   per instance.

### 6.2 `stack[i].tt` — SUPERSEDED by §9

This section filed `stack[i].tt` as blocked because `function "[]"(self: V, i: i32)` did not
parse. **That premise expired**: B14's free index operators ship
(`index-operator-design.md`), and the second half — the one this section called the harder
one — needed no compiler work at all.

The reasoning that dated fastest is worth keeping, because the conclusion was wrong in an
instructive way:

> `stack[i].tt` is additionally *harder* than `x[i]`: it is an index-then-field **pair** that
> must fuse into one load without materializing a row, so a lowering that returns a row value
> from `[]` and then reads `.tt` off it is not the same feature.

Both sentences are true and the inference from them is not. It assumed `[]` must return a
**row**, and then that fusing away the row is a lowering problem. But `[]` can return a row
**ADDRESS** instead, and then there is no row to fuse away — the field accessor is an offset
load off an integer, and the fusion is not an optimization the compiler must perform but a
shape the program already has. §9 records the pattern and proves the codegen.

### 6.3 The measurement behind the phasing

With §1–§5 and nothing else, this is the Lua `TValue` accessor set, in pure VL, using
`std:buffer` and P1.5 newtypes:

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }
type TValueRows = new { base: i32, count: i32 }

function tvRows(b: Buf, off: i32, count: i32): TValueRows {
  const r: TValueRows = { base: b.base + off, count: count } as TValueRows
  return r
}
function tvAddr(r: TValueRows, i: i32) { return r.base + i * TValue.size }
function tvTt(r: TValueRows, i: i32)   { return __load_i32__(tvAddr(r, i) + TValue.tt) }
function tvSetTt(r: TValueRows, i: i32, v: i32) { __store_i32__(tvAddr(r, i) + TValue.tt, v) }
```

Every address in that block is derived from the declaration. Nothing is hand-computed.

> **Correction, from §9.2.** The last sentence of this section used to read "`rows<T>` and
> `stack[i].tt` would delete the last two lines *per field*". The second half is right —
> nothing here is newly possible — but the accounting is wrong, and it was wrong about the
> axis. The fused spelling needs the **same number** of functions for the same record (5 for
> two fields, either way); what it deletes is the **container** dimension, because a
> row-address accessor names no container and so is written once per record instead of once
> per (record × container) pair. §9.2 has the measurement.

---

## 7. Measurements

All against master `aa3d2990` (compiler 1,058,013 B). Branch compiler: **1,067,991 B,
+9,978 B**.

### 7.1 The layout grid — 34 asserted cells

`tests/cases/memory/flat-layout-grid.vl` (20) and `tests/cases/types/flat-record-declaration.vl`
(13) plus the module pair. Every scalar width in first / middle / last position, the same
widths reversed (order is layout), a single-field record, an empty record, and the two
padding-rule differences stated as values: `{ value: i64, tt: i32 }` is **12** (C would say
16), and `{ a: i32, b: i64 }` puts `b` at **4**, straddling the 8-byte boundary.

`TValue` comes out at size **16** with `tt` at **8** — the requirements doc's own two numbers.

### 7.2 Proved at the address, not just in the table

`tests/cases/memory/flat-roundtrip-raw-addresses.vl`. An offset table can be internally
consistent — every offset the running sum of every width — and still be wrong about which
bytes a field occupies, and no arithmetic assertion can see it. So every WRITE goes through
the DERIVED address (`base + i * TValue.size + TValue.tt`) and every READ comes back through
a raw intrinsic at a HAND-COMPUTED one (`base + i * 16 + 8`). Three consecutive rows, so a
constant that is right for row 0 and wrong for the stride cannot pass; then all five scalar
widths, including the f64 at the straddling offset 4.

### 7.3 Zero cost — byte-identical

A program declaring three flat records and using them as ordinary values (literal, parameter,
return, nested field, array element) and the same program with the three `flat` markers
DELETED both compile to **635 bytes, `cmp`-identical**, same output. The control is
`flat`-deleted, not declaration-deleted — the distinction P1.5 had to correct for itself.

### 7.4 The reject grid — 17 cells, 16 inverted controls clean

Every rejected field type, plus generics, recursion, self-reference, the three non-record
bodies, the `size` collision, `N.f` on a non-flat type, and an unknown layout member. Each
inverted control is the same program with `flat` deleted.

**The controls earned their keep.** A `Map` field was in the grid and rejected — and so did
its non-flat twin: `Map` is not spellable as a field type in VL at all. That reject was
**pre-existing and had nothing to do with this feature**, and only the control could say so.
It is dropped from the grid rather than counted.

The recursion control is the sharpest: `type Cycle = { other: Loop }` is perfectly ordinary
VL, because a non-flat record field is a REFERENCE. The reject is not "recursion is bad", it
is "an INLINE record cannot contain itself", and only the control makes that visible.

### 7.5 The `vl fmt` hazard, confirmed by sabotage

Building the compiler with the one-line `pos` fix reverted (§1) and re-running `vl fmt` over
the four-position fixture: **all four `flat` markers deleted, plus the `export` on the second
one** — `exportPrefix` reads the token immediately before `pos`, which had become `flat`
rather than `export`. Exit code 0, no diagnostic: a checked layout silently downgraded to a
plain record. Pinned by `tests/vl_fmt_test.ts` (it cannot live in `tests/cases` — that tree
is excluded from the `vl fmt --check` gate and the case runner has no `@fmt` directive).

### 7.6 No regression

| gate | result |
| --- | --- |
| fixpoint (from a freshly fetched seed) | holds at 2 compiles |
| `native-fixpoint.sh` | stage3 == stage4 byte-for-byte |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | **3436 / 0 / 8** (master 3411 / 0 / 8), ignored SET unchanged |
| `lint-self.sh` | clean |
| `rep-fuzz-check.sh` | exact, 1 baselined reject, 0 new / 0 stale |
| corpus A/B, six channels, 1,638 files | **field 5 (BYTES) all-same**; 11 rows differ and all 11 are this PR's own new fixtures |
| fuzz A/B, 56 seeds × 1,000 cases = **56,000 per side** | finding sets **identical** (317 REJECT rows each, same class × shape) |

Two harness notes worth keeping. The corpus A/B's **field 4 (BUILDMSG) is what catches the
four reject fixtures** — their check/build rc is 1 on both sides, because master rejects them
too, as `undeclared identifier 'flat'`; only the message moved. And `fuzz-vl.sh --count`
has a node budget: `--count 26000 --depth 5` silently generates **0 cases** and then reports
every expectation as a MISMATCH, which reads exactly like 52,000 findings. Volume comes from
many seeds, not a big count.

---

## 8. Where each piece lives

| concern | home |
| --- | --- |
| `flat` keyword recognition, record-body reject | `compiler/parser.vl` (`parseStmt`, `parseTypeDecl`) |
| `tdFlat` marker | `compiler/ast.vl` (`TypeDecl`, `mkTypeDecl`) |
| layout computation, validation, cycle guard | `compiler/typecheck.vl` (declaration pass) |
| the `N.size` / `N.f` fold | `compiler/typecheck.vl` (`checkMemberNode`) |
| **the emitter** | **nothing** |
| **the fused `stack[i].tt()` pattern (§9)** | **nothing — it is user code** |

---

## 9. The fused row pattern: `stack[i].tt()` in user space

**RULING: `"[]"` returns a row ADDRESS, not a row. The field accessors take that address.
Nothing about this is a compiler feature — it is three shipped features composed, and it
costs zero bytes over the hand-written spelling.**

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }

type RowAddr = new i32                        // the row ADDRESS, branded
type Stack   = new { base: i32, count: i32 }

function "[]"(self: Stack, i: i32): RowAddr {
  return (self.base + i * TValue.size) as RowAddr
}
function tt(self: RowAddr)            { return __load_i32__((self as i32) + TValue.tt) }
function setTt(self: RowAddr, v: i32) { __store_i32__((self as i32) + TValue.tt, v) }

st[3].setTt(7)
print(st[3].tt())        // an ADD, then an i32.load
```

Three shipped things compose, and each supplies exactly one piece:

| piece | supplied by | what it gives |
| --- | --- | --- |
| `TValue.size` / `TValue.tt` fold to constants | **P1.2 half one** (§5) | the addresses are derived, never hand-computed |
| `st[i]` dispatches to a free function | **B14** (`index-operator-design.md`) | the bracket |
| `RowAddr` is a distinct type at width `i32` | **P1.5 newtypes** | a return type that is an *address*, and one that cannot be crossed with another record's |

The whole trick is the third row. Once `"[]"` returns something branded over `i32`, the
bracket yields an address, `.tt()` is UFCS on an integer, and **there is no row value
anywhere in the program** — so there is nothing for a fusion optimization to remove.

### 9.1 Divergence from the spec: `.tt()`, not `.tt`

The requirements doc writes `stack[i].tt` — a FIELD. VL's UFCS is call-style, so what is
writable is `stack[i].tt()`. **This is the only divergence, and it is a loud checker
reject, not a wrong answer:**

```
member access '.tt' on non-object RowAddr
```

Pinned by `tests/cases/memory/flat-fused-row-field-spelling-rejected.vl`, which differs from
the working fixture by exactly two characters.

**Branding over `i32` is what makes the wrong spelling unrepresentable.** The alternative —
branding `RowAddr` over a *struct* — would make `.tt` resolve, as a real field read of a
materialized row, which is precisely the fusion the ask forbids. The paren-less spelling
would then compile and be *slower*, which is a far worse outcome than not compiling. So the
divergence is not a wart to be sanded off later; the reject is load-bearing.

Closing it for real means field-position UFCS (`x.f` resolving to `f(x)` when `f` is a
`self`-function and `x` has no such field), which is a language-wide change to member
resolution with its own swallow to measure — not a flat-records question. Filed, not fixed.

### 9.2 What it deletes — the container dimension, not the field one

The honest count first, because the obvious claim is false:

| | functions for a 2-field record | 
| --- | --- |
| hand-written (§6.3), `(container, index)` accessors | `slotAt` + 4 = **5** |
| fused, row-address accessors | `"[]"` + 4 = **5** |

**Identical.** The bracket removes nothing per field, and §6.3's "would delete the last two
accessors PER FIELD" was wrong about which axis it saves on.

What it removes is the **container** dimension. A `(container, index)` accessor names a
container type, so it is written once per (record × container) pair; a row-address accessor
names none, so it is written once per RECORD and each container contributes exactly one
`"[]"`. **N×M becomes N+M.** Pinned at M=2 by
`tests/cases/memory/flat-fused-row-one-accessor-set-two-containers.vl`: a `Stack` that
addresses linearly and a `Ring` that masks and wraps share one accessor set, and the two
operators have nothing in common.

For the Lua VM — `TValue` reachable from the stack, from a table's array part, from a
`Node`'s key and value slots — M is not 1, and this is the axis that matters.

**The third rung, stated so the credit lands in the right place.** Accessors that take a
bare `i32` address plus a per-container `slotAt` also get N+M, and they are expressible with
*no* new features at all — no brand, no bracket, nothing from B14 or P1.5:

```vl
function slotAt(self: Stack, i: i32): i32 { return self.base + i * TValue.size }
function tt(addr: i32): i32 { return __load_i32__(addr + TValue.tt) }
print(tt(slotAt(st, i)))
```

So the fused pattern's marginal contribution over the *strongest* control is exactly two
things: the call site reads as the spec's shape, and the address carries a brand.

### 9.3 The measurement: the brand and the bracket are free

Three programs, same loop (`acc += tt of row i`, 8 rows), built with the same compiler:

| rung | spelling | `-O0` bytes | `-O3 --closed-world` bytes |
| --- | --- | --- | --- |
| 1 | `tagOf(st, i)` — `(container, index)`, §6.3's shape | 1555 | 298 |
| 2 | `tt(slotAt(st, i))` — raw `i32` address, no brand, no bracket | **1551** | **296** |
| 3 | `st[i].tt()` — **fused, branded** | **1551** | **296** |

**Rungs 2 and 3 are `cmp`-IDENTICAL, at both optimization levels.** Not "the same size" —
byte-for-byte the same module. The brand is erased before the emitter runs (P1.5's
representation ruling) and the bracket is rewritten to a direct call before lowering (B14's
§1), so `st[i].tt()` emits precisely what `tt(slotAt(st, i))` emits. The safety is free.

Rung 1 is 4 bytes larger only because `tagOf` re-derives the address by calling `slotAt`
rather than receiving it; the dynamic call count is 2 on every rung.

**The fusion, in the disassembly.** `wasm-tools print` of the `-O0` rung-3 module — the two
functions the access path goes through, in full:

```wat
(func (;41;) (param (ref 2) i32) (result i32)   ;; "[]"
  local.get 0  struct.get 2 0                   ;; self.base
  local.get 1  i32.const 16  i32.mul  i32.add   ;; + i * TValue.size
  return)
(func (;42;) (param i32) (result i32)           ;; tt — takes the ADDRESS
  local.get 0  i32.const 8  i32.add             ;; + TValue.tt
  i32.load
  return)
```

Neither function allocates. The module's four `struct.new` sites are all outside the access
path — three inside `std:buffer`'s own helpers and one for the `Stack` itself at setup
(line 553, before the loop opens at 556); **the loop body contains none**. No row is
materialized. The `RowAddr` parameter of func 42 is a bare `i32` — the brand is gone by
codegen.

At `-O3 --closed-world` both functions **inline away completely** and the loop body becomes,
with the multiply strength-reduced to a shift and `count` dead-code-eliminated out of the
struct:

```wat
global.get 3  i32.const 4  i32.shl     ;; i * 16
global.get 2  struct.get 6 0  i32.add  ;; + base
i32.const 8   i32.add                  ;; + TValue.tt
i32.load
```

**No call remains** except the `print` import. This answers the P1.4 speed note directly: the
two calls the fused spelling costs at `-O0` are both gone under the release profile, so
`st[i].tt()` is an offset-add and a load and nothing else.

### 9.4 The merge axis

Every piece survives a module boundary, and the two mechanisms survive it for *different*
reasons — which is why `tests/cases/memory/flat-fused-row-import/` is pinned separately:

- the **bracket** names nothing, so there is nothing to alias; the operator registry is
  built from the already-merged program (`index-operator-design.md` §R4);
- the **UFCS accessors** carry a property string the merge deliberately leaves plain, so
  they reach the mangled function through `ufcsAliasOf` — an entirely different route.

The fused spelling rides both on every single access. `TValue.size` also folds against an
imported `flat` declaration exactly as against a local one.

### 9.5 Bounds: none, deliberately

`st[i]` adds no check to the index and none to the address. A `RowAddr` is a raw address and
the engine's bounds check is the policy — the same ruling `load-past-page-end-traps.vl`
states for the raw intrinsics, and the opposite of `std:buffer`'s views, which DO fence each
access (`buffer-design.md` §L3) because a view carries a length.

The `Stack` in these fixtures carries a `count` and the operator ignores it. That is the
right default for this tier, and the reason it is safe to state so flatly is that **the
operator is user code**: a program that wants the fence writes it in the operator body, in
four lines, which is exactly where the choice should live. Pinned by
`tests/cases/memory/flat-fused-row-past-page-end-traps.vl`.

### 9.6 Two pre-existing defects this pattern walks straight into

Neither is caused by this work and neither is fixed here (both live in `compiler/*.vl`).
Both were witnessed against the unmodified master compiler.

**D1 — a UFCS call whose receiver parameter is not named `self` checks CLEAN and fails in
the emitter.** `vl check` exits 0; `vl build` exits 1.

```vl
function bump(x: i32, by: i32): i32 { return x + by }
const a = 5
print(a.bump(3))
// vl check → "Checked 1 file, no errors."      rc 0
// vl build → "emitProgram: callee is not a function name"   rc 1
```

The checker's `ufcsCallTy` tests arity and `assignable(recvTy, params[0])` and **never looks
at the parameter's name**; the emitter's rewrite requires `parName == "self"`. Struct
receivers hide it (`assignable(struct, i32)` fails first, so the call is rejected for a
different and correct reason) — it is reachable exactly when the first parameter is
type-compatible but misnamed, which is the ordinary case for scalar and newtype receivers.

This is the wall the P1.2 investigation hit first, and it is worth recording *why* it cost
more than it should have: the initial reading was "the fused pattern is refuted — UFCS does
not work on a branded scalar". It was not refuted; it was misspelled. A diagnostic naming
the `self` rule at the call site would have turned an afternoon into a minute.

**D2 — that emit error's span never points at the call site; it points at the emitter's
CURRENT-FUNCTION cursor.** This was first filed here as "the span tracks the callee's
declaration", which the original witness supported and which is wrong — the callee was
simply the last function declared. Four witnesses separate the candidates:

| witness | callee decl | enclosing fn | call site | span |
| --- | ---: | ---: | ---: | ---: |
| call inside a function, callee declared ABOVE | 4 | 8 | 10 | **8** |
| call inside a function, callee declared BELOW | 9 | 2 | 4 | **2** |
| top-level call, callee is the only function | 4 | — | 9 | **4** |
| top-level call, an unrelated function declared AFTER the callee | 2 | — | 7 | **4** (`unrelated`) |

So: for a call inside a function the span is the ENCLOSING function's declaration, and for a
top-level call it is the LAST function declared — i.e. a stale leftover, since the emitter
never entered a function for that statement. The two unify as "whatever the emitter's
current-function cursor last pointed at". It coincides with the callee's declaration only
when the callee happens to be the last-declared function, which is what the original witness
did. *A span diagnosis needs the candidates separated on both axes; one witness where two of
them coincide reads as a rule.*

### 9.7 What is pinned

| fixture | what it holds |
| --- | --- |
| `memory/flat-fused-row-accessors.vl` | the pattern end to end: fused write and read of `tt`/`value`, in a loop and at constant indices, cross-checked against HAND-COMPUTED raw addresses; the row-HANDLE idiom (`const r = st[9]`); the declared stride |
| `memory/flat-fused-row-one-accessor-set-two-containers.vl` | N×M → N+M: `Stack` and `Ring` sharing one accessor set |
| `memory/flat-fused-row-import/` | the merge axis, both mechanisms at once |
| `memory/flat-fused-row-brands-dont-cross.vl` | two row brands over one representation; a `NodeAddr` into a `TValue` accessor, and a bare `i32` variable into a row accessor |
| `memory/flat-fused-row-field-spelling-rejected.vl` | the `.tt` divergence, as the reject it is |
| `memory/flat-fused-row-past-page-end-traps.vl` | the bounds policy |

The read/write cross-check in the first fixture is the §7.2 discipline reapplied: every
WRITE goes through the fused derived address and the verification READ comes back through a
raw intrinsic at a hand-computed one, because an address scheme can be internally consistent
and still be wrong about which bytes it touches.

---

## 10. Design sketch: generic `rows<T>` (NOT built)

§6.1 files `buf.rows<T>(off, count)` behind two blockers. §9 changes what it is *for* — the
per-record accessor set is no longer the cost, the per-record `"[]"` is — so it is worth
saying crisply what remains.

**What `rows<T>` would add over §9.** In §9 each record needs its own container type and its
own operator, differing only in which `size` constant they multiply by:

```vl
type Stack = new { base: i32, count: i32 }
function "[]"(self: Stack, i: i32): RowAddr { return (self.base + i * TValue.size) as RowAddr }
type Nodes = new { base: i32, count: i32 }
function "[]"(self: Nodes, i: i32): NodeAddr { return (self.base + i * Node.size) as NodeAddr }
```

That is the last per-record boilerplate the pattern has not deleted: **one container brand
and one four-line operator per flat record.** A generic `Rows<T>` would collapse it to a
single declaration.

**The shape it would take.** Not a `buf.rows<T>` *method* — a generic container type with a
generic operator, which is the same B14 route §9 already rides:

```vl
type Rows<T> = new { base: i32, count: i32 }
function "[]"<T>(self: Rows<T>, i: i32): Addr<T> {
  return (self.base + i * T.size) as Addr<T>
}
```

**Three things were filed as standing in the way. §11 re-derives all three by building: (1)
is not a blocker for this feature, (2) shipped, and (3) is confirmed and is now the ONLY
thing left — for a reason sharper than "generic newtypes are a separate design".**

1. ~~**Generic flat types are rejected** (§3) — a type parameter has no width.~~ Refuted as a
   blocker: the flat records `rows<T>` indexes are concrete (§11.4).
2. ~~**`T.size` must fold after monomorphization.**~~ **SHIPPED** (§11.1).
3. **The row-address brand must be generic too** — `Addr<T>`, so that `Rows<TValue>` and
   `Rows<Node>` yield addresses that do not cross. **Confirmed, and it is the whole
   remainder** (§11.3).

**The ordering this implies.** (3) is the one to settle first, because it decides whether
`rows<T>` is worth building at all: a `rows<T>` that returns unbranded addresses is
strictly worse than the four lines it replaces. That ordering held up — (2) turned out to be
mechanical and landed, and (3) is where the feature stops.

**And the honest priority.** Against §9 the remaining prize is one brand and one four-line
operator per record — for the Lua VM, on the order of three declarations. That is smaller
than what §6.3 estimated when the accessor set was still believed to be the cost. `rows<T>`
should be scheduled behind anything that unblocks a program rather than shortening one.

---

## 11. A type PARAMETER answers for its layout — and where `rows<T>` actually stops

**RULING: `T.size` / `T.<field>` are legal wherever `T` is a live type parameter. The checker
types them `i32` and leaves the node standing; the MONOMORPHIZER folds them, once per
instance, against that instance's binding.**

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }   // size 16
flat type Node   = { key: i32, val: i32 }              // size 8

type Rows<T> = { base: i32, count: i32 }
function "[]"<T>(self: Rows<T>, i: i32): i32 {
  return self.base + i * T.size          // 16 in one instance, 8 in the other
}
```

One operator, every flat record. This is §10's sketch minus its brand, and it closes the
second of the two blockers §6.1 filed.

### 11.1 The phase is the whole design, and it is not the checker's

The fold **cannot** run where the existing `TValue.size` fold runs (§5). The checker walks a
generic body **once**, with `T` abstract; there is no binding to fold against, and inventing
one would pick an arbitrary instance. So the checker does exactly two things — it recognises
that the receiver is a live type parameter (`flatMemberFold` answer 3) and types the member
`i32`, which is its type under *every* binding — and the constant is supplied later.

The monomorphizer is where a binding first exists (`monoFoldTyParamLayout` in
`emit_mono.vl`), and the fold has to happen **per instance**, which is the part that is not
free:

> **Instances SHARE the original's body arena nodes.** Folding `T.size` in place would hand
> every instance the LAST binding's constants — a `Rows<Node>` addressed at `TValue`'s
> stride. That is a wrong ADDRESS, silently, in the one tier whose entire value is
> byte-precision.

So the pass is **clone-if-changed** over `monoCloneGenericCalls`' traversal — the same
traversal, for the same aliasing reason that function documents for a shared callee `Ident`.
A body that reads no layout member returns the SAME node index, so the fold is usage-gated
and a program without one emits byte-identically, preserving §4's property.

**How the phase was verified, rather than assumed.** A single-instance program cannot tell
the two phases apart: fold-in-the-checker, fold-at-the-first-instance and fold-in-place all
agree when there is one binding. `flat-generic-rows-stride.vl` therefore instantiates the
same operator at **two records with different strides** and asserts both, plus the layout
constants themselves per instance, plus a write through the derived address read back at a
HAND-COMPUTED one (§7.2's discipline). Fold-in-place fails that fixture on the first two
lines; a checker-side fold cannot compile it at all.

### 11.2 What the checker gives up, stated plainly

`T.size` is typed without being validated. Whether the binding names a `flat` type, and
whether that type HAS the member, are questions the checker cannot answer — it sees `T`, not
`TValue`. Both are answered by the monomorphizer against the instance that got it wrong:

```
emitProgram: monomorphize: `T` is bound to `Plain`, which is not a `flat` type, so it has no byte layout
emitProgram: monomorphize: `flat type TValue` (bound to `T`) has no field 'nosuch' — its layout members are `.size` and one offset per declared field
```

This is a **`vl check`-clean, `vl build`-rejected** pair, which this repo otherwise treats as
a defect class. It is accepted here deliberately and only here: the alternative is rejecting
every `T.size` in the checker, which is the feature. Both messages name the BINDING, not the
parameter, because the binding is the thing the programmer chose. Pinned by
`memory/flat-generic-rows-not-flat-rejected.vl` and
`memory/flat-generic-rows-unknown-member-rejected.vl`.

### 11.3 The brand: REFUTED, and the refutation needed a discriminating witness

§10 requires that `Rows<TValue>` and `Rows<Node>` yield addresses that do not cross. The
obvious route is to let the operator's RETURN be a type parameter, so the container names the
brand:

```vl
type TVAddr = new i32
type Rows<R, A> = { base: i32, count: i32 }
function "[]"<R, A>(self: Rows<R, A>, i: i32): A { return self.base + i * R.size }

const st: Rows<TValue, TVAddr> = { base: 1024, count: 4 }
print(tt(st[1]))          // checks, builds, runs, reads the right bytes
```

**That program works, and it proves nothing.** The discriminating witness is the one where
the brands are supposed to STOP the program:

```vl
const nd: Rows<Node, NodeAddr> = { base: 2048, count: 4 }
print(tt(nd[1]))          // a Node row address into a TValue accessor
// vl check → no errors.   vl build → ok.   vl run → 0
```

It compiles. A `string` parameter accepts it too, and *that* spelling emits an invalid module
(`type mismatch: expected (ref $type), found i32`) with `vl check` clean. **The type-parameter
return is not a brand — it is an UNCONSTRAINED type variable, which is assignable to
everything.** Both witnesses reproduce against the published `seed-latest`, so this is
pre-existing and is not caused by the layout fold; it is filed here because this is where it
becomes load-bearing.

The mechanism, since it explains why no small fix falls out. The checker binds type
parameters by **structural unification** against the argument's arena type. A generic alias
application EXPANDS into its body, and a `Rows<R, A>` body mentions neither `R` nor `A`, so
the expansion is `{base: i32, count: i32}` with **no type variable left anywhere in it** —
there is nothing to unify, and `A` stays unbound. (The application's arguments *are* recorded,
in the `gaApp*` sidecar, but that sidecar is read only by the type RENDERER.) Two independent
gaps follow, and both would have to close:

- **the index route never binds at all** — `x[i]` returns the operator's declared return type
  verbatim, so even a *non*-phantom generic operator returns its bare type parameter;
- **a phantom parameter is unrecoverable structurally** — closing it means binding
  NOMINALLY, from the application sidecar, which is a change to what generic-alias
  application MEANS in the checker, not a patch to one route.

Meanwhile the monomorphizer binds `Rows<TValue, TVAddr>` against `Rows<R, A>` by NAME, and
gets it exactly right — which is why the *addresses* are correct while the *types* are not.
**The two layers disagree about what a phantom type argument is, and the layout fold rides
the layer that is right.**

### 11.4 The other two routes to a brand, both closed by measurement

- **A generic newtype `Addr<T>`** — `newtype-design.md` §5 files this as unbuilt. Re-derived:
  `type Addr<T> = new i32` *declares* without complaint and its application is
  `unknown type 'Addr<i32>'`, in an annotation and in an `as` cast alike. The reason is one
  rung below newtypes: the generic-alias registry only accepts a **record** body at all —
  plain `type Al<T> = i32` is equally `unknown type 'Al<i32>'`. So a generic newtype over a
  scalar is not "a brand that is ignored", it is a declaration form the registry does not
  have. Filed, unchanged.
- **Generic `flat` types** (§3's reject, §6.1's blocker 1). Not on this path: `rows<T>`
  indexes CONCRETE flat records, and `T.size` resolves them by name at the instance. A
  generic `flat type Row<T>` would need its own spelling for the constants — `Row<i32>.size`
  does not parse — reachable only through a concrete alias (`type RowI = Row<i32>`), which is
  a separate feature with a separate consumer. The reject stands and is no longer the thing
  standing between here and `rows<T>`.

### 11.5 And the spec's own spelling does not parse

`buf.rows<TValue>(offset, count)` is not writable in VL for a reason neither §6.1 nor §10
records: **VL has no call-site type arguments.** `f<T>(x)` lexes as two comparisons, so
`idOf<i32>(7)` is `undeclared identifier 'i32'` on master. VL's generics are inference-only —
`<T>` appears in declarations and in type annotations, never at a call. And the fallback of
inferring `T` from the call's expected type is closed too: a type parameter that appears ONLY
in the return is rejected by the monomorphizer, by name
(`monomorphize: a return type parameter of \`mkRows\` is not bound by any parameter`).

So `rows<T>` can only ever be what §10 already said it should be — **a generic container type
plus a generic operator**, not a method. That shape works today for the ADDRESS and not for
the BRAND, and §11.3 is the reason.

### 11.6 What is pinned

| fixture | what it holds |
| --- | --- |
| `memory/flat-generic-rows-stride.vl` | one generic operator at TWO strides; the constants per instance; `T.<field>` offsets; a generic accessor calling another generic accessor; every write through the derived address, read back at a hand-computed one |
| `memory/flat-generic-rows-not-flat-rejected.vl` | the binding is not a `flat` type — loud, at emit, naming the binding |
| `memory/flat-generic-rows-unknown-member-rejected.vl` | the binding is flat and the member is not |
