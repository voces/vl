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
| check-clean INVALID WASM, reached with a program | 27 |
| ... closed here | 26 |
| ... open (1 ladder family, reached) | 1 |
| check-clean SILENTLY WRONG output, reached | 0 |
| spurious LOUD reject of a valid program, reached | 7 ladders |
| DANGEROUS-UNPROVEN (no reaching program found) | 4 |

No silently-wrong cell was found anywhere in this sweep. Every remaining gap is
either invalid wasm (one family, below) or loud.

## CLOSED — three DANGEROUS ladders, 26 invalid-wasm cells

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

### R10. DANGEROUS-UNPROVEN (4)

No reaching program was found for these, which makes them lower-severity findings
than every row above — recorded so the next sweep starts from the analysis:

* `collectTyMembersReach` has no `TyNullable` arm while its own caller
  `collectTyReachRegister` descends one; a nullable-wrapped union at a collection
  position gets no pre-descent. Loud if reached.
* `collectTyReachCloSigs` / `collectTyReachRegister` fall through on `TyNeg`,
  which every sibling walker in `emit_rep.vl` handles. `intersectTy` consumes
  almost all negations.
* `cloCallUnionMixUnrep` (the floor for the deferred value-union-closure-result
  family) sets neither `hasScalar` nor `hasComposite` for a `TyNullable` member or
  a nested non-literal `TyUnion` member, and "no composite" means "admit".
* `exprNulScalarListKind`'s Ident arm covers param / declared local / global but
  **not the CAPTURE storage class**, which every sibling niche classifier carries.
  A missing storage class, not a missing rep, but the same silent-`null` shape.

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
* **Does not apply** to the arena ladders at all — `Ty` is a struct union
  discriminated with `is`, not a literal union, so there is no exhaustiveness
  check to lean on. The arena rows (R1, R7) are exactly where the two
  most-forgotten variants live (`TyUnion`, `TyNullable`), and the only mechanical
  net available today is the scan this audit used. An `is`-chain exhaustiveness
  check over a struct union would retire that half of the class; it is a language
  feature request, not a compiler edit.

The cheap procedural half, usable now: the two mechanical scans that produced the
denominator above take seconds and print, per ladder, exactly which of the 27
members it omits. Re-running them after any rep addition is the difference between
finding these by sweep and finding them by accident, which is how the last three
were found.
