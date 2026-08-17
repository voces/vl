# Per-rep ladder audit — the ranked inventory

A **per-rep ladder** is a function that dispatches on a wasm REPRESENTATION or a
type-arena KIND and returns a name / kind / valtype / slot / boolean. It is the
compiler's most common shape and its most common defect: an arm exists for most
reps, one rep has none, and the fallthrough is a **valid-looking answer for a
different rep** rather than a loud failure. That is what turns an incomplete
ladder into `vl check`-clean invalid wasm or a silently wrong answer instead of a
compiler error.

This file is the deliberate sweep for the remaining instances, ranked by what the
silent default produces. It is an inventory, not a plan; each open row names a
reaching program so the next reader starts from a measurement rather than a
suspicion.

## The rep vocabulary a ladder must cover

The authoritative list is `VKind` (`compiler/emit_state.vl`) — **27 members**:

    i32 · i64 · f32 · f64 · str · struct · variant · union · closure
    list · strlist · f64list · i64list · f32list · reflist · map
    nulstruct · nulstr · nulbool · nullist · nulstrlist · nulf64list
    nuli64list · nulf32list · nulreflist · nulclosure · nulmap

Two corrections to the folklore this audit started from:

* the nullable **niches are ELEVEN**, not three. `nulstruct`/`nulstr`/`nullist`
  are the three that get remembered; `nulbool` (an i32 sentinel), `nulmap`,
  `nulreflist`, `nulclosure` and the four distinct-backing scalar lists
  (`nulstrlist`/`nulf64list`/`nuli64list`/`nulf32list`) are the eight that get
  missed. A ladder that names three has named a quarter of the family.
* `boolean` is **not** a `VKind` member — its valtype IS i32 (`fRetBool` is a
  side channel beside the kind). Reps outside `VKind` that a ladder still has to
  answer for: a NAMED litunion (an interned i32 atom), an INLINE/un-named
  litunion (a real `(ref $array)` string), a NUMERIC litunion (`1 | 2`, its own
  lowering), sets (string-key and i32-key), newtypes/brands, anonymous shapes,
  nested arrays.

The type arena (`compiler/typecheck.vl`) has **11 variants**: `TyPrim`, `TyErr`,
`TyObj`, `TyFunc`, `TyUnion`, `TyNullable`, `TyArray`, `TyMap`, `TyVar`, `TyLit`,
`TyNeg`. A ladder over the arena that omits `TyUnion` or `TyNullable` is the
single most common instance of this defect, because a DECLARED alias and an
INLINE annotation do not intern to the same variant — see the open row below.
(`TypeRef`/`TypeDecl` are AST nodes, NOT arena variants; counting them is the
first mistake a re-derivation makes. "The ARENA half" below has the remeasured
site counts and the classification ratio.)

## Method and denominator

3025 functions across `compiler/*.vl` were scanned mechanically for the two
ladder shapes (`>= 3` distinct `is Ty*` tests; `>= 4` distinct `VKind` string
literals; `>= 3` distinct `nameIs*` predicates). That yielded **276 candidate
sites**, all of which were read. A second mechanical pass keyed on the
scrutinee found **107 (function, variable) `VKind` `if`-chains with >= 3 arms**
and printed, for each, exactly which of the 27 members it omits — that listing is
the fastest way to re-run this audit and is reproducible from the two shapes
above.

Of the 276, **~150 are genuine per-rep ladders with a fallthrough**. Each was
classified DANGEROUS (a valid-looking default for the wrong rep) / SAFE-LOUD
(falls into an `emitFail` or a checker error) / UNREACHABLE (an upstream guard
provably excludes the missing reps, with the guard NAMED — "it looks unreachable"
is what failed three times, so an unnamed guard is filed as DANGEROUS-UNPROVEN
instead).

Every DANGEROUS row below was then **reached with a program** and its actual
outcome recorded. *Silently wrong* and *invalid wasm* are kept as separate
counts.

## Score

| | cells |
|---|---|
| check-clean INVALID WASM, reached with a program | 27 + 20 (C4) |
| ... closed | 26 + 9 (C4) |
| ... open (1 ladder family, reached) | 1 + 11 (C4, all outside the target family) |
| check-clean SILENTLY WRONG output, reached | 0 + 26 (C4) |
| ... closed | 26 (C4) |
| spurious LOUD reject of a valid program, reached | 7 ladders + 47 cells (C4) |
| DANGEROUS-UNPROVEN (no reaching program found) | 5 |

