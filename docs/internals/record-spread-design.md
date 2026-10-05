# Record spread — `{ ...p, x: v }`

> Status: **DESIGN**, not built. Owner ruling 2026-10-04 (B) on sunpa's SP-032. Probes were run
> on the master seed of 2026-10-04 (origin/master `221c7954f`); each one is quoted where it is used.

`{ ...p, x: v }` builds a NEW record from `p`. The ruling fixes four rules:

1. an override that fits `p`'s field type keeps `p`'s TYPE (literals adapt);
2. an implicit value that does not fit is a CHECK ERROR, as it is for a field assignment;
3. an EXPLICIT conversion (`x: n as i64`) is allowed and gives a NEW record type that differs only there;
4. NEW fields may be ADDED (`{ ...p, z: 1.0 }`), giving a new, wider type.

It allocates, every time. It does not reset a pooled record in place, which is what SP-032
asked for (`~/sunpa/docs/vl-issues.md` §SP-032). The owner's note says spread is "not a pool tool".
An in-place whole-record store is a separate question and this file does not answer it.

## 0. Assumptions a critic should attack first

- **A1.** VL plain records are STRUCTURAL. `type P = {x: i32}` and `type Q = {x: i32}` are
  interchangeable: `const q: Q = p` runs and hints "`q` is inferred as `P`". They also have width
  subtyping: a `{x, z}` record passed to a `P` parameter runs and prints `4`. Only `new { … }`
  records are nominal: `const f: F = g` gives "cannot assign G to 'f' of type F". So "keeps p's
  type" changes what a plain record DISPLAYS, and changes identity only for a newtype.
- **A2.** "Fits" means exactly what a field STORE `p.x = v` accepts today. Measured: `i32 → f64`
  runs; `i32 → i64` runs; an `i32 | f64` join into `f64` runs; `1.5 → i32`, `i64 → i32`,
  `i64 → f64`, `f64 → f32` and `i64 | f64 → f64` are all refused as `cannot assign X to Y`.
  A literal adapts (`f.v = 2` into `f64`, `f.v = 2.25` into `f32`).
- **A3.** `as` converts NUMBERS only: `s as string` and `p as P` both give "`as` supports numeric
  conversions only". So rule 3 can change a field's type only from one number type to another.
- **A4.** A spread is a record LITERAL for every rule that asks about freshness. That covers
  covariance, D3339 adoption, the excess-field check and the `{}` completion of D2223.
  Q3 asks the owner to confirm this.
- **A5.** It is a SHALLOW copy (§3.6).

## 1. Survey

| language | form | result type | may change a field's type? | may add a field? | other rules |
| --- | --- | --- | --- | --- | --- |
| **TS/JS** | `{ ...p, x: v }` | an anonymous spread type: later properties win | yes, freely and silently (`{ ...p, x: "s" }`) | yes | spreading a union gives a union of results; a generic `{ ...t, x: 1 }` is typed as an intersection, which is unsound when `T` already has `x`; at run time JS copies own enumerable properties and CALLS getters |
| **Rust** | `S { x: v, ..p }` | exactly `S`, and `p` must be an `S` | no | no | the base must come last; fields that are not `Copy` are MOVED out of `p` |
| **Kotlin** | `p.copy(x = v)` | the data class | no; the parameters are typed | no | an ordinary generated method with named arguments; shallow |
| **C#** | `p with { X = v }` | the RUNTIME type of `p`, through a virtual clone | no | no | on records, structs and anonymous types; init-only members; shallow |
| **Elixir** | `%{p \| x: v}` | a map with the same keys | yes (dynamic typing) | **no**: an unknown key raises; `%S{p \| …}` checks a struct's keys at compile time | adding a key needs `Map.put` |
| **OCaml** | `{ p with x = v }` | the same nominal record type | only through the record's TYPE PARAMETERS (`{ b with v = "s" }` on `'a box`) | no | warning 23, "useless with clause", fires when every field is given |

VL's rules 1 and 2 are the Rust, Kotlin, C# and OCaml position: the type is fixed and a mismatch
is an error. Rule 3 resembles OCaml's parameter change, but VL requires it to be explicit.
Rule 4 is TypeScript's. No surveyed language combines a fixed type for overrides with open
addition, so §6 has a lint to cover the hazard that combination creates.

## 2. Syntax and parsing

**Today.** In expression position the parser commits to an object literal, so `const q = { ...p, x: 5 }`
fails with `expected a field name but found \`...\`` (`parseObjLit`, `compiler/parser.vl:1740`).
In statement position, `looksLikeObject` (`parser.vl:4498`) sees an `ELLIPSIS` first and decides
the `{` opens a block. So `function f(p: P) { { ...p } }` fails with "`...` may only appear before
a call argument or a list element" (`parser.vl:1504`).

