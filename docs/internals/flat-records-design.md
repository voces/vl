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
| **(b)** `buf.rows<T>(off, n)` | a **generic accessor** feature | FILED (§6.1) |
| **(c)** `stack[i].tt` | **index-then-field sugar** over linear memory | FILED (§6.2) |

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

### 6.1 `buf.rows<T>(offset, count)`

Needs a generic accessor whose element size depends on the type argument — i.e. `T.size`
must answer for a **type parameter** at each instantiation. Two things stand in the way, both
measured:

1. **Generic flat types are rejected** (§3), so there is no `flat` declaration to
   instantiate.
2. `T.size` for a parameter needs the fold to run **after** monomorphization substitutes the
   argument, and the fold currently runs in the checker where `T` is still a parameter.

Until then the hand-written per-type accessor set (§6.3) is the route, and it is *expressible
today* — this is boilerplate, not a blocker.

### 6.2 `stack[i].tt`

**This is the same blocked road P1.1 filed for `x[i]`, and the same measurement applies.**
`x[i]` on a non-array is purely syntactic; the right dispatch route is ROADMAP B14's free
`self`-functions named for an operator, and `function "[]"(self: V, i: i32)` **does not
parse today** — `emit_rewrite.vl:281`'s operator arm is unreachable dead code
(`buffer-design.md` §L5). Nothing about flat records changes that verdict, and shipping a
second bespoke bracket route for rows would be the wrong answer to the same question.

`stack[i].tt` is additionally *harder* than `x[i]`: it is an index-then-field **pair** that
must fuse into one load without materializing a row, so a lowering that returns a row value
from `[]` and then reads `.tt` off it is not the same feature.

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
`rows<T>` and `stack[i].tt` would delete the last two lines *per field*; they would not make
anything newly possible.

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
