# Zero-cost nominal newtypes (webcraft P1.5 / roadmap A14)

`type EntityId = new i32` mints a type that is **distinct in the checker** and
**absent from the emitter**. Two customers forced it, and the second is the one
that decided the shape:

- **Ids.** The kernel traffics in `EntityId`, `PlayerSlot`, `AbilityHandle`, all
  `i32`. Structurally they are one type and they interchange silently — the bug
  class the TS twin catches with branded types
  (`docs/webcraft-requirements.md` §P1.5).
- **Typed views.** `F32View` and `I32View` are both `{base, count}`, so an
  `I32View` satisfies every `F32View` parameter and integer bytes read back as
  floats with no diagnostic. Measured, not feared: `buffer-design.md` §L2. The
  shipped interim puts the element width in the FIELD NAME (`f32base` /
  `i32base`) because that is the only discriminator a structural checker can
  see. A newtype over a STRUCT deletes it.

The second customer is why this document covers scalars **and** structs in one
phase: a scalar-only newtype would have left the views hack standing, and the
mechanism turned out to be the same mechanism.

---

## 1. Syntax

**Shipped: `type N = new <body>`** — a contextual `new` immediately after the
`=` of a `type` declaration.

```vl
type EntityId = new i32
type PlayerSlot = new i32
type F32View = new { base: i32, length: i32 }
```

`new` is **not** a reserved word. It is recognized only at that one position, by
`parseTypeDecl` peeking for an `IDENT` whose text is `new` followed by a token
that can start a type. Everywhere else `new` remains an ordinary identifier.

Alternatives considered:

| candidate | why not |
|---|---|
| **hard `new` keyword in the lexer** (`keywordKind`, `lexer.vl:202`) | Free against the corpus — `new` appears as an identifier in zero of `std/`, `tests/cases/**` and `compiler/`. But it reserves a common word language-wide for one declaration form, which is a breaking change to every user program that spells `const new = …`. A contextual keyword buys the same syntax for one extra `peek`. |
| `newtype N = i32` | A new *statement* keyword: `parseStmt` dispatch, `isStmtKeyword` (block-vs-object disambiguation), `format.vl`'s statement dispatch, `lexClassOf` highlighting and the LSP/playground keyword lists all grow an arm. No expressive gain over the `new` marker. |
| `opaque type N = i32` / `distinct type N = i32` | A modifier BEFORE `type` collides with the existing `export` prefix strip (`parser.vl:2076`) and needs two-token lookahead in `parseStmt`. Longer, no clearer. |
| `type N = distinct i32` (Nim) | Identical mechanics to the shipped form; `new` is what the spec sketched, so the spec wins the coin toss. |

**The AST node is NOT new.** `type N = new i32` produces the same one-member
`UnionDecl` that `type N = i32` produces, and `type N = new {…}` the same
`TypeDecl` that `type N = {…}` produces — each with an added marker field
(`udNew` / `tdNew`, `0`/`1`), exactly the way `IsExpr.isNeg` carries the `!is`
surface (`ast.vl:228-231`).

That choice is worth more than it looks. A genuinely new `Node` variant would
have needed an arm — or, worse, would have SILENTLY fallen through — in four
places, none of which raise on an unknown kind:

| site | what an unhandled kind does |
|---|---|
| `typecheck.vl:13479` node dispatch | falls off the end to `TY_ERR` |
| `emit_collect.vl:474` top-level statement | pushed onto `startStmts` and emitted as **runtime code** |
| `format.vl:861` statement dispatch | printed as an expression statement |
| `ast.vl:266` `Node` union | `is NewtypeDecl` would not compile |

Reusing the two existing nodes means the module merge (`driver.vl:2746`/`2766`
rename arms), the formatter (verbatim token-slice re-emit, `format.vl:1069`),
`lint.vl`, `emit_collect`'s decl handling and the checker's dispatch all need
**zero** changes. The marker is read in exactly one file.

---

## 2. Construction, unwrap, and what flows

### 2.1 The rule

> A newtype does not flow to its base, from its base, or to a sibling newtype.
> A **syntactic literal** is brand-polymorphic and adopts the destination's
> brand. `as` converts explicitly in both directions.