No silently-wrong cell was found *by this sweep*, and the reason is a blind spot
in its own denominator, not an absence: **the sweep's two mechanical scans key on
`VKind` string literals and `is Ty*` tests**, so they see the valtype / locals /
arena ladders and not the **USAGE-DETECTION** ladder — a `while` over `P.nodes`
asking a fixed list of "is this node a use of feature X?" questions, whose
fallthrough is `false` = *"the program does not use X"*, which turns off a whole
family of classifiers at once. `anyLitUnionUsed` is one of those, and it held the
silently-wrong cell this audit missed (row C4 below, 26 cells). A usage detector
is the highest-leverage shape in the family, because its default disables every
downstream arm rather than mis-answering one; the next sweep needs a third scan
shape for it (`while i < P.nodes.length` + `return true` on a `nodeTy*`/`node*Is*`
predicate run).

## CLOSED — three DANGEROUS ladders (26 invalid-wasm cells) + two structural pins

### 1. The narrowed-nullable-collection recover knew ONE of four list wrappers

`for v in xs`, `xs.slice(..)` and `xs.filter(..)`/`xs.map(..)` each read the
iterable/receiver ONCE into a temp whose slot is declared NON-null, and all three
recovers asked `exprNullableList` — which claims only the i32-list niche. A
`string[] | null` / `f64[] | null` / `i64[] | null` / `P[] | null` binding keeps
its own wrapper, so nothing was emitted and the wrapper `struct.get` received
`(ref null $wrap)`.

* Reached by: `function mk(): f64[] | null { return [1.5, 2.5] }` then
  `const v: f64[] | null = mk(); if v != null { for x in v { print(x) } }`.
* Actual: `vl check`-clean INVALID WASM, `type mismatch: expected (ref $type),
  found (ref null $type)`. Oracle: the `i32[] | null` twin, which has always run.
* Measured: op x list-rep grid, 9 ops x 6 element reps x nullable/non-null = 108
  cells, each nullable cell twinned against its non-null oracle's exact stdout.
  **Invalid wasm 16 -> 0**, silently-wrong 0 -> 0.
* Fix: one predicate, `nulRecvNeedsRecover` (`compiler/wasmEmit.vl`), asked by all
  three sites — the READ dual of `emitNulIsNullTest`'s niche disjunction, whose own
  header states the invariant ("a rep answered in only one of the two callers is a
  guard that never fires").
* Pinned by `tests/cases/arrays/nullable-list-recover-forin-slice.vl`.

### 2. The ref if-expression join knew 4 of 7 ref shapes

`ifExprRefKind` classified a value-position if-expression's join as closure /
string / `string[]` / `f64[]` / `S[]` / `i32[]` / struct. Its fallthrough is not
"some other ref": it is `null`, which routes the whole if-expression to the
SINGLE-BYTE numeric blocktype (`ifExprValtype`, i32 by default).

* Reached by: `function takes(xs: i64[]): i32 { xs.length }` … `print(takes(if
  flag { a } else { b }))` over two `i64[]` bindings.
* Actual: `vl check`-clean INVALID WASM — `if (result i32)` over two arms each
  pushing `(ref $il64Wrapper)`. Oracle: the identical program in `f64[]`.
* Measured: if-expression join x position grid, 16 reps x {call arg, annotated
  binding, un-annotated binding, return} = 64 cells. OK 51 -> 61, **invalid wasm
  10 -> 0** (`i64[]` in all four positions, `f32[]` and map in three each).
* Pinned by `tests/cases/conditionals/if-expr-ref-join-rep-ladder.vl`.

### 3. The structural guard, applied where it is cheapest

`fbValtypeNullable` was an `if`-chain whose only default was `wU8(VT_I32)`, while
its own out-of-bounds guard lists `kind == "variant"` and the ladder had no
variant arm. Converted to an exhaustive `match` (see "Is a structural guard
feasible" below). Behaviour-neutral: A/B of the emitted wasm bytes over every
`.vl` under `tests/cases/` — 1860 records, 1538 byte-identical, 322 rejecting
identically, **0 byte differences, 0 rc differences**.

### 4. The same structural guard, applied to an ARENA ladder

`repTyScalarMask`'s walk (row R11 below: no `TyLit` arm, fall-through leaves the
mask 0 = "mentions no wide scalar", the direction that DROPS a `__print_*__`
import) is an exhaustive `match` over `Ty` with no `_`. The three leaves it never
descended through — `TyLit`, `TyErr`, `TyVar` — are spelled as empty arms carrying
their reason. Behaviour-neutral: every `.vl` under `tests/cases/` built with both
compilers, **1872 records, 1548 byte-identical modules, 324 rejecting identically,
0 byte differences, 0 rc differences**. The guard is proven live by sabotage —
deleting the `TyMap` arm makes `scripts/refresh-compiler.sh` exit 1 with the
variant named at its source position. See "The ARENA half" below.
## CLOSED — C4. The USAGE DETECTOR, which is the shape this audit's scans cannot see

`anyLitUnionUsed` (`compiler/typecheck.vl`) is the single `P.nodes` pass that sets
`gLitUnionUsed`, and `exprIsLitAtom` — the classifier every atom consumer asks —
returns `false` on its FIRST LINE when that flag is 0. The pass asked four
questions per node and **only the non-null half of two of them**, so a program
whose only litunion mention is a NULLABLE ARRAY ELEMENT answered "this program
uses no literal union": the `: K | null` annotation probe was there, but the
annotation of `(K | null)[]` is a TypeRef whose own type is the `TyArray`, so no
node in such a program carries a bare nullable-litunion annotation type at all.

* Reached by: `type K = "p" | "q"` ; `const xs: (K | null)[] = ["p", null, "q"]` ;
  `for x in xs { print(x) }`.
* Actual: `vl check` **rc 0**, prints **`0` / `-1` / `1`** — the raw interned atom
  ids and the `-1` null sentinel. Oracles, both working: the `(string | null)[]`
  element (prints `p` / `null` / `q`) and the non-nullable `K[]` element.
* Measured: 6 element spellings (named / inline / alias-with-its-own-null /
  numeric / newtype / `string` control) x 33 container-read-consumer shapes, both
  runtime inputs, each cell against its own expected stdout = **198 cells**.
  **silently-wrong 26 -> 0**, invalid wasm 20 -> 11, OK 52 -> 134, **0 cells worse
  in any direction**.
* FIVE ladders, each missing the nullable dual of a question it already asked:
  `anyLitUnionUsed` (the root), `declareForInLocals`' `localLitUnion` flag,
  `exprNulLitUnion`'s Ident arm (the for-in LOOP VAR storage class — R10's fourth
  bullet, same shape, different classifier), the collect scan's `aUsed` forcing
  for a `: K | null` annotation, and canon's `nulLitUnionPreserve` for a
  TRANSPARENT ALIAS core (`type K2 = K` / `type NK = new K`, which it SOFTENED to
  `string | null`, giving a `{[string]: K2 | null}` map a `(ref null $aTypeIdx)`
  vals slot while every read lowered the i32 atom).