**Elsewhere in VL.** The `ELLIPSIS` token and the `Spread` node (`ast.vl:216`) already exist for
call arguments and list elements (`variadics-design.md`). `[...xs, 3]` runs and prints `3`.
A `...xs` used as a statement or binding value is a parse error today (`let s = ...xs`).

**Proposed grammar.** `ObjLit := "{" ( "..." expr ("," field)* ","? | field ("," field)* ","? )? "}"`.
The spread is the FIRST item and appears once (Q1, Q2). It reuses the existing `Spread` node as the
first entry of `objFields`. Because `Spread` is its own node kind and not a column on `ObjLit`, a
pass that has not learned about it fails loudly; that was the reason for making it a node kind.
The AST comment saying "the parser mints one only in those two positions" becomes three positions.
`looksLikeObject` gains one arm: a `{` whose first non-newline token is `ELLIPSIS` is an object.
This is safe because no statement can start with `...` (shown above).

**Formatter.** `format.vl:1907` already prints a `Spread` as `"..." + expr`.
`objectLiteral` (`format.vl:2778`) iterates `FieldInit`s and needs the same item. Output is
`{ ...p, x: 5 }` on one line and breaks through `wrapList` like any literal. The one-shorthand
`{ id, }` rule (D3475) does not apply, because `{ ...p }` is never a block.

## 3. Typing

Let `p: P`, where `P` is a record type with fields `f₁…fₙ`. For `{ ...p, k₁: e₁, …, kₘ: eₘ }`:

- **Rule 1.** For each `kᵢ` that is a field of `P`, check `eᵢ` against `P.kᵢ` exactly as a store
  `p.kᵢ = eᵢ` would be checked. Literals adapt, so `{ ...f, v: 2 }` into `v: f64` stores `2.0`.
  If every override fits and no `kᵢ` is new, the result type is `P`.
- **Rule 2.** If `eᵢ` does not fit and is not an explicit conversion, report the store's own error
  and name the field: `` `{ ...p, x: … }` keeps P: field `x` is i32, and f64 does not fit; convert
  it explicitly (`x: v as f64`) to make a record whose `x` is f64 ``.
- **Rule 3.** If `eᵢ` is an explicit conversion (Q4 defines "explicit") whose type differs from
  `P.kᵢ`, the result's field `kᵢ` takes the type of `eᵢ`. Every other field keeps `P`'s type.
  The trio still applies inside the conversion: `x: d as i64` propagates null out of the enclosing
  function, and `x: d as? i64` makes the field `i64 | null`.
- **Rule 4.** Each `kᵢ` that is not a field of `P` is added with the type of `eᵢ`.
  `{ ...p, z: 1.0 }` has the type `{x: i32, y: i32, z: f64}`.

### 3.1 Naming the new type

Rule 1 gives `P`, and hover and errors print `P`. Today a hand-written copy `{ x: v, y: p.y }`
prints as `{x: i32, y: i32}` (measured), so this is a small improvement. Rules 3 and 4 give an
anonymous structural type, printed the way the checker already prints one,
`{x: i64, y: i32}`: `cannot assign {x: i32, y: f64} to 's' of type string` is today's wording
for an anonymous record. A `P with {x: i64}` spelling was considered and rejected. It is not a
type VL can write, so a user could not copy it into an annotation.

### 3.2 Fresh record width (D3339), covariance and literal adaptation