```vl
type EntityId = new i32
type PlayerSlot = new i32

const e: EntityId = 1            // OK   — literal adopts
let n = 7
const bad: EntityId = n          // REJECT — cannot assign i32 to EntityId
const raw: i32 = e               // REJECT — cannot assign EntityId to i32
const p: PlayerSlot = e          // REJECT — cannot assign EntityId to PlayerSlot

const made = n as EntityId       // OK   — explicit construction
const back = e as i32            // OK   — explicit unwrap
```

### 2.2 Construction and unwrap are BOTH `as`

The spec sketched `EntityId(x)`. VL has no call-a-type form and adding one means
teaching the checker AND the emitter that a callee name may denote a type — the
emitter would have to erase the call, which is precisely the emit-side work this
design exists to avoid.

`as` is already VL's explicit-conversion operator, it is already numeric-only and
already resolves through an alias (`type MyInt = i32; x as MyInt` runs on master,
`checkCastNode`, `typecheck.vl:18949`), and it required **zero lines** to support
newtypes: `primNameOf(brandedI32)` is `"i32"`, so the target-is-scalar gate
passes and the cast expression's type is exactly the branded target.

| candidate unwrap | why not |
|---|---|
| **`.raw` pseudo-field** | Needs a member-access arm in the checker and a field-erasure arm in the emitter; collides with a struct newtype that has a real `raw` field. |
| **implicit in arithmetic** (newtype degrades to base on `+`) | Deletes the guarantee: `entity + 0` would launder an `EntityId` into an `i32`. |
| **`EntityId(x)` call syntax** | Above. Also ambiguous against a function named `EntityId`. |

Two prices are recorded, not hidden:

1. **`as` also converts SIBLING to SIBLING** (`e as PlayerSlot`). It is an
   explicit cast — an escape hatch is what a cast is — and it is visible in
   review. The requirement is that the confusion cannot happen *silently*.
2. **`as` is numeric-only, so a STRUCT newtype has no cast form.** A struct
   newtype is constructed from an object literal (brand-polymorphic, §2.3) and
   is not unwrappable at all. That is the right default for a view: there is no
   reason to launder an `F32View` into a bare `{base, length}`.
   A `new string` newtype is likewise constructible only from a string literal.

### 2.3 Why literals adopt

A literal has no prior identity. `f(0)` cannot be an `EntityId`-where-a-
`PlayerSlot`-goes confusion, because `0` is not an `EntityId` that came from
somewhere — the bug class is entirely about *variables* carrying the wrong
brand. Rejecting `const e: EntityId = 0` would buy no safety and would cost the
sentinel idiom every engine has.

It is also not a special case in this language. VL already contextually types
literals against their destination in four places: the float-literal→`f32`
adoption (`assignableExpr`, `typecheck.vl:4806`), literal-union membership
(4820-4824), object-literal field-wise adaptation (4830-4883) and the
union-arm adoption at 4891. The newtype arm sits beside them.

It is what makes the ONE rule cover both customers: without it a struct newtype
could not be constructed at all (no `as` for structs), and a scalar-only
exemption would be "a classifier taught half a set".

**Nested brands stay checked.** The exemption is granted at the *destination's
own* level only: an `ObjLit` against a branded struct is re-checked field by
field through `assignableExpr`, so a field whose value is a wrongly-branded
VARIABLE still rejects.

### 2.4 Arithmetic and comparison

> Same-brand operands are allowed and the result KEEPS the brand. A mixed pair
> rejects — unless the unbranded side is a literal, which adopts.

```vl
const a: EntityId = 1
const b: EntityId = 2
const s = a + b                  // OK, s: EntityId
const t = a + 1                  // OK, t: EntityId   (literal adopts)
print(a == b)                    // OK
print(a == 0)                    // OK
let n = 3
print(a + n)                     // REJECT — operator '+' mixes EntityId and i32
print(a == n)                    // REJECT — cannot compare EntityId and i32
const p: PlayerSlot = 9
print(a == p)                    // REJECT — cannot compare EntityId and PlayerSlot
```

Brand preservation is not code: arithmetic already ends in `return lt`
(`typecheck.vl:17972`), so the left operand's branded type IS the result. The
change is the REJECT for a mixed pair, which `sameNumeric` cannot see (it
compares `primName`).