* `print` of the niche also stopped REJECTING. The old ruling ("narrow it first")
  rested on a false parity with `print(<string | null>)`, which does not require
  narrowing — it prints `null`, and so does `print(<boolean | null>)`. The
  members and the `-1` sentinel partition the i32, so the value carries its own
  discriminator. `emitPrintAtomMemberChain` is now the one home for the member
  arms, shared by the bare-atom and niche prints.
* Pinned by `tests/cases/literal-unions/nullable-litunion-element-read.vl` (a LOG
  mismatch on master — it built and ran) and
  `…/nullable-litunion-element-consumers.vl` (a build-verdict pin).

Residues the grid measured and this slice did NOT close, each with its cell count
out of 198 and a reaching program in the same grid:

* **the alias that carries its own `| null` arm, used as a CONTAINER element** —
  `type K = "p" | "q" | null` ; `const xs: K[] = ["p", null]` is
  `emitProgram: array literal but list type not collected`, and its struct-field
  and map-value twins are check-clean invalid wasm. 18 cells, unchanged by this
  slice in either direction. This is R1's family one spelling further in: the
  expanded union interns differently from `TyNullable`, and the LIST/FIELD/MAP
  construction ladders key on the latter.
* **`??` over a LIST index** — `xs[1] ?? "q"` is `emitProgram: `??` is only
  supported on a map index get` for every litunion spelling (4 cells) and
  check-clean INVALID WASM for the `(string | null)[]` control (1 cell), which is
  the worse verdict and is pre-existing.