- **Covariance.** A spread is fresh: nothing else holds the new record. Under A4, a spread
  delivered to a destination with a wider field is the "fresh" case of the covariance ruling, not
  the refused existing-record case. Today's refusal already gives the fix: "copy it with a literal
  `{ f: i.f }`". If Q3 is decided as (A), that message can say `{ ...i }`.
- **D3339.** An OVERRIDE is typed against `P` (rule 1), so a later delivery does not re-type it.
  An ADDED field holding a literal is the open case, which is Q5.
- **Literal `let`s (B′).** An override is a FIELD delivery, so `let n = 0; { ...p, x: n }` with
  `x: i64` re-types `n` to `i64`, within its kind, as the ruling already does for a typed field.
- **Numeric join.** A joined value is checked by rule 1 and nothing more. An `i32 | f64` value
  into an `f64` field fits. An `i64 | f64` value is refused with an `as` fix: today's store says
  `cannot assign i64 | f64 to f64`.
- **Excess fields at an annotated destination.** `const p: P = { x: 1, z: 2 }` is refused today:
  "this object literal sets `z`, which P does not declare … the extra field would be dropped".
  Under A4, `const p: P = { ...q, z: 1 }` gets the same refusal. This is the only place rule 4's
  typo hazard is caught without a lint. For an unannotated `const w = { x: 1, z: 2 }` delivered
  later to `P`, width subtyping lets it run (measured), and the same holds for a spread.
- **Duplicates.** `{ ...p, x: 1, x: 2 }` gets today's "key `x` is given twice".

### 3.3 Nominal versus structural

For a plain record, "has type `P`" is a statement about display (A1). For a newtype record
`type R = new {base: i32, length: i32}`, rule 1 keeps the BRAND, so `{ ...r, length: 0 }` is an
`R`. Rules 3 and 4 give an unbranded anonymous record. An unbranded record cannot flow into a
brand (A1), so dropping the brand is safe. The open case is the reverse direction: whether a
spread ADOPTS a destination's brand the way a syntactic literal does (`newtype-design.md` §2.3).
That is Q3b. Getters are nominal-only (`DECISIONS.md` §Getters), so they survive rule 1 and are
lost under rules 3 and 4. A spread copies FIELDS and never calls a getter, unlike JS.

### 3.4 Generic records

In a generic body, `t.x` already infers a structural constraint: `f(3)` against `t.x + 1`
reports `argument 1: expected {x: _}, got i32`. Monomorphization checks each instance against
a concrete record, so `function f<T>(t: T) { { ...t, x: 1 } }` can be checked per instance.
Rule 1 applies when the instance has `x`, and rule 4 when it does not. A non-record `T` is
refused at the call. The result type then depends on the instance, which is Q8.

### 3.5 Unions and nullables

`p: P | null` has no fields: `member access '.x' on non-object P | null`. Spreading it is refused
with "narrow first". A union of records is less clear-cut. `p.x` on `A | B` runs when both
members declare `x` (measured, prints `1`), so a spread could dispatch per member. That is Q7.

### 3.6 Shallow, said plainly

```vl
type Inner = { n: i32 }
type Outer = { a: Inner, k: i32 }
const o: Outer = { a: { n: 1 }, k: 2 }
const o2 = { ...o, k: 3 }
o2.a.n = 99
print(o.a.n)   // 99 — o and o2 share one Inner
```

The hand-written copy `{ a: o.a, k: 3 }` prints `99` today (measured). A spread copies field
VALUES, and a record-, list- or map-valued field is a reference, so it shares. A deep copy is
written by spreading again: `{ ...o, a: { ...o.a } }`. The static type decides which fields are
copied. A `{x, z}` value held as a `P` is copied as a `P`, and `z` is dropped. C# keeps the runtime
type and VL does not.

## 4. Evaluation order

`p` is evaluated FIRST and ONCE into a local. Its fields are read as if at that moment, and then
the overrides are evaluated left to right in source order. This is the source-order rule that
record literals already follow (D1510): `{ y: t("y"), x: t("x") }` prints `y` then `x`, measured.
If an override writes `p` (`{ ...p, x: bump(p) }`, where `bump` sets `p.y`), the copied `y` is the
value from BEFORE the write. This is JavaScript's behaviour, and Q1 putting the spread first makes
it the obvious reading. Codegen may read `p`'s fields late when no override can write a record of
`p`'s shape. That is the same condition under which the D1510 stash is skipped today.

