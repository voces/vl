# Record spread — `{ ...p, x: v }`

> Status: **DESIGN**, not built. Owner ruling 2026-10-04 (B) on sunpa's SP-032. Probes were run
> on the master seed of 2026-10-04 (origin/master `221c7954f`); each one is quoted where it is used.
> §7 lists the stated defaults. §8 holds the TWO questions for the owner.

`{ ...p, x: v }` builds a NEW record from `p`. The ruling fixes four rules:

1. an override that fits `p`'s field type keeps `p`'s TYPE (literals adapt);
2. an implicit value that does not fit is a CHECK ERROR, as it is for a field assignment;
3. an EXPLICIT conversion (`x: n as i64`) is allowed and gives a NEW record type that differs only there;
4. NEW fields may be ADDED (`{ ...p, z: 1.0 }`), giving a new, wider type.

It allocates, every time. It does not reset a pooled record in place, which is what SP-032
asked for; the owner's note calls spread "not a pool tool". That remainder is filed as D3642
(§5).

## 0. Assumptions a critic should attack first

- **A1.** VL plain records are STRUCTURAL. Measured with `type P = {x: i32}` and
  `type Q = {x: i32}`:
  - `const q: Q = p` runs, and `q` keeps its annotation: a later misuse reports
    `cannot assign Q to 's' of type string`.
  - The same line also draws `HINT: redundant type annotation: q is inferred as P`, so the hint
    treats `P` and `Q` as one type and only the display name changes. Without the annotation the
    misuse says `cannot assign P`.
  - Width subtyping holds: a `{x, z}` record passed to a `P` parameter runs and prints `4`.

  Only `new { … }` records are nominal: `const f: F = g` gives `cannot assign G to 'f' of type F`.
  So "keeps p's type" changes what a plain record DISPLAYS, and changes identity only for a newtype.
- **A2.** "Fits" means exactly what a field STORE `p.x = v` accepts today:
  - Accepted: `i32 → f64`, `i32 → i64`, an `i32 | f64` join into `f64`, and `b[0] as i32` into
    an `f64` field (runs, prints `1.5` after `/ 2`).
  - Refused, each as `cannot assign X to Y`: `1.5 → i32`, `i64 → i32`, `i64 → f64`,
    `f64 → f32`, `i64 | f64 → f64`, and `(n as i64) + 1` into `i32`.
  - A literal adapts: `f.v = 2` into `f64`, and `f.v = 2.25` into `f32`.
- **A3.** `as` converts NUMBERS only. `s as string` and `p as P` both give "`as` supports numeric
  conversions only".
- **A5.** Spread is a SHALLOW copy (§3.6).
- The open assumption, that a spread is a fresh record literal, is owner question (1) in §8,
  not an assumption.

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
addition, so §6 adds a lint for the typo that combination lets through.

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
There is ONE spread, and it comes FIRST (D1, D2).

- It reuses the existing `Spread` node as the first entry of `objFields`. `Spread` is its own node
  kind rather than a column on `ObjLit`, so a pass that has not learned about it fails loudly; that
  was the reason for making it a node kind.
- The AST comment saying "the parser mints one only in those two positions" becomes three positions.
- `looksLikeObject` gains one arm: a `{` whose first non-newline token is `ELLIPSIS` is an object.
  This is safe because no statement can start with `...` (shown above).

**Formatter.** `format.vl:1907` already prints a `Spread` as `"..." + expr`. `objectLiteral`
(`format.vl:2778`) iterates `FieldInit`s and needs the same item. Output is `{ ...p, x: 5 }` on one
line, and it breaks through `wrapList` like any literal. The one-shorthand `{ id, }` rule (D3475)
does not apply, because `{ ...p }` is never a block.

## 3. Typing

Let `p: P`, where `P` is a record type with fields `f₁…fₙ`. For `{ ...p, k₁: e₁, …, kₘ: eₘ }`,
each override is checked **fit first**:

- **Rule 1 (fits).** If `kᵢ` is a field of `P` and `eᵢ` fits `P.kᵢ` as a store `p.kᵢ = eᵢ`
  would, the field keeps `P.kᵢ`. This holds even when `eᵢ` is an explicit conversion:
  `{ ...p, x: b[0] as i32 }` into an `f64` field keeps `P`, because an `i32` fits an `f64` (A2).
  Literals adapt, so `{ ...f, v: 2 }` into `v: f64` stores `2.0`.
- **Rule 2 (does not fit, implicit).** The override is a check error, and the message offers the
  conversion that keeps `P` FIRST:
  `` `{ ...p, x: … }` keeps P, whose field `x` is i32, and f64 does not fit. Convert it to keep P:
  `x: v as i32`; or, to make a record whose `x` is f64, convert explicitly: `x: v as f64` ``.
- **Rule 3 (does not fit, explicit).** Only when `eᵢ` does NOT fit `P.kᵢ` and its type is
  explicit (§8 question 2) does the result's `kᵢ` take `eᵢ`'s type. Every other field keeps `P`'s
  type. The trio still applies inside the conversion: `x: d as i64` propagates null out of the
  enclosing function, and `x: d as? i64` makes the field `i64 | null`.
- **Rule 4 (new field).** Each `kᵢ` that `P` does not declare is added with `eᵢ`'s type.
  `{ ...p, z: 1.0 }` has the type `{x: i32, y: i32, z: f64}`.

If only rule 1 applies, the result is `P`.

### 3.1 Naming the new type

- **Rule 1** gives `P`, and hover and errors print `P`. Today a hand-written copy
  `{ x: v, y: p.y }` prints as `{x: i32, y: i32}` (measured), so this is a small improvement.
- **Rules 3 and 4** give an anonymous structural type, printed the way the checker already prints
  one: `{x: i64, y: i32}`. For example, `cannot assign {x: i32, y: f64} to 's' of type string` is
  today's wording.
- A `P with {x: i64}` spelling was considered and rejected. It is not a type VL can write, so a
  user could not copy it into an annotation.

### 3.2 Interactions

- **Covariance, D3339 and the `{}` completion** all depend on whether a spread is a fresh literal,
  which is §8 question 1.
- **Literal `let`s (B′).** An override is a FIELD delivery, so `let n = 0; { ...p, x: n }` with
  `x: i64` re-types `n` to `i64` within its kind, as the ruling already does for a typed field.
- **Numeric join.** A join is checked by rule 1 like any other value. An `i32 | f64` value into an
  `f64` field fits. An `i64 | f64` value is refused under rule 2.
- **Duplicates.** `{ ...p, x: 1, x: 2 }` gets today's error, "key `x` is given twice".

### 3.3 Nominal versus structural

For a plain record, "has type `P`" is about display (A1). For a newtype record
`type R = new {base: i32, length: i32}`:

- Rule 1 keeps the BRAND, so `{ ...r, length: 0 }` is an `R`.
- Rules 3 and 4 give an unbranded anonymous record, and a **hint** says so:
  `` this spread drops R's brand: the result is {base: i32, length: i64}, not an R ``.
  Dropping the brand is safe, because an unbranded record cannot flow into a brand (A1). The hint
  exists because losing the brand is rarely what was meant.
- Getters are nominal-only (`DECISIONS.md` §Getters), so they survive rule 1 and are lost under
  rules 3 and 4.
- A spread copies FIELDS and never calls a getter, unlike JavaScript.

### 3.4 Generic records

In a generic body, `t.x` already infers a structural constraint: `f(3)` against `t.x + 1`
reports `argument 1: expected {x: _}, got i32`. Spread follows the same model. Each
monomorphized instance is checked against its concrete record (D6), so in
`function f<T>(t: T) { { ...t, x: 1 } }` rule 1 applies when the instance has `x`, and rule 4
when it does not. A declared `: T` return is likewise checked per instance. When an instance's
result is not its `T`, the error names the SPREAD site and the instantiating call.

### 3.5 Unions, nullables, maps

- **Nullable:** `p: P | null` has no fields (`member access '.x' on non-object P | null`), so a
  spread of it is refused with "narrow first".