* **`print(<numeric litunion | null>)`** — `type N = 1 | 2` ; `N | null` is a
  clean checker reject at 19 of its 33 shapes ("print of a union value (1 | 2?) is
  type-valid but not yet supported by codegen") and check-clean invalid wasm at 3
  (`list-forin-narrowed`, `list-forin-topar`, `struct-field-narrowed`).
* **`(string | null)[]` compared un-narrowed** — `for x in xs { if x == "p" … }`
  over a `(string | null)[]` TRAPS (`wasm trap`, 1 cell), while every litunion
  spelling of the same program now runs. The control is the broken one here.

## OPEN — ranked

### R1. DANGEROUS, check-clean INVALID WASM — a DECLARED alias over a nullable niche is not the same arena variant as the inline spelling

`type B = boolean | null` resolves through the `UnionDecl` route, which pushes
`null` as a plain member: the arena entry is `TyUnion[boolean, null]`. The INLINE
annotation `(boolean | null)` folds to `TyNullable(boolean)`. The whole
`nodeTyIsNul*` family (`nodeTyIsNulBool`, `nodeTyIsNulString`,
`nodeTyIsNulScalarBox`, `nodeTyIsNulI32List`, `nodeArrayElemIsNulBool`,
`nodeArrayElemIsNulStr`, `nullableRetName`, `tyIsNicheNulScalarElem`) tests
`t is TyNullable` and only that, so every one answers **false = "not a niche
nullable"** for the declared spelling — while `isValueUnionBox` answers **true**
for the same entry, so the value is lowered as a `{tag, value}` BOX and read as an
i32 niche. `tyIsNullableLitUnion` is the ONE member of the family that carries
both forms.

* Reached by:

      type B = boolean | null
      const xs: B[] = [true, null]
      const a = xs[0]
      if a == null { print("N") } else { print(a) }

* Actual: `vl check` clean, then `Invalid input WebAssembly code at offset 387:
  type mismatch: expected i32, found (ref $type)`.
* Oracle: drop the alias — `const xs: (boolean | null)[] = [true, null]` prints
  `true` / `N`.
* NOT fixed here: this is not an arm, it is a spelling-normalisation decision
  (fold a 2-member union containing `null` into `TyNullable` at `UnionDecl`
  resolution, or teach the whole family both forms). Either touches the read, the
  store, `??` and the pin family together, and the measured surface is unknown —
  it wants its own grid (alias vs inline x 11 niches x position).

### R2. DANGEROUS -> SAFE-LOUD in practice — `f32` is the rep with no typed-IR path at all

`tyIsF32Array` is `tyKindOf(tyIx) == 21` and `tyKindOf` deliberately carries no
f32-array kind (a float LITERAL types f64), so `tyIsF32Array` is **identically
false** and its call in `exprF32Array` is dead code. `exprF32Array`'s Ident arm
therefore rests on `declaredKind(name) == "f32list"`, which is `"nulf32list"` for
a narrowed `f32[] | null`. Its f64/i64/string twins are rescued by their typed-IR
fast paths reading the checker's NARROWED type.

* Reached by: `function mk(): f32[] | null { return [1.5] }` then
  `const w: f32[] | null = mk(); if w != null { print(w.length) }`.
* Actual: LOUD — `emitProgram: field access but no struct type declared`. Also
  loud on `xs[0] = e`, `.push`, `for-in`, `.slice`, `.filter`, `.map`: **7 of 9
  ops** in the grid above, against 0 for the other three nullable scalar lists.
  Declaring a struct with a `length` field does not change the verdict (checked) —
  it stays loud.
* Not fixed: the honest fix is a NARROW typed-IR arm keyed on the pair (declared
  kind `nulf32list`, recorded node type = the non-null `f32[]`), since only the
  narrowed read records the non-null form. Making `exprF32Array` claim the
  binding unconditionally would trade a loud reject for possible invalid wasm on
  the UN-narrowed read, so it needs the un-narrowed control rows measured first.

### R3. SAFE-LOUD — `letInitCellKind` has no if-expression / niche arms

Its own header says it mirrors `collectLocals`' ladder "in the same order";
`collectLocals` is the only ladder in the tree with an arm for all 27 VKinds,
and this one lacks `nulstr`, `nullist`, `nulmap`, `nulclosure`, `nulbool`,
`nulreflist`, `variant` and the four nullable scalar lists. Fallthrough `"i32"`.

* Reached by: `const s = maybeStr(n)` (un-annotated, `string | null`-returning
  call) captured by a lambda; and by an un-annotated binding of an
  `f32[]`/`S[]`/map if-expression join.
* Actual: LOUD both ways — `emitProgram: bare null needs a struct-typed context`,
  `emitProgram: field access receiver is not a struct`. Oracle: annotate the
  binding.
* This is the residue the if-expression grid still shows (3 of 64 cells).

### R4. SAFE-LOUD — `collectMapFilterUse` is a hand-copied second copy of `mfResultKindOf`

`mfResultKindOf` knows 8 result kinds; this flag-forcing twin knows 5 and still
asks `cloRetKindOf`, which folds `i64`/`f32` to nothing. Fallthrough forces the
i32-list machinery (`aUsed`/`lUsed`).

* Reached by: `function big(n: i32): i64 { n + 1 }` … `const ys = xs.map(big)`.
* Actual: LOUD and precise — `emitProgram: .map result is i64[] but i64 list type
  not collected` (and the `f32` twin). Oracle: annotate the binding
  (`const ys: i64[] = …`), or return `f64`, which the ladder does have.
* The precise message is the reason this is tier 3 and not tier 1: the type-index
  minting pass and the locals vector disagree, and the disagreement is caught.

### R5. SAFE-LOUD — `isEquatable` has no `TyLit` / litunion arm

Arms: `TyPrim`/`TyErr`/`TyVar`/`TyFunc` true, `TyArray` element, `TyObj` all
fields. A litunion-typed field is a single i32 atom at runtime and perfectly
comparable, but falls to `false`.

* Reached by: `type K = "a" | "b"` ; `type S = { tag: K, v: i32 }` ; two `S`
  values ; `print(p == q)`.
* Actual: LOUD — `{tag: "a" | "b", v: i32} isn't equatable (a field is not
  value-comparable) — define a == operator for it`. Oracle: compare the fields
  by hand.

### R6. SAFE-LOUD — `forInElemKind`'s `.values()` sub-ladder has no union-box arm

Keyed on `mvValKind[vsl]`: 3/11/10/13/14/6 have arms, kind **2** (a union-box
valued map) does not and falls to `return "struct"`, whose slot resolution then
answers -1.

* Reached by: `const m: {[string]: i32 | string} = Map()` … `for v in m.values()`.
* Actual: LOUD — `emitProgram: ref valtype with no interned shape`. Oracle:
  iterate `m.keys()`, or use a struct-valued map.

### R7. SAFE-LOUD — `nodeArrayElemName` has no `TyArray` (nested-list element) arm

Arms: `TyVar`/`TyPrim`/`TyObj`/`TyMap`/`TyUnion`/`TyFunc`, and `TyNullable` only
when its inner is `TyFunc`. Fallthrough `""`.

* Reached by: `function row(): i32[] { [1, 2] }` ; `const xs = [row()]`.
* Actual: LOUD — `emitProgram: nested arrays are not supported`. Oracle:
  `const xs: i32[][] = [row()]`, which runs.

### R8. SAFE-LOUD — `monoArgTyName` has no `nulmap` arm

`exprMap` returns TRUE for a `{[K]: V} | null` argument but `nodeTyMapName`
matches only `t is TyMap`, so the map arm declines and the value falls past every
remaining classifier to the `"i32"` default.

* Reached by: `function id<T>(x: T): T { return x }` over a `{[string]: i32} |
  null` argument.
* Actual: LOUD — `emitProgram: bare null needs a struct-typed context` (the
  program does not reach the monomorphized instance). Oracle: the non-nullable
  spelling.

### R9. SAFE-LOUD — `annRetKind` has no `variant` arm while `cloRetKeySuffix` does

Two `$fnsig` producers over the same annotation disagree on exactly one rep, so a
`(i32) => Cat` closure binding keys `""` and falls to the all-i32 arity sig.

* Reached by: `const f: (i32) => Cat = mk` with a second 1-ary i32 closure present.
* Actual: LOUD — `emitProgram: field access but no struct type declared`. Oracle:
  annotate with the union alias (`(i32) => Shape`), which keys `>u`.

### R10. DANGEROUS-UNPROVEN (5)

No reaching program was found for these, which makes them lower-severity findings
than every row above — recorded so the next sweep starts from the analysis:

* `collectTyMembersReach` has no `TyNullable` arm while its own caller
  `collectTyReachRegister` descends one; a nullable-wrapped union at a collection
  position gets no pre-descent. Loud if reached.
* `collectTyReachCloSigs` / `collectTyReachRegister` fall through on `TyNeg`,
  which every sibling walker in `emit_rep.vl` handles. `intersectTy` consumes
  almost all negations.
* `tyReachesHole` (`typecheck.vl:11555`) is the third member of that `TyNeg`
  family: it descends `TyArray`/`TyMap`/`TyNullable`/`TyObj`/`TyUnion`/`TyFunc`
  and answers `TyVar` true, but has no `TyNeg` arm, so `!(T[])` over a
  hole-reaching `T` falls to `false` = "reaches no hole" — the direction that lets
  a hole through the parameter-solve gate. Same guard as its siblings
  (`intersectTy` consumes almost all negations), and `tyChildrenOf` — the shared
  visitor recommendation (c) routes this family through — has the arm already.
* `cloCallUnionMixUnrep` (the floor for the deferred value-union-closure-result
  family) sets neither `hasScalar` nor `hasComposite` for a `TyNullable` member or
  a nested non-literal `TyUnion` member, and "no composite" means "admit".
* `exprNulScalarListKind`'s Ident arm covers param / declared local / global but
  **not the CAPTURE storage class**, which every sibling niche classifier carries.
  A missing storage class, not a missing rep, but the same silent-`null` shape.
  **This bullet's sibling was reached and closed by C4**: `exprNulLitUnion`'s Ident
  arm was missing the for-in LOOP VAR — a storage class with no declaration node
  at all, so it cannot be resolved the way the other four are; the fix reads the
  checker's recorded type for that read instead. Every niche classifier with an
  Ident arm should be re-read against the FULL storage-class list (capture, param,
  `let`, global, **for-in loop var**), which is five, not four.

### R11. UNREACHABLE, with the guard named

* `fbValtypeNullable` omitted `i32`/`nulbool` (both correctly served by the i32
  default) and `variant`. Guard: the only two callers are `emitGlobalSection`,
  whose `ck` is `globalCellKind` (every `return` enumerated — it yields no
  `variant`), and `emitIfExprRef`, gated `kind == "struct"`. Confirmed
  empirically by the 1860-record byte A/B above. **Retired anyway** by the match
  conversion, because the guard was one edit away from being wrong.
* `fbRefNullForKind` omits 7 of 27. `i32`/`i64`/`f64`/`f32` are excluded by the
  caller's own if-ladder; `nulbool`/`variant` by `globalCellKind`. `nulstr` has no
  arm and IS reachable, but the fallthrough `wSLEB(aTypeIdx)` is the same index
  the `"str"` arm writes — accidentally correct, cosmetic. Note the two guards
  disagree: this one's OOB guard omits `variant` while its sibling's lists it.
* `repTyScalarMask` has no `TyLit` arm, and its fallthrough leaves the mask 0 =
  "mentions no wide scalar", the dangerous direction. Guard: every inhabitant of a
  flt/wide-int literal type must be spelled as that literal in source (a base
  scalar is not assignable to a literal union), so `scanPrintUse`'s own
  `NumLit`/`numTextIsFloat` arm always fires first.
* `litUnionInlineNameOfTy`, `tyReachesBrand`, `retKindPri`, `retKindIsList`,
  `listIdxKindOf`, `refArrShapeKind`, `annParamKind`, `emitAsCast`'s target
  ladder — each has its excluding predicate and call-site set named in the audit
  notes; `retKindPri` in particular is a latent trap, because a new `criClassify`
  arm passing an unlisted kind would make `criSetRetKind` no-op silently.

## Is a structural guard feasible?

**Yes, and it is already in the language.** VL's checker enforces `match`
exhaustiveness over a literal union and names the missing member:

    type K = "a" | "b" | "c"
    function f(k: K) { match k { "a" => { 1 } "b" => { 2 } } }
    // [ERROR]: non-exhaustive match — missing "c" (add the arm or a `_`)

So a `VKind` ladder written as a `match` **without a `_` arm** cannot drift from
`VKind`: adding a 28th rep breaks the self-compile at every such ladder, with the
member named. `fbValtype` already relies on this and says so in its header;
`fbValtypeNullable` now does too, and the byte A/B shows the conversion costs
nothing.

Where it applies and where it does not:

* **Applies** to ladders whose DOMAIN is all of `VKind` — the valtype / locals /
  global-cell / functype layer (`fbValtype`, `fbValtypeNullable`,
  `fbRefNullForKind`, `collectLocals`, `vtKindOfType`, `globalCellKind`,
  `repSigTokOfKind`/`repKindOfSigTok`). Converting these is mechanical, and the
  verbosity is the point: a default that is deliberate (`nulbool` really is i32)
  becomes a spelled arm with a reason instead of an accident.
* **Does not apply** where the domain is a documented SUBSET (`nulScalarListWrapHeap`
  over four kinds, `scalarListElemKind` over four, `mvListValKind` over six). A
  `match` there would demand 27 arms for a 4-member question. Those ladders'
  correctness rests on the negative sentinel (`-1`/`null`/`""`) being tested by
  every caller, which is a caller-side invariant and is what the SAFE-LOUD rows
  above verify one by one.
* **Applies to the ARENA ladders too** — see the next section. The claim once
  filed here, that `Ty` being an `is`-discriminated struct union leaves nothing to
  lean on and needs a language feature, is FALSE and was never checked against the
  corpus: `tests/cases/match/value-union-non-exhaustive-error.vl` and
  `tests/cases/soundness/exhaustive-missing-is-case.vl` each pin a mechanism that
  covers a struct union today.

The cheap procedural half, usable now: the two mechanical scans that produced the
denominator above take seconds and print, per ladder, exactly which of the 27
members it omits. Re-running them after any rep addition is the difference between
finding these by sweep and finding them by accident, which is how the last three
were found.

## The ARENA half — the guard exists, and it is already in the language twice

### The vocabulary, remeasured

`Ty` (`compiler/typecheck.vl:349`) has **11 variants and only 11**: `TyPrim`,
`TyErr`, `TyObj`, `TyFunc`, `TyUnion`, `TyNullable`, `TyArray`, `TyMap`, `TyVar`,
`TyLit`, `TyNeg`. Two traps for anyone re-deriving this by grep:

* **`TypeRef` and `TypeDecl` are AST nodes, not arena variants** (`ast.vl:129`).
  They contribute 83 + 24 textual `X is Ty*` hits and belong to a different
  question entirely. A `TypeRef` row in an arena-variant table is a miscount.
* A grep that keys on the variants people remember silently drops `TyErr`,
  `TyVar`, `TyLit` and `TyNeg` — which are **exactly the four most-omitted**
  (missing from 64 / 60 / 63 / 67 of the 81 multi-arm ladders below).

Arena `X is Ty<variant>` dispatch sites, comment lines stripped: **993** across
six files — `typecheck.vl` 736, `emit_classify.vl` 117, `emit_rep.vl` 104,
`emit_collect.vl` 25, `check_query.vl` 6, `emit_base.vl` 5. (±8 depending on the
in-line-comment heuristic; the count is not sensitive to it at this resolution.)

### The classification ratio — why a LINT is not the answer

Grouping those 993 sites by `(file, function, scrutinee text)` gives **564
ladders**, distributed by DISTINCT variants tested:

| distinct variants | ladders |
|---|---|
| 1 | 399 |
| 2 | 84 |
| 3–4 | 38 |
| 5–8 | 38 |
| 11 | 5 |

**483 of 564 (86%) test one or two variants** — those are guards, not dispatches,
and no lint should look at them. That leaves **81 ladders with ≥ 3 arms**, and
their fall-throughs classify as:

| | ladders |
|---|---|
| complete over all 11 | 5 |
| complete over the 7 STRUCTURAL variants (missing only holes/exotics) | 11 |
| missing ≥ 1 structural variant, fall-through is LOUD in the tail block | 7 |
| **missing ≥ 1 structural variant, fall-through is a SILENT default** | **58** |

A lint keyed on "≥ 3 arena arms, no `else`, silent default" therefore fires on
**58 sites**, of which this audit's own read of all 276 candidates found ~10
genuinely dangerous — an **~83% false-positive rate**, on the exact population
where `isNumeric` legitimately cares only about `TyPrim`/`TyLit`/`TyUnion` and
`tyAdmitsNull` only about `TyNullable`/`TyPrim`/`TyUnion`. Tightening the
threshold does not rescue it: at ≥ 5 arms the population is 43 ladders and the
partial-by-design ones (`repOfArray` over 4 element reps, `mvValNulRefNicheAt`
over 5 niches) are still the majority. **Rule (a) is measured and rejected.**

### What the language already checks

Two independent mechanisms cover a struct union. Both are pinned by corpus
fixtures, so neither is a proposal.

**1. `match` over a VALUE union.** `checkMatchExprNode` takes member-TYPE
patterns ("a pattern over a value union is a member type or the `_` wildcard"),
banks each arm's narrowing into `isVarTyIx` so the body reads the narrowed
member's fields, and reports `non-exhaustive match — missing <member> (add the
arm or a `_`)`. No positional constraint, no rep change, no tag helper, and it
fires under an inferred return type as well as an annotated one. Verified on the
real `Ty`: deleting one arm of the converted ladder below makes
`scripts/refresh-compiler.sh` exit 1 with the variant named at its source
position. The one rough edge is cosmetic — the member renders STRUCTURALLY
(`{mKey: i32, mVal: i32, mSet: i32}`), not as `TyMap`.

A helper returning a litunion tag (`match tyTagOf(ix) { "prim" => … }`) is
therefore **strictly worse than doing nothing new**: it adds an indirection, it
LOSES the arm narrowing (`t.primName` no longer types inside the arm), and the
helper itself is one more arena ladder that can drift.

**2. `ifChainExhausts` (`typecheck.vl:14425`).** Computes uncovered-member
coverage for an else-less `is`-chain over one place and names the missing members
through `chainMissing`. It reaches a `Ty`-shaped union correctly — but only for a
chain that is a function's **LAST statement**, under an **ANNOTATED** non-void,
non-nullable, non-err return, with every arm a bare `<sameIdent> is T`. Arena
ladders are early-`return` guard chains and independent-`if` walkers, so that
gate never opens on them; an UN-annotated return skips the check outright
(measured). This is the machinery `fmt_util.vl:70` relies on for `nodePos`, which
is why that one AST ladder cannot drift.

### The convertibility envelope, and the two emit gaps inside it

Measured against `vl build`, not assumed. Three ladder shapes convert:

* **The early-`return` guard ladder** — the dominant arena shape. Arms may be
  arbitrarily long because each ends in `return`. The old trailing default stays,
  but becomes provably dead, so it can no longer absorb a forgotten variant.
* **The statement-position walker** — arms must end in a STATEMENT (an `if`, a
  `while`, an assignment, a call) or be EMPTY `{ }`. An empty arm with a reason
  comment is the readable spelling for "this variant is a leaf".
* **The value-position `match`** — bound to a name or as the trailing expression.
  Multi-statement arms are fine here; the arm's value is its last statement.

Two shapes are `vl check`-clean and rejected by the EMITTER. **Neither is
`match`-specific**: both reproduce identically with a hand-written `is`-chain, so
the conversion's envelope is exactly the envelope the original ladder already had
and no conversion can be blocked by anything new. Recorded because the messages
mislead a converter into reading a shape nit as a language limit:

* a **value-producing if-expression or `match` in STATEMENT position** (`if u is A
  { 0 } else { 0 }` as a bare statement; every `match` arm a bare value) →
  `emitProgram: unsupported statement in body`. Fix: end each arm in a statement,
  or spell it `{ }`.
* a **VOID-valued branch mixed with a value branch in VALUE position** (`const r =
  if u is A { xs.push(u.a) } else { 0 }`) → `emitProgram: if-expression arm is not
  a single value`, which misnames the cause: the branch IS a single expression, it
  is a VOID one. Fix: take the statement-position or early-`return` shape.

### The recommendation, ranked

1. **Convert the TOTAL-DOMAIN arena ladders to `match`, one per PR.** These are
   the ladders whose domain genuinely IS all of `Ty`, identified mechanically as
   the ones already covering every one of the 7 structural variants — **16
   (function, scrutinee) ladders across 14 functions**: `repCanonKeyGo`,
   `repElemKeyGo`, `repMvValKeyGo`, `repOfTyFlat`, `repTyScalarMask`, `rtGo`
   (`emit_rep.vl`); `tyToStrGo`, `tyEqGo` (×2 scrutinees),
   `tyIsEmitRepresentable`, `tyToEmitNameGo`, `tyToNominalNameGo`, `flatWhyNot`,
   `assignableGo` (×2), `vbUnionMemberName` (`typecheck.vl`). A natural second
   tier is the five missing exactly ONE structural variant — `substTyDeep`,
   `tyChildrenOf`, `tyReachesHole`, `tyPrintsAsRef` (all `TyPrim`) and
   `nodeArrayElemName` (`TyArray`, audit row R7) — where the conversion forces a
   real decision rather than pinning a settled one. Cost per ladder: reindent,
   spell the deliberate leaves as empty/no-op arms WITH their reason, and (once,
   done) export `TyErr`/`TyVar` from `typecheck.vl` so a file can name the two
   holes it is deliberately skipping. `repTyScalarMask` is the worked instance.
2. **Route the DESCENT walkers through `tyChildrenOf` — higher leverage per edit
   than (1), and larger blast radius.** `tyChildrenOf` (`typecheck.vl:7717`)
   already IS the shared "direct child type indices of arena entry `ix`" visitor,
   with a `TyNeg` arm and a header naming its four leaves — and it has **exactly
   one caller** (`tyReachesGo`). Meanwhile **20 of the 81 ladders are descent
   walkers** by the mechanical proxy "≥ 3 distinct child-field reads, no
   leaf-field read", the unambiguous members being the `tyReaches*` /
   `collectTyReach*` family: `tyReachesHole`, `tyReachesUnion`,
   `tyReachesEmptyHole`, `tyReachesBrand`, `tyReachesFuncD`, `tyDeeperThan`,
   `collectTyReachRegister`, `collectTyReachCloSigs`, `collectTyMembersReach`,
   `cloCallUnionMixUnrep`. Making `tyChildrenOf` one exhaustive `match` and
   routing those through it retires ~10 ladders with ONE guarded arm-set instead
   of pinning 10 separately, and it fixes gaps rather than freezing them: R10's
   `TyNeg` omissions are all in this family, and **`tyReachesHole` has the same
   one** — it descends every composite except `TyNeg`, so `!(T[])` over a
   hole-reaching `T` answers "no hole" silently. `tyChildrenOf` handles `TyNeg`
   already. Cost: it must be exported across `emit_rep.vl` / `emit_collect.vl` /
   `emit_classify.vl`, and the walkers that ALSO read a leaf field
   (`repTyScalarMask` needs `TyPrim.primName`) need a small leaf predicate
   alongside the child list; `substTyDeep` REBUILDS rather than descends and
   cannot use a child-list visitor at all. Ranked second only because it is a
   bigger change than (1) for the same guarantee, and because it does nothing for
   the renderers, key builders and classifiers that (1) covers.
3. **Leave the 58 partial ladders alone, and do not lint them.** A `match` there
   would demand 11 arms for a 3-member question, exactly as it would demand 27 for
   `nulScalarListWrapHeap`. Their correctness rests on the caller-side sentinel
   invariant, which the SAFE-LOUD rows above verify one at a time.
4. **Extend `ifChainExhausts` to the early-`return` ladder shape** — a real
   option, not taken here. It already knows how to compute arena coverage and name
   the missing members; what it lacks is a second entry point for "a run of
   consecutive `if <same place> is T { return … }` statements ending in a default".
   That would cover convertible ladders WITHOUT rewriting them, which is a much
   larger blast radius than 16 conversions and wants its own measured slice.
5. **Ruled out**: a rep change to `Ty` (a tag discriminant buys nothing `match`
   does not already give); a litunion tag helper (loses narrowing, adds a
   driftable ladder); a lint rule (58 firings, ~83% false positives); a
   test-side fixture grid per ladder-bearing entry point (the 993 sites do not
   have 993 reachable entry points, and the audit rows above show the reaching
   programs are per-ladder bespoke — it does not generalise into a harness).

### Reproducing the numbers

The scan is three mechanical passes over `compiler/*.vl` and takes seconds:
group `X is Ty<variant>` hits by `(file, function, scrutinee)`; bucket the
ladders by distinct-variant count; for each ladder with ≥ 3, print the missing
variants split into structural vs hole/exotic plus the enclosing function's tail
line. Re-run after any arena change — that is the difference between finding the
next one by sweep and finding it by accident.