## 5. Representation and cost

The lowering is one `struct.new` of the result type. Its operands go in layout order, sorted by
field name (`emitObj`, `wasmEmit.vl:1706`). Each operand is an override value, stashed to a local
when the order is observable, or a `struct.get` from `p`'s local. When rule 1 applies, the heap
type is `P`'s own. Rules 3 and 4 add an anonymous struct type (the `#anon` registry rows).
`flat` is erased before emit (`flat-records-design.md`), so a flat `P` spreads like any other.
Rules 3 and 4 give a record that is not flat.

**The #3372 multi-value step applies.** Spread does not parse yet, so the test used its
desugaring, `function moved(p: V, d: f64): V { const s = p; …; { x: s.x + k, y: s.y, z: s.z } }`,
with three callers that read the result's fields. At `-O`, `VL_MV_EXPLAIN=1` printed `type 0
{f64, f64, f64} (returned by func 5): candidate` and `func 5 -> type 0: result twin; 3 call
site(s) read it as fields, 0 keep the struct`. `wasm-dis` shows `(result f64 f64 f64)` on the
twin and `struct.new` falls from 5 to 2; the 2 that remain are the global and the list's
`src.push` element. Two conditions are inherited: the shape has 1–8 numeric fields, and no
`struct.set` reaches it anywhere. A spread adds no `struct.set`, so it never disqualifies a shape.
`p` itself is a field-only parameter, because a spread reads `p` only through `struct.get`.

## 6. Editor, lint and `--fix`

- **Hover.** Hovering on the literal shows the result type (`P`, or the §3.1 spelling).
  Hovering on `...p` shows `p`'s type. Go-to-definition on an override key goes to `P`'s field.
- **Completion.** No completion exists for field names inside an object literal today. The
  server handles `.` (member) and scope only (`lsp/src/server.ts:1357`). After `...p,` the editor
  should offer `P`'s fields that are not yet overridden, by reusing `memberCompletionsAt` on `p`.
  This is new work, and it is the first literal-key completion in the editor.
- **Lint `record-spread-candidate` (hint, with `--fix`).** It fires on a literal that copies at
  least two fields as `f: b.f` from one base `b`, when the literal's type EQUALS `b`'s type.
  Without that type check, a literal might copy only a subset into a narrower type. The fix
  requires `b` to be a local or a parameter path, and that no override writes a record of `b`'s
  shape (§4). A heuristic count, covering one-line literals without nested braces (a lower bound),
  found compiler 18 (`typecheck.vl:16763` copies a `LetDecl` with a new annotation), std 2,
  scripts 1, tests 1, and sunpa `src/` 18. Of sunpa's, 11 have at most two fields that are not
  copied (`actor.vl:845`). `tests/cases/types/newtype-read-write-brands.vl:16`, the deliberate brand
  forge, must NOT be rewritten. That depends on the answer to Q3b.
- **Lint `useless-spread` (OCaml's warning 23).** It fires when every field of `P` is overridden,
  or when an override is `x: p.x`.
- **Lint `spread-added-field-near-miss`.** Under rule 4, `{ ...p, colour: c }` with `color` on
  `P` silently ADDS a field. Q11 asks whether to warn when an added name is within edit distance
  2 of one of `P`'s fields.

## 7. Questions for the owner, in dependency order

Each question asks for one decision. The recommendation is marked **(rec)**.

**Q1. Where may `...p` appear?** (A) **only first (rec)**: `{ ...p, x: 1 }`. (B) anywhere, with
later items winning: `{ x: 1, ...p }` makes `p.x` overwrite the explicit `1`. (A) is the
"defaults, then overrides" reading that every surveyed language with a typed form keeps fixed (Rust fixes the
base's position too, at the end). It makes §4's order the written order. It also
leaves (B) to add later if ever wanted.

**Q2. `{ ...a, ...b }`.** (A) **only when `a` and `b` have the same type, later wins (rec, your
default)**: `{ ...base, ...patch }`. (B) refuse it: `{ ...base, x: patch.x, y: patch.y }`.
(C) TS-style merging of different types: `{ ...pos, ...vel }` gives `{x, y, vx, vy}`. Under Q1(A),
(A) relaxes "first" to "spreads first". (C) needs a rule for each field the two types share and
type differently, and the survey shows no typed language other than TS accepts that.

**Q3. A spread delivered to an annotated destination of a DIFFERENT type.**
`type I = {f: i32}; type J = {f: i32 | null}; const j: J = { ...i }`.
(A) **the spread is a literal (rec)**: it is built at `J` when every copied field and override
fits `J`, and otherwise it follows rules 1–4 at `I` and is then delivered. (B) it is typed `I`
first, so today's "only a fresh record widens" refuses it, even though the value is fresh.
(A) is what the covariance message already recommends, spelled shorter. It also lets a
destination with extra nullable fields complete them with `null` (D2223).

**Q3b. Brands (depends on Q3).** `type ReadHp = new {…}; type WriteHp = new {…}`. Should
`const w: WriteHp = { ...r }` (with `r: ReadHp`) run? (A) **no, refuse it (rec)**: a spread
carries `p`'s brand and does not adopt another, so `{ base: r.base, length: r.length }` stays
the explicit, greppable forge (`newtype-design.md` §2.3, "a literal has no prior identity").
A spread has a prior identity. (B) yes, as Q3(A) says for plain records.

**Q4. What counts as "explicit" in rule 3?** (A) **syntactic (rec)**: the override's value is,
after parentheses, an `as`, `as?`, `as!` or `as%` node, as in `x: n as i64`. (B) any value whose
type differs from the field's, as long as some conversion produced it, so `x: toI64(n)` would also
qualify. (B) is just rule 2 with the error removed. (A) is greppable and matches "explicit = fine".
By A3, a non-numeric change (`x: null` on an `i32` field) has NO explicit spelling and is an
error; the record is then written out in full. Accept that, or add an ascription form later.

**Q5. Does an ADDED literal field adopt from its deliveries (D3339)?**
`const q = { ...p, z: 1 }; const d: D = q` with `D.z: f64`. (A) **yes, for added fields only
(rec)**: `q.z` is `f64` everywhere, the same as `const q = { z: 1 }` would be. (B) no: `z` is
`i32` and the delivery is refused. Overrides never adopt, because they are fixed by `P` (rule 1).

**Q6. A copied field's value is that of `p` at the spread, before overrides run (§4).** (A) **yes
(rec)**: `{ ...p, x: bump(p) }` copies the `y` from before `bump`. (B) read late, so the copy sees
the write. (A) is JavaScript's semantics, and the write-free case costs nothing.

**Q7. Spreading a union of records.** (A) **refuse it and narrow first (rec, your default)**:
`if s is A { { ...s, x: 1 } }`. (B) dispatch per member, so `{ ...s, x: 1 }` on `A | B` gives
`A | B`, in the way numeric-union arithmetic dispatches. Nullable is refused under both.
(A) can be widened to (B) later without breaking any program.

**Q8. Generic `T`.** (A) **allowed and checked per instance (rec)**:
`function f<T>(t: T) { { ...t, x: 1 } }`, with `f(3)` refused at the call like `t.x` is today.
(B) allowed only when every instance gets rule 1, meaning the result is `T` and nothing is added
or converted. (C) refused. (A) is the gradual-`T` reading. (B) is what would let a declared
`: T` return check in the body.

**Q9. Removing a field.** (A) **no syntax (rec)**: write the literal out. (B) `{ ...p, -z }`.
(C) `omit(p, "z")` in std. None of the surveyed typed languages offers removal. Width subtyping
already lets a wider record go where `P` is expected.

**Q10. `{ ...p }` with no overrides as the copy idiom.** (A) **endorse it (rec)**: it is the
shallow copy, the covariance message names it, and no lint fires. (B) add `copy(p)` to std
instead. (A) needs no new name.

**Q11. Warn on an added field that is a near miss of `P`'s field (§6)?** (A) **yes, as a
`warning` lint (rec)**: `{ ...p, colour: c }`. (B) no. Rule 4 together with width subtyping makes
the typo run silently whenever the destination is unannotated.
