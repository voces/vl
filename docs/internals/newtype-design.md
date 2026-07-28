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

`print`, string interpolation, `toString` and the ordering operators over a
same-brand pair all work, because the brand is not a capability — a branded
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
```

`nomNameOfTy(ix)` is the reader; `""` means unbranded. All three reset with the
other sidecars at `checkProgramNode`.

The branded index is minted differently per body kind, and the difference is the
whole reason struct newtypes cost almost nothing:

- **Scalar / alias body** (a one-member `UnionDecl`): `cUserTypes[name]` must
  stay the `TyUnion` so canon's transparency arm keeps claiming the name. So
  `declaredTyOfName` returns a **branded copy** of the member — `addTy` of the
  same `Ty` payload, which yields a fresh index sharing the node. Interned once
  per newtype name, so `assignable`'s `src == dst` fast path still fires and
  `resolveAnnot`'s name-keyed memo stays stable.
- **Struct body** (a `TypeDecl`): the declaration already owns a unique arena
  index (`mkObjTy` at 12842). Brand THAT index. Nothing else moves —
  `structNameOfTy`, the emitter's `sNames`/shape key and `cStructTyIxs` all keep
  pointing at the same node.

### 3.2 What "zero cost" means at the wasm level

For a **scalar** newtype there is no heap type and no wrapper: the emitted module
is byte-identical to the same program with `EntityId` spelled `i32`. Proven per
cell with `cmp`, §6.

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
emits `(func (param i32) (result i32))`.

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
  synthesized name; branding it is a second design.
- **Opting a newtype OUT of struct dedup** for runtime identity — §3.2.
- **A newtype over a function type or an array type.** Both are one-member
  aliases the checker resolves transparently, so the brand mechanism reaches
  them; they are simply not measured here and not claimed.

---

## 6. Measurements

(Filled in below by the implementation slice — the distinctness grid, the
erasure grid, the views acceptance cell, corpus/fuzz A/B and the gate.)