Alternatives: **no arithmetic at all** (Haskell `newtype`, Rust tuple struct) is
safer but wrong for the customer — WC3 ids do arithmetic, and forcing
`((a as i32) + 1) as EntityId` on every generation-tag manipulation would push
kernel code back to raw `i32` and delete the feature's value. **Full
degradation to the base** (TS branded types: `a + 1` is `number`) is the other
end and launders the brand.

### 2.5 What sees THROUGH the brand, deliberately

`print`, `toString`, and the ordering operators over a same-brand pair all work,
because the brand is not a capability — a branded
`i32` is a `TyPrim i32` with a label and every structural question about it
answers the way `i32` answers. Only the *assignment* and *mixing* questions
consult the brand.

---

## 3. Zero cost: erasure is INHERITED, not implemented

**No emitter file changes. Not one.**

The mechanism is the alias-transparency pass the compiler already runs. Canon
(`canonEmitTypeNames`, `typecheck.vl:8498`) is the last thing that touches the
AST before `emitProgram`, and its FIRST arm
(`canonEmitNameAt`, `typecheck.vl:8034`) rewrites a one-member alias annotation
to its member's render via `singleMemberAliasTyIx`. So every `EntityId`
annotation in the program is already `i32` by the time the emitter reads it, and
a struct newtype is an ordinary declared struct with an ordinary shape key.

The brand lives on an **arena index**; canon rewrites **name strings**. The two
vocabularies never meet.

This inverts the risk that was anticipated for this feature. The prediction was
"a newtype name must survive canon end-to-end or the emitter forks". For an
*erased* newtype the obligation is the opposite: the name must **not** survive
canon, and the transparency arm that would have been the hazard is the
implementation. What must be preserved is that the checker's
`declaredTyOfName` (5492) and the emitter's `singleMemberAliasTyIx` (7725) keep
answering about the same member — they now differ only by a brand, which is
invisible to every structural question either side asks.

### 3.0 The erasure is exactly as complete as the transparency arm's COVERAGE

Inheriting the erasure means inheriting its *limits*, and that is the one thing
this section has to say out loud, because the failure is silent in both
directions.

`singleAliasMemberTyIx` dispatches on the MEMBER's arena variant, and a member
kind it has no arm for is answered **opaque** — the same answer a genuinely
opaque alias gets. For a newtype that answer is not conservative, it is wrong:
the declared name then survives canon, `collectU` mints it a one-variant union
ROW, `isUName` claims every annotated slot for the shared `{tag, anyref}` BOX,
and every READ still classifies from the arena and lowers the base's own rep.
The two halves disagree with `vl check` rc 0 — `call __print_i32__` on a
`global.get` of a `(ref $box)` for a litunion base — at every position and for
every use.

So a `new` over a base whose kind the arm does not claim is not a newtype that
costs a little; it is a program that does not compile to valid wasm. The arm's
claimed kinds are therefore the real support matrix for `new`, and each is
claimed under the condition that the member's EMIT RENDER substitutes for the
alias name faithfully: unconditionally for a primitive, a function type and a
declared union; under `arrSpineIsScalar` for an array; under
`unionAliasMembersFaithful` for an inline union; under `nulAliasMemberFaithful`
for a nullable; under `isPlainAliasRef` for an object.

The standing check when a new base kind becomes spellable is therefore ONE
question in two directions: does the arm claim it, and does
`transparentMemberEmitName` spell it the way canon spells the base written
directly? Byte-identity of the two programs is the cheapest way to ask — the
branded, the aliased and the bare spellings of one type must build one module.