- **Union of records:** refused the same way (D3), even though `p.x` on `A | B` runs when both
  members declare `x`.
- **Map:** `{ ...m }` with `m` a map is refused, in the words of the existing message,
  `An object literal isn't a map value — construct a map with Map()…` (measured on `const m: Map<string, i32> = { a: 1 }`).
- **Optional fields:** VL has none (`type P = { x?: i32 }` fails with ``expected `:` but found `?` ``).
  A field whose type admits `null` may be omitted from a literal (D2223), but `p` always supplies
  every field, so TypeScript's rules for merging optional properties do not arise.

### 3.6 Shallow, said plainly

```vl
type Inner = { n: i32 }
type Outer = { a: Inner, k: i32 }
const o: Outer = { a: { n: 1 }, k: 2 }
const o2 = { ...o, k: 3 }
o2.a.n = 99
print(o.a.n)   // 99 — o and o2 share one Inner
```

- The hand-written copy `{ a: o.a, k: 3 }` prints `99` today (measured). A spread copies field
  VALUES, and a record, list or map field is a reference, so it is shared.
- A deep copy is written by spreading again: `{ ...o, a: { ...o.a } }`.
- The STATIC type decides which fields are copied: a `{x, z}` value held as a `P` is copied as a
  `P`, and `z` is dropped. C# keeps the runtime type; VL does not.

### 3.7 Rule 3 replaces a union-typed field; it does not join it

Take `type U = { u: i32 | string }`:

- `{ ...p, u: n as i32 }` fits, so it keeps `U` (rule 1).
- `{ ...p, u: n as i64 }` does not fit, so it gives `{u: i64}`: the `string` member is dropped,
  not joined into `i32 | string | i64`.

Rule 3 says the new type "differs only there", and "there" takes the conversion's type. A caller
who wants the join writes the record out in full.

## 4. Evaluation order and the snapshot

`p` is evaluated FIRST and ONCE into a local. Its fields are read as if at that moment, and then
the overrides are evaluated left to right in source order (D5). This is the source-order rule
that record literals already follow (D1510): `{ y: t("y"), x: t("x") }` prints `y` then `x`,
measured. If an override writes `p` (`{ ...p, x: bump(p) }`, where `bump` sets `p.y`), the copied
`y` is the value from BEFORE the write, as in JavaScript.

**The cost of the snapshot.**
- When no override contains a call or a store that can reach a record of `p`'s shape, nothing can
  change `p` mid-literal, so the copied fields are read late, straight into `struct.new`, at no
  extra cost. This is the same condition under which D1510's stash is skipped today.
- When one does, every copied field is read into a local BEFORE the overrides run. That is n
  `struct.get`s moved earlier and n locals, with no allocation. binaryen's coalescing removes most
  of the locals at `-O`.

## 5. Representation, cost and aliasing

The lowering is one `struct.new` of the result type.
- Its operands go in layout order, sorted by field name (`emitObj`, `wasmEmit.vl:1706`). Each
  operand is either an override value (stashed to a local when the order is observable) or a
  `struct.get` from `p`'s local.
- Rule 1 uses `P`'s own heap type. Rules 3 and 4 add an anonymous struct type (the `#anon`
  registry rows).
- `flat` is erased before emit (`flat-records-design.md`), so a flat `P` spreads like any other.
  Rules 3 and 4 give a record that is not flat.

**Aliasing.** A spread REPLACES a reference; it never updates a record. Consider:

```vl
const held = pool[i]
pool[i] = { ...pool[i], hp: 0 }
print(held.hp)   // still the old hp: `held` keeps the stale record
```

Every other holder of the old record (a local, another list, a field) still sees the old values.
This is the opposite of what a pool needs. The in-place whole-record store that SP-032 actually
asked for is filed as **D3642**.

**The #3372 multi-value step applies.** Spread does not parse yet, so the test used its
desugaring: `function moved(p: V, d: f64): V { const s = p; …; { x: s.x + k, y: s.y, z: s.z } }`,
with three callers that read the result's fields.
- At `-O`, `VL_MV_EXPLAIN=1` printed `type 0 {f64, f64, f64} (returned by func 5): candidate`
  and `func 5 -> type 0: result twin; 3 call site(s) read it as fields, 0 keep the struct`.
- `wasm-dis` shows `(result f64 f64 f64)` on the twin, and `struct.new` falls from 5 to 2. The 2
  left are the global and the list's `src.push` element.
- The conditions are inherited: the shape has 1–8 numeric fields, and no `struct.set` reaches it
  anywhere. A spread adds no `struct.set`, so it never disqualifies a shape.
- `p` itself is a field-only parameter, because a spread reads it only through `struct.get`.

## 6. Editor, lint and `--fix`

- **Hover.** Hovering on the literal shows the result type (`P`, or the §3.1 spelling).
  Hovering on `...p` shows `p`'s type. Go-to-definition on an override key goes to `P`'s field.
- **Completion.** No completion exists for field names inside an object literal today: the
  server handles `.` (member) and scope only (`lsp/src/server.ts:1357`). After `...p,` the editor
  should offer the `P` fields not yet overridden, by reusing `memberCompletionsAt` on `p`. This is
  new work, and it would be the first literal-key completion in the editor.
- **Lint `record-spread-candidate` (hint, with `--fix`).** It fires on a literal that copies at
  least two fields as `f: b.f` from one base `b`, when the literal's type EQUALS `b`'s type.
  Without that type check, a literal copying a subset into a narrower type would match.
  - The fix requires `b` to be a local or a parameter path, and that no override can write `b`'s
    shape (§4).
  - Heuristic count, one-line literals without nested braces, so a lower bound: compiler 18
    (`typecheck.vl:16763` copies a `LetDecl` with a new annotation), std 2, scripts 1, tests 1,
    sunpa `src/` 18. Of sunpa's, 11 have at most two fields that are not copied (`actor.vl:845`).
  - `tests/cases/types/newtype-read-write-brands.vl:16`, the deliberate brand forge, must not be
    rewritten. The brand rule (D4) makes the rewrite a type error, so the lint never offers it.