**The one base kind the arm does NOT claim, and cannot as written:
`type T = X | null` UN-parenthesized.** The parens decide the arena shape: a
`type T = (X | null)` body is ONE variant, so it interns as a one-member wrapper
over a `TyNullable` and the nullable arm claims it. Without them the parser
splits on the top-level `|` and the declaration is a TWO-variant `UnionDecl`,
which no arm here can reach — `singleAliasMemberTyIx` returns a member INDEX and
there is no `TyNullable` index for it to return. Closing it is a NORMALIZATION
change (a two-variant `UnionDecl` whose second variant is `null` should intern
as its inner's nullable, the way the inline annotation already does), with a
blast radius over every nullable alias in the tree, so it is not this arm's
extension.

Its population, measured on a 4-inner × 3-position × {`new`, `alias`, `direct`}
grid (36 cells) graded on the RUN VALUE: **all 12 `direct` cells correct, and all
24 alias-spelled cells wrong** — 12 check-clean invalid wasm (a litunion or
`string` inner) and 12 loud checker rejects (`print of a union value (T1)` for an
`i32` inner, `field 'n' is not on every member of T1` for a struct inner).

**Six of those 24 changed CLASS when the `null`-operand brand exemption landed,
from a loud checker reject to check-clean invalid wasm, and that is a mask
lifting rather than a defect appearing**: the `cannot compare T1 and null`
message was firing before the value was ever built, and the un-branded `alias`
twin of every one of those six cells is already check-clean invalid wasm without
it. The alternative — restricting the exemption to a `TyNullable` so the message
keeps firing — was considered and rejected: it would tie a checker predicate to
an emitter gap, and `tyAdmitsNull` is the question the exemption actually means
to ask.

### 3.1 Where the brand lives

The arena is deliberately structural — `typecheck.vl:1475`: *"The arena stays
purely STRUCTURAL (`TyObj` has no name); nominal-ness is checker metadata, not a
Ty."* Nominal facts are arena-index sidecars: `cStructTyIxs`/`cStructNames`
(1476), `cUnionTyIxs`/`cUnionNames` (1485), and #1274's
`gaAppTyIxs`/`gaAppHeads` (1507). The newtype follows that shape exactly:

```
let nwDeclNames: string[] = []   // names DECLARED `new`   (a declaration fact)
let nwTyIxs: i32[] = []          // branded arena index    (the sidecar KEY)
let nwNames: string[] = []       // the brand that index carries
let nwBaseTyIxs: i32[] = []      // the un-branded index it stands for
```

`nomNameOfTy(ix)` is the reader; `""` means unbranded. All four reset with the
other sidecars at `checkProgramNode`.

**One minting rule, both body kinds.** `declaredTyOfName` hands whatever it was
about to return through `nwBrand`, which is the identity for every name not
declared `new` and otherwise returns a branded index over the SAME `Ty` payload
(`addTy(T.tys[base])` — a second index, not a deep copy). Interned once per
(name, base) pair, so `assignable`'s `src == dst` fast path still fires and
`resolveAnnot`'s name-keyed memo stays stable.

The second index sharing the payload is what makes the pass ordering work: a
`TyObj` placeholder minted in pass 0a and FILLED in pass 0b pushes into the very
field arrays the brand shares, so a forward reference through the newtype name
sees the finished shape without any re-minting.

`cUserTypes[name]` is left pointing at the UN-branded index in both cases — for
a scalar that is the `TyUnion` canon's transparency arm must keep claiming, and
for a struct it is the index `sNames` / the shape key / `emit_rep.sTyIxOfName`
already resolve through. That is the whole checker/emitter split in one line: the
checker reads `declaredTyOfName` and gets the brand, the emitter reads
`cUserTypes` and gets the shape. `nwBrand` mirrors the nominal sidecar rows
(`cStructTyIxs` / `cUnionTyIxs`) onto the branded index so `structNameOfTy` and
`unionAliasDeclNameOfTy` answer about the brand exactly as they answer about its
base — without that, a declared struct reached through its newtype name would
lose its declared name in the renderers.

### 3.2 What "zero cost" means at the wasm level

For a **scalar** newtype there is no heap type and no wrapper: the emitted module
is byte-identical to the same program with `EntityId` spelled `i32`. Proven per
cell with `cmp`, §7.1.

For a **struct** newtype the emitted module is byte-identical to the same program
with `new` deleted from the declaration. Two DIFFERENT struct newtypes of the
same shape still share one wasm heap type through the existing structural slot
dedup (`sTwin`, `DECISIONS.md` "structural slot dedup") — nominal identity is a
checker fact and does not reach the type section.

**This contradicts a forward-compat note and the contradiction is deliberate.**
`DECISIONS.md:142` and `emit_rep.vl:934` both anticipated that *"a future
nominal/opaque type opts OUT of dedup by injecting its nominal identity into
`repCanonKey`, giving it a unique key and a private heap type"*. That seam is
still there and still works, but taking it would make a struct newtype cost a
wasm type per declaration and would break the byte-identity proof that IS the
zero-cost claim. It is the right seam for a future OPAQUE type that needs
runtime identity (an `is` test, a `ref.eq`); a newtype needs neither. The note
should be read as "the seam exists if a later feature wants it", not as this
feature's plan.

---

## 4. Module ABI

An exported function taking `EntityId` **exports as its base scalar.**

```vl
export function spawn(id: EntityId): EntityId { return id }
```

Read off the emitted bytes, not asserted:

```wat
(type (;2;) (func (param i32) (result i32)))
(export "spawn" (func 0))
```

Zero-cost means invisible at the boundary, and it falls out of §3: canon
rewrote the annotation to `i32` before the emitter built the functype, so there
is no code path where the brand could reach the export section. A host, another
wasm module, or a future separately-compiled VL module sees `i32` and nothing
else. Within a single compilation the brand is enforced across the module merge
because the merge renames declarations and annotations by NAME
(`driver.vl:2746/2766`) and the marker rides on the node it renames.

The consequence to state plainly: **the guarantee is intra-program.** A newtype
is a compile-time discipline, not an ABI-level one. Nothing stops a host from
passing any `i32`.

---

## 5. What is NOT in this phase

- **`is` narrowing on a newtype** (`x is EntityId`). A newtype has no runtime
  tag by construction, so the test is not answerable. Rejected at the source of
  the question rather than silently answering `true`.
- **Newtype of a generic application** (`type Box2 = new Box<i32>`) and generic
  newtypes (`type Handle<T> = new i32`). The generic-alias registry is a
  separate table from `cUserTypes` and the application is memo-keyed by a
  synthesized name; branding it is a second design. A generic newtype over a
  SCALAR is further out than that: the registry accepts only a record body, so
  it is a declaration form that does not exist rather than a brand that is
  dropped (§9's table). A generic container that needs a brand carries a
  CONCRETE newtype in a field instead — `flat-records-design.md` §11.3.
- **Opting a newtype OUT of struct dedup** for runtime identity — §3.2.
- **A newtype over a function type or an array type.** Both are one-member
  aliases the checker resolves transparently, so the brand mechanism reaches
  them; they are simply not measured here and not claimed.

---

## 6. What it cost, in code

| file | what changed |
|---|---|
| `compiler/parser.vl` | the contextual `new` peek in `parseTypeDecl`, passed to the two decl constructors |
| `compiler/ast.vl` | `tdNew` / `udNew` on the two existing decl nodes |
| `compiler/typecheck.vl` | the sidecar, five helpers, and **six** consultation points |
| **every `compiler/emit_*.vl`, `wasmEmit.vl`** | **nothing** |

The six consultation points, and why each is where it is:

| site | rule |
|---|---|
| `assignableGo` | the brand test — ONE line, placed after the err/var/never/nullable/union/literal/negation arms so it compares at the level the brand sits on. This is the whole distinctness guarantee: `assignable` is the chokepoint every position goes through, so no position can be taught half the rule. |
| `assignableExpr` | the literal-adoption escape (§2.3). |
| map `.set` (key and value) | the one binding position checked with the bare structural `assignable` rather than `assignableExpr`; without it a map slot would be the single position a literal could not reach. Gated on the destination reaching a brand, so nothing else about `.set` moves. |
| `checkBinExprNode` | the mixed-brand reject. Cannot be left to the structural rules — `sameNumeric` compares `primName`, and the ordering operators never consult `assignable` at all. |
| `+` string concat | a `new string` joins with a same-brand value or a literal and keeps the brand. Without it a `new string` would be the one newtype whose values could not be combined, since `as` is numeric-only. |
| `tyToStr` / `tyEqGo` | render and compare by the name. The emit renderers (`tyToEmitName`, `canonEmitName`) deliberately do NOT get this arm — their output is the emitter's vocabulary. |

**Inert by construction on a program with no `new`.** The sidecar is empty, so
`nomNameOfTy` answers `""` without doing any work and nothing else in the checker
can observe the rules. That is the claim the corpus A/B tests, below.

---

## 7. Measurements

### 7.1 The grid — 119 cells

`{i32, i64, f32, f64, string, struct}` × `{let, global, param, return, struct
field, array element, map value, nullable, arithmetic, cast round-trip}` ×
`{same-brand OK, base→newtype REJECT, newtype→base REJECT, sibling→sibling
REJECT}`. Every cell exists twice — once spelled with `new` and once with `new`
deleted — and the second is the **inverted control**.

| | count | result |
|---|---|---|
| REJECT cells | **72 / 72** | reject with `new`, and the inverted control **checks clean** — so every reject is attributable to the newtype and to nothing else in the program |
| positive cells, checker | **47 / 47** | check clean and run correctly |
| positive cells, ERASURE (`cmp` vs the same program with `new` deleted) | **46 / 46** comparable | **byte-identical** |

The erasure column is 46, not 47, and the missing cell is the honest one to state:
`{[string]: f32}` with a float-literal `.set` **builds and runs with `new` and
does not without it** (`type Id = f32` still reports `set: expected f32, got
f64`). That f32 gap is pre-existing — reproduced on `d0a13651` with no newtype in
the program — and the branded slot picks up `assignableExpr`'s float-literal arm
on the way past the `nomSlotAccepts` retry. It is a widening, in one cell, in the
direction of MORE working code, with no soundness consequence. It was left rather
than special-cased around, because the special case would have no principle
behind it.

REJECT coverage, by flow, per base type:

| flow | i32 | i64 | f32 | f64 | string | struct |
|---|---|---|---|---|---|---|
| base value → newtype (let / arg / field / element / map value) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| newtype → base (let / arg / return) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| sibling → sibling (let / arg / field / element) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| mixed-brand `+` / `==` / `<` | ✔ | ✔ | ✔ | ✔ | n/a | n/a |

### 7.2 Zero cost

Two different twins, and they answer different questions:

- **vs the same program with `new` deleted** (a plain alias): **byte-identical,
  46/46.** This is the erasure proof — the marker reaches no byte of codegen.
- **vs the same program with the alias removed entirely** (raw `i32` everywhere):
  8 cells identical, 38 differ by exactly **10 bytes**. Those 10 bytes are a
  **pre-existing alias tax**, not the newtype's: `type Id = i32; const a: Id = 1`
  emits 165 bytes and the alias-free program 155 **on master (`d0a13651`) as
  well** — a one-member `type N = …` declaration registers in `unNames`, which
  flips `uDeclared` and emits two never-used union-box heap types. Measured both
  ways with the same command. `-O3 --closed-world` removes them.

### 7.3 The views acceptance cell

Three legs, all built with the SAME compiler so the std source is the only
variable (`git show HEAD:std/*.vl` for the pre-migration side):

| leg | result |
|---|---|
| the confusion cell | `vl check` rc **1** with `new`, rc **0** with `new` deleted from both declarations |
| erasure | **8 / 8** correct view programs byte-identical against the same std with `new` deleted |
| size vs the `f32base`/`i32base` std | **−12 bytes** on every one of the 8, run output unchanged |

The size result is the interesting one and it is the opposite of a cost. The
field-name workaround made the two views two different SHAPES, needing two wasm
heap types. `base`/`base` makes them one shape — the structural slot dedup
collapses them (`sTwin`) — while `new` keeps them two TYPES. **The safety came
back and a heap type went away.**

The diagnostic improved with it:
`no field 'getF32' on {i32base: i32, length: i32}` → `no field 'getF32' on I32View`.

### 7.4 No regression

**Corpus six-channel A/B**, `d0a13651` vs this branch, over `tests/cases` + `std`
+ `scripts`, **1,625 files**:

| channel | result |
|---|---|
| 1 CHECKRC | 1,602 same / 23 `(1/0)` |
| 2 CHECKMSG | 1,598 same / 27 |
| 3 BUILDRC | 1,602 same / 23 `(1/0)` |
| 4 BUILDMSG | 1,598 same / 27 |
| **5 BYTES** | **1,625 same** |
| 6 RUN | 1,611 same / 14 `(1/0)` |

**Field 5 all-same is the swallow**: new syntax must leave old programs untouched,
and it does. All 27 moving rows are accounted for exactly — the 6 new/changed
fixtures, `std/buffer.vl` itself, and the 20 corpus files that IMPORT `std:buffer`
(they reject on the `d0a13651` side because that compiler cannot parse `new`).
**Zero pre-existing files moved on any channel.**

**Reach, stated before the channels are read.** The `= new ` form appears in
**7** of the 1,625 corpus/std files, and all seven are added or changed by this
work (6 fixtures + `std/buffer.vl`). So the corpus channel is an INERTNESS
instrument for this feature, not a coverage one — its job is field 5, and the
purpose-built 119-cell grid is the instrument that actually exercises the rules.
Saying which is which matters: a green corpus here would otherwise read as
coverage it does not have.

**Fuzz A/B: IDENTICAL** — 7 seeds x 3 depths x 2,400 cases = **50,400 programs
per side**, 625 finding-lines each, `diff` clean.

And the reach statement matters more than the verdict: `scripts/fuzzgen.vl`
contains the token `new` exactly once, **in a comment**, so the generated
population contains **zero** newtype declarations by construction. The fuzz
channel is therefore a NO-REGRESSION instrument for this change (does the
machinery perturb programs that contain no newtype), never an agreement
instrument for the feature. Its verdict has to be read that way or a green reads
as coverage it does not have.

**Gate** (all rc read bare): fresh published seed → `refresh-compiler.sh
--prove-fixpoint` 0 (fixpoint at 2 compiles, as expected for a compiler that
changed) · `native-fixpoint.sh` 0 · `lint-self.sh` 0 (includes `vl fmt --check`
over `compiler/`, `std/`, `scripts/`) · `rep-fuzz-check.sh` 0 · full suite
**3411 passed / 0 failed / 8 ignored** (master `d0a13651`: 3399 / 0 / 8) with the
ignored NAME SET diffed against master's and identical, both sides non-empty.

Compiler size: 1,054,554 → 1,058,013 bytes (**+3,459**).

One method note worth keeping, because it cost a run: `scripts/fuzz-vl.sh` reads
`build/vl-compiler.wasm`, so a fuzz A/B **swaps that file while it runs**. A
`refresh-compiler.sh` issued concurrently silently contaminates the side that is
mid-flight — half the batch is measured against the other compiler, and the
result looks like a plausible small diff rather than a broken harness. Run the
fuzz leg alone.

---

## 8. Rough edges found, and where each one lives

Each of these was measured, not predicted, and each is stated with whether it is
this feature's or pre-existing:

| shape | verdict |
|---|---|
| `type Id = new i32` used as a MAP KEY (`{[Id]: i32}`) | `unknown type '{[Id]:i32}'`. **Pre-existing** — a plain `type Id = i32` alias gets the identical error on `d0a13651`. The map-key name grammar admits only the literal spellings; nothing to do with brands. |
| `{[string]: f32}` + a float-literal `.set` | `set: expected f32, got f64`. **Pre-existing**, reproduced on `d0a13651` with no newtype present. The BRANDED spelling accidentally works (§7.1). |
| a struct-valued map in a composite program (`{[string]: V}` beside a `V[]` and a `V \| null`) | `emitProgram: unsupported map value type`. **Pre-existing** — identical on `d0a13651` with `new` deleted. The newtype spelling matches the plain spelling exactly. |
| `type Handle<T> = new i32` | the marker is accepted and ignored — a generic alias registers in a separate table that this phase does not brand. Filed, §5. **The "silent" half is wrong**: only the DECLARATION is silent. Every APPLICATION is `unknown type 'Handle<i32>'`, in an annotation and in an `as` cast alike, so there is no way to reach the un-branded type at all. The rung below explains it — the generic-alias registry accepts only a **record** body, and plain `type Al<T> = i32` is equally `unknown type 'Al<i32>'`. Re-measured against the published seed while shipping `flat-records-design.md` §11.3, which needed a brand and did not need this one. |
| `x is EntityId` | works when the union's arms are distinguishable by REP (`EntityId \| string`); a newtype has no runtime tag, so it cannot discriminate against its own base. §5. |
| `Buf` itself (`{base, length}`) | still a plain struct, so still interchangeable with a same-shaped user struct. Pre-existing and unchanged — but the fix is now a one-word edit. |