- **Lint `useless-spread` (OCaml's warning 23).** It fires when every field of `P` is overridden,
  or when an override is `x: p.x`.
- **Lint `spread-added-field-near-miss` (warning, D9).** Under rule 4, `{ ...p, colour: c }` with
  `color` on `P` silently ADDS a field, and width subtyping lets the result run wherever a `P` is
  expected. The lint warns when an added name is within edit distance 2 of one of `P`'s fields.

## 7. Stated defaults

These are decided unless the owner objects. D2 and D3 were already accepted as the owner's
defaults; the rest are this design's recommendations.

- **D1. One spread, first.** `{ ...p, x: 1 }`. A spread after a field (`{ x: 1, ...p }`) is a
  parse error. Every typed form in the survey also fixes the base's position (Rust: last), and
  this makes §4's evaluation order the written order.
- **D2. `{ ...a, ...b }` is refused.** The owner's stated default ("same type only, later wins")
  turns out to be vacuous: if `a` and `b` have the same type, `b` supplies every field, so the
  result equals `{ ...b }` and `a` only contributes its evaluation. A real patch form (`b` of a
  type whose fields are a SUBSET of `a`'s, `{ ...base, ...patch }`) is the useful version. It can
  be added later without breaking anything.
- **D3. Unions and nullables are refused; narrow first.** `if s is A { { ...s, x: 1 } }`.
  Dispatching per member can be added later, and that is additive.
- **D4. A spread carries `p`'s brand and never adopts another.**
  `const w: WriteHp = { ...r }` with `r: ReadHp` is refused, whatever §8 question 1 decides.
  `{ base: r.base, length: r.length }` stays the explicit, greppable forge
  (`newtype-design.md` §2.3 lets a literal adopt a brand because it "has no prior identity", and a
  spread has one). Rules 3 and 4 drop the brand with a hint (§3.3).
- **D5. Snapshot.** Copied fields are `p`'s values before any override runs (§4).
- **D6. Generics are checked per instance** (§3.4), which matches how `t.x` already behaves.
- **D7. No field removal.** There is no `{ ...p, -z }` and no `omit`. Write the literal out; width
  subtyping already lets a wider record go where `P` is expected.
- **D8. `{ ...p }` is the shallow-copy idiom.** It gets no `copy(p)` in std and no lint.
- **D9. The near-miss lint** in §6 is a `warning`.
- **D10. Type-level spread is not part of this design.** `type Q = { ...P, z: i32 }` is a parse
  error today (``expected an identifier but found `...` ``). It is a build item for later, kept
  separate so that value spread does not wait on it.
- **D11. A map spread is refused** (§3.5).

## 8. Questions for the owner

**(1) Is a spread a fresh record literal?** This is the one place where the result may NOT be
`p`'s type. The answer settles four things together:
- a spread delivered to an annotated destination of a different type;
- whether an added literal field adopts its type from where it is delivered (D3339);
- the `{}` completion of nullable fields (D2223);
- the excess-field refusal.

```vl
type I = { f: i32 }
type J = { f: i32 | null, note: string | null }
const i: I = { f: 1 }
const j: J = { ...i }          // (A) builds a J at the destination: f = 1, note = null
                               // (B) refused: "only a fresh record widens" (it is typed I first)
const p: I = { ...i, z: 1 }    // (A) refused, like `{ f: 1, z: 1 }` into I: "sets `z`, which I does not declare"
                               // (B) runs; `z` is dropped by width subtyping
type D = { f: i32, z: f64 }
const q = { ...i, z: 1 }
const d: D = q                 // (A) q adopts D for the whole binding, decided at check time
                               //     (D3339), so `q.z / 2` is 0.5 everywhere
                               // (B) refused: q.z is i32
```

- **(A) Yes (recommended).** A spread is a literal whose unwritten fields are `p`'s, for every
  rule that asks about freshness. Context decides the type when there is a destination;
  otherwise rules 1–4 decide it at `p`. Overrides that fit stay fixed by `P` (rule 1); D3339's
  whole-binding adoption reaches only ADDED literal fields. The covariance message already
  recommends this copy, spelled as `{ f: i.f }`.
- **(B) No.** The spread is typed at `p` by rules 1–4 first, then delivered like an existing
  record.

Under (A), D4 is the one exception: no brand is adopted.

**(2) What counts as "explicit", and does a fitting conversion keep `P`?**

```vl
type P = { x: f64, n: i32 }
function toI64(v: i32): i64 { v }
const p: P = { x: 0.5, n: 1 }
const b: i32[] = [3]
const k: i32 = 4
const r1 = { ...p, x: b[0] as i32 }       // i32 fits f64
const r2 = { ...p, n: (k as i64) + 1 }    // the `as` is an arithmetic operand
const r3 = { ...p, n: toI64(k) }          // a call that returns i64
```

- **(A) Fit first; the `as` may be at the top or an arithmetic operand (recommended).** `r1` is a
  `P` (rule 1). `r2` is `{x: f64, n: i64}`. `r3` is an error (rule 2), because nothing at the
  override says the type changes. Explicit then means: after parentheses, the override's type
  comes from an `as`, `as?`, `as!` or `as%` node, either at the top or as an operand of the
  arithmetic that produces it.
- **(B) Fit first; only a top-level `as` counts.** `r1` is a `P`, `r2` is an error, and the fix is
  `n: ((k as i64) + 1) as i64`.
- **(C) The `as` target always decides.** `r1` is `{x: i32, n: i32}` even though the value fits;
  `r2` is as in (A).

(A) keeps the rule greppable (the `as` sits in the override) without forcing a redundant outer
cast. (C) lets a fitting conversion silently narrow a field, which is the implicit change rule 2
exists to prevent.

Under every option, a NON-numeric change has no explicit spelling, because `as` is numeric-only
(A3). `{ ...p, x: null }` on an `i32` field is an error, and that record is written out in full.
