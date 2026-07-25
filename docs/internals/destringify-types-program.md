# Destringify types — program plan

Status: **IN PROGRESS.** Started 2026-07-24. Supersedes the ad-hoc "rep adoption" slices
(#1009–#1077), which destringified type *resolution*; this program destringifies type
*representation*.

## Terminal condition (checkable, not aspirational)

> No type-name string is used as a **key** or to make a **structural decision**.
> Strings survive only for (a) human-facing rendering — diagnostics, hover, `--json`; and
> (b) genuine **nominal identity** lookup, i.e. a declared name → its arena type.

Everything else keys on an arena type index (`T.tys`) or on `repCanonKey`.

Two consequences worth stating, because they are the ones people get wrong:

- `tyToStr` is **not** a target. 160 uses, almost all diagnostics. It stays.
- `structIndexByName("Cat")` is **not** a target. A declared name *is* the identity; that
  lookup is correct by construction. The target is only where a type's *structure* is
  re-derived from a rendering.

## Why this is worth doing (the evidence)

Every bug family this codebase has fought for months is one defect wearing different hats:
a type gets rendered to text, the text is compared or used as a key, and two structurally
identical types render differently (or two different types render the same).

- `$fnsig` twin functypes — three producers must agree character-for-character; when they
  don't, iso-recursively distinct types and a runtime cast failure.
- The same-fieldset twin family (#978/#996/#1041 and every `shapeFieldTypeCompat`
  refutation arm accreted to patch it) — all retired once resolution went structural.
- #1069: `emitIs` compared `#anon0` against `{foo:string}` with `==` and silently answered
  NO. **Outside** the resolver layer entirely — proof the disease is not confined to the
  area we had been working.

## The current state, measured

`slotCanonKey` is the tell — the function at the heart of every arena-based fix:

```vl
function slotCanonKey(si: i32): string {
  const nm = sNames[si]              // a STRING
  let di = cUserTypes[nm] ?? -1      // parse it back into a type
  ...
  return repCanonKey(di)             // ...then compute the structural key
}
```

The table is a table of *names*; the arena is a resolver layered over it. Resolution is
structural, storage is not.

Type-name-keyed tables (12 of the 34 `string[]` tables in `emit_state`):

| table | refs | layer |
|---|---|---|
| `sNames` | 93 | struct rows |
| `rlElemName` | 84 | ref-list slots |
| `mvValName` | 49 | map-value slots |
| `uVariants` | 49 | union variants |
| `sFieldElemName` | 39 | struct field element types |
| `unNames` | 38 | union names |
| `uFieldElemName` | 25 | variant field element types |
| `cloSigKeys` | 24 | `$fnsig` keys |
| `fRetRArrElem` | 20 | fn return ref-array element |
| `unMemberSet` | 17 | union member sets |
| `sAnonCanon` | 12 | anon-row canon keys |
| `gaeBases` / `gaeParams` | 14 | generic-alias expansion |

## Phases

Each phase is run-diff gated (#1019 discipline: byte-identity is not the gate once
behaviour can change), and each ships independently.

### D0 — arena-index sidecars (foundation, byte-identical, no consumer)

Record, at **intern time**, the arena type index each row denotes:
`sTyIx[]` ∥ `sNames`, `rlElemTyIx[]` ∥ `rlElemName`, `mvValTyIx[]` ∥ `mvValName`,
`unTyIx[]` ∥ `unNames`.

At intern time the minting node is in scope, so this **also covers the rows whose name does
not resolve** — the `#anon` literal rows that `slotCanonKey` currently falls back to
`sAnonCanon` for. Unconsumed → byte-identical. Mirrors #1009 (`nodeRepTyIx`) and #1022
(`sAnonCanon`), both of which shipped byte-identical and then unlocked their consumers.

### D1 — `slotCanonKey` reads the sidecar — SHIPPED, and the plan above was wrong

Landed as: the sidecar owns the rows **a name cannot resolve** (the `#anon` literal shapes),
and `sAnonCanon` is deleted. `slotCanonKey` no longer consults any key-string table.

**The sketch above — "becomes `repCanonKey(sTyIx[si])`", i.e. authoritative over the whole
function — is refuted.** Ahead of the name path it fails 5 suite cases (nullable-struct list
fields, variant reflist fields). The recorded index is the type as of **intern** time; the
name path re-resolves at **query** time; and for name-resolvable rows those disagree once the
arena mutates (`holeMemberTy` grows a hole's shape in place and bumps `tyMutEpoch`). This is
the same shape as the phase-0 probe's 141 benign divergences — a recorded arena type and a
resolver's answer are **not interchangeable by default**.

**Consequence for the later phases, which assumed otherwise:** an arena-index key is only a
drop-in replacement for a name key where the type cannot mutate after recording. Before D2/D3
make an index authoritative, either (a) re-record on mutation, (b) record a *canon key* rather
than an index where the value must be stable, or (c) prove the family is mutation-free. Pick
one deliberately per slice; do not assume.

### D2 — the computed-name interning layer — ATTEMPTED, and it refuted the plan

`rlInternName` / `rlSlotByName` / `mvCanonValName` mint a canonical name by string surgery
and key a slot on the resulting text. The plan said: those canonicalisations exist to make
two spellings of one rep collide, which is `repCanonKey`'s job, so re-key on the canon key
and the helpers delete themselves.

**Measured — half right, and the wrong half matters.**

- *Additive* probe (canon-key consult LAST, after every existing text fallback):
  corpus **byte-identical**, suite green. So on the corpus the canon key never contradicts
  the string surgery.
- *Replacement* (delete the surgery, keep exact-match + canon key): **4 suite failures** —
  `atom-2d-array`, `closure-value-2d-scalar-array-result`,
  `closure-value-2d-nulstring-array-result`, `nested-array-closure-result`.

The cause is not a gap in the canon key; it is a **category error in the plan**.
`rlCanonElemName` folds `boolean[]` and a litunion `K[]` to `i32[]`, and `(string|null)[]`
to `string[]`. Those are **structurally distinct types that share one WasmGC wrapper** —
`i32[]`, `boolean[]` and `K[]` all ride the `lTypeIdx` i32-list backing. The surgery encodes
**rep equivalence**. `repCanonKey` is a canonical key for the **arena type**, so it keeps
them apart — correctly as a type key, wrongly as a slot key.

**The correction, which applies to D3 as well:** the slot layers are keyed on
REPRESENTATION, not on type. Destringifying them needs a **rep key** — a structural
type→rep fold (i32-backed leaves → the i32-list wrapper, string-backed → the string-list
wrapper, litunion → its boxed atom) — not `repCanonKey`. Building `repElemKey(ty)` is the
real D2, and it is a genuine piece of design rather than a re-keying. Until it exists, the
string surgery is *load-bearing* and must stay.

This is the second time this program's plan has been corrected by measurement (see D1). The
pattern is the same both times: an arena artifact that looks like a drop-in for a name key
is answering a subtly different question.

**SHIPPED — `repElemKey(ty)`, the rep key.** Built as the correction prescribed: a structural
type→rep fold in `emit_rep`, and `rlInternName` / `rlSlotByName` re-keyed on it (the deleted
`rlCanonElemName` string-surgery *key*). The fold, arm by arm:

- an i32-backed leaf array (`i32[]` / `boolean[]` / litunion `K[]` / `(boolean|null)[]` /
  `(K|null)[]` — `tyIsI32LeafElem`) → one `$rlI32L` token; a string-backed leaf array
  (`string[]` / `(string|null)[]`) → one `$rlStrL` token (the shared `lTypeIdx` / `$mkListIdx`
  wrappers);
- a MIXED union softens its litunion atoms to `string` (`repCanonKeyGo`'s arm, same niche
  guard) — `K0|i64 ≡ string|i64`;
- **a DECLARED struct keys on its nominal slot** (`repSlotOfTyDecl`), so declared twins
  `type A={v:i32}` / `type B={v:i32}` stay in distinct ref-list slots
  (`structural-twin-reflist-dedup.vl`); an **inline** shape is expanded structurally — its
  arena index is minted fresh per spelling, so an index key would disagree between the intern
  and the lookup (fuzz `(K0 | {w:i32})[] | string` proved it). This nominal/structural split
  is the piece the "just use `repCanonKey`" plan missed on the *struct* end, exactly as the
  array folds are the piece it missed on the *list* end.

Method (the D1/D2 discipline): an **additive probe** first — `rlSlotByName` computed both the
text answer and the `repElemKey` answer on every lookup and reported disagreements; **zero**
over the corpus + **50,400** fuzz programs (seeds 1–14 × depths 4–6 × {plain, `--declared`} ×
300) was the precondition for the replacement. Corpus stays **byte-identical**; the four
reverted-D2 tests pass.

One residual, scoped honestly: the string surgery survives as `rlElemStoredName` for the
element's stored *name* (not its key). Downstream name-consumers that have not yet been
destringified — the `is`-narrowing emit's litunion classifier, `mapValNameOf`,
`structIdxOfElemName` — still read `rlElemName` and need the emit-canonical spelling (a raw
`K0|{w:i32}` makes the `is`-emit pick the union-variant path and fail). The *key* is
destringified; retiring the *name* column is D5's job, once those consumers move to the arena.

### D3 — the `$fnsig` layer — SHIPPED (#1081)

`sigKeyOfTy(funcTyIx)` walks the arena `TyFunc` spine, classifying each leaf with the same
`annParamKind`/`annRetKind` the string path used — byte-identical to
`annSigKey(tyToEmitName(funcTyIx))` by construction, so structural decisions come from the arena.
Replaced `cloCallSigKey`'s two `nodeTyName → annSigKey` sites. `annSigKey`/`unionArmSigKey` stay
for the string-only callers (union-arm spellings, the annotation path) — D5 residuals. Corpus
byte-identical; additive probe 0 disagreements; fuzz A/B identical.

#### D3 (original sketch)

`cloSigKeyExt` / `annSigKey` / `cloSigKeys`. Three producers must agree on the key text; the
`repSigSlotTokOfKind`→`repStructSlotRep` canon (#1019) already fixed the slot-digit half.
Re-key on the arena signature. **ABI-affecting** — run-diff, not byte-identity, and the
corpus + fuzz A/B are the gate.

### D-UNION — the union MEMBER-SET layer (`unMemberSet`) — foundation + batch 1 SHIPPED

`unionMemberSetOf(name)` hands out a pipe-joined member STRING and ~21 consumers then
`splitUnionAtoms` it and re-classify each atom **by its rendered text**
(`nameIsMap(atom)`, `nameIsClosureArray(atom)`, `valueAtomKind(atom) == 11`,
`strContains(refArrElemName(atom), "=>")`). That per-atom classification-by-render is the
disease; an atom that is a **declared variant name** feeding `variantIndexOf` is nominal
identity and is *not*.

**Foundation (byte-identical, no consumer).** `unMemTys[]` ∥ `unMemTyStart`/`unMemTyCount`,
parallel to `unNames`: each row's ARENA member type indices, recorded at all three
registration sites (`registerValueUnionName`, `registerInlineUnion`, `collectU`) by
resolving each member atom nominally (`cUserTypes`) then through the checker's annotation
grammar (`resolveAnnot`). Pad-on-push like `recordSTyIx`, so a missed site self-heals to
"uncovered" and its consumers keep the legacy name path.

**ABI note.** The union box-tag scheme depends on member ORDER (`unVarStart`/`unVarCount`
slice `uVariants`; `markValueUnionAtoms` mints value boxes in order). The recorder stores
one index per `splitUnionAtoms` atom **in atom order**, and every consumer indexes the
member slice in lock-step with the atom array (guarded by a `length` equality check), so no
structural iteration can reorder anything.

**Batch 1 — six consumers migrated**, each answering an "is there an arm of shape X"
question structurally: `unionMapArmName` / `unionHasMapArm` (`TyMap`),
`unionHasClosureArrayArm` (`TyArray` over `TyFunc`), `unionHasClosureArm` +
`unionClosureArmName` (`TyFunc`), `unionHasMapArrayArm` (`TyArray` over `TyMap`),
`calleeIsUnionElemFieldClosure` (`TyArray` whose element structure REACHES a `TyFunc` — the
arena dual of the deliberately-conservative `strContains(elem, "=>")` arm test). Two of the
name path's guards fall out for free: `nameIsMapMemberUnion`'s exclusion (a map-member union
is a `TyUnion`, never a `TyMap`, however it renders) and `nameIsClosureArray`'s
nullable-element exclusion (a `TyNullable` element is not a `TyFunc`).

Method: an **additive probe** on all six, comparing the name path's first-match member INDEX
with the arena path's, **plus a `-misalign` and a `-uncov` marker on every path** so an
uncovered row cannot masquerade as agreement. **Sabotage-verified per site** — inverting a
probe's comparison must make it fire. Three sites (`MapArm`, `CloArm`, `CloArmNm`) fire on
the corpus; `CloArr` (6) and `MapArrArm` (4) needed a per-site inversion because the marker
aborts the emit and a hotter probe fired first; `calleeIsUnionElemFieldClosure` fired on
**nothing in the corpus** — a classifier with no test coverage at all, now covered by
`tests/cases/unions/union-array-arm-elem-closure-field-map-call.vl`.

**Batch 2 — the `unionArmPath*` family's five callers migrated.** The deferred question
was whether the field codes the walk consults (5 ref-list, 14 closure, 15 nested-struct,
16 union-box, 19 map, 22 nullable-closure) encode *structure* or *lowerability* — the
latter being the phase-3-arm-4 (#935) case no structural re-keying can replace. **Measured:
structure, for these five questions.** The codes as a whole ARE lowering decisions (code 5
vs 4/6/25/26/27 is which WasmGC wrapper the list rides), but every leaf test the walk
performs factors through the element/field *type*, so the answers come straight off the
arena spine and **no arena→field-code bridge is needed**:

| the walk's test | the arena's answer |
|---|---|
| `code != 15` mid hop | the field is a `TyObj` (or a `TyNullable` over one) — anything else has no field to follow |
| `code == 19` leaf | the field is a `TyMap` (a nullable map is code 29, so the leaf is deliberately NOT peeled) |
| `code == 5 && nameIsMap(elem)` | a `TyArray` over a `TyMap` |
| `code == 5 && annArrowAt(peelGroupParens(elem)) >= 0` | a `TyArray` over a `TyFunc` (a nullable-closure element is a `TyNullable`, excluded on both sides) |
| `code == 14 \|\| code == 22` | a `TyFunc`, bare or under one `TyNullable` |
| `code == 16 && unionHasClosureArm(elem)` | a `TyUnion` with a `TyFunc` member |

One shared walk (`tyArmPathLeaf`) plus five leaf predicates replaces the per-caller
`structIndexByName` / `variantIndexOf` re-resolution; `unionStructArmMapListElemIndex`'s
indexed-root hop drops `nameIsRefArray(arm)` + `refArrElemName(arm)` for `tyArmElem` (a
`TyArray` arm's element). Migrated callers: `unionStructArmMapFieldMember`,
`unionStructArmMapListElemIndex`, `identRebindUnionArmClosureField`,
`calleeIsUnionArmClosureMember`, `calleeIsUnionArmCloArrayIndex`. The `unionArmPath*`
functions stay as the uncovered-row fallback.

Method: an additive probe on all five, comparing the name answer with the arena answer per
atom, with `-uncov`/`-misalign` markers so an uncovered row cannot masquerade as agreement.
**0 disagreements** over the corpus + **50,400** fuzz programs; corpus **byte-identical**.
**Sabotage-verified per site** — MapArm 13, MapList 3, Clo 3, HasClo 1 corpus programs.
`calleeIsUnionArmCloArrayIndex` fired on **nothing** in the corpus even under a per-site
inversion: its own dedicated case (`variant-closure-array-field.vl`) no longer reaches it,
because `exprIsClosure` resolves `t0.f[0]` first when the union local comes from a call or a
literal. The FUZZER reached it (6 of 50,400, `--declared` and plain), and that shape is now
pinned as `tests/cases/unions/union-box-field-arm-closure-array-index-call.vl` — the union
must arrive as a **union-BOX FIELD read** (`const t0 = v.f`) for the conservative classifier
to be consulted at all.

**Batch 3 — the `mark*` REGISTRATION functions and the `*ArmSlot` resolvers, six of nine
migrated, two REFUTED, one measured DEAD.** This is the batch that touches the box-tag
**ABI**: `markValueUnionAtoms` mints the per-rep value boxes in ATOM order, so it consumes
the (atom-order-aligned) `unMemTys` slice in lock-step behind the length guard and the loop's
shape is untouched. Migrated:

| site | was | now |
|---|---|---|
| `markValueUnionAtoms` | `valueAtomKind(atom)` + `nameIsLitUnionType(atom)` | `unMemAtomKind(m)` + `tyIsLitUnion(m)` |
| `markRefArrayArms` | `valueAtomKind(a) < 0 && nameIsArray(a)` | `unMemIsRefElemArray(m)` |
| `markMapUnionArms` | `nameIsMap(a)` | `unMemIsMap(m)` |
| `unionHasMapArmSlot` | `nameIsMap(a)` | `unMemIsMap(m)` |
| `unionListElemMapFieldMember` | `nameIsRefArray(a)` + elem-struct field code 19 | `tyArmPathIsMap(tyArmElem(m), [f])` |
| `unionRefArrayArmSlotForMapElem` | that gate + `nameIsMap(refArrElemName(a))` | `unMemIsMapArray(m)` |

Two new arena predicates carry it. `unMemAtomKind` is `valueAtomKind`'s structural dual in
the same code space and the same test ORDER (a `TyPrim` answers on its own `primName`; the
i32-backed leaf array is asked FIRST, ahead of the per-width `f64`/`i64`/`f32` lists and the
string-backed leaf, mirroring `valueAtomKind`'s litunion-array arm sitting ahead of them).
`unMemIsRefElemArray` is the D2 reading of "ref array": a `TyArray` whose element does **not**
ride a scalar-leaf list backing (`tyIsI32LeafElem` / `tyIsStrLeafElem`, now exported from
`emit_rep`, plus the three numeric widths). **Only the arm-SHAPE test moves.** Every slot
comparison stays where it is — `rlSlotByName` is already `repElemKey`-keyed (D2) and
`mvCanonRepOf` is already canonical, and a slot is a REP question, not a type question.

**REFUTED: `nameIsRefArray` is not a shape predicate.** `unionHasRefArrayArmSlot` and
`unionNestedArrayArmSlot` were migrated to `unMemIsRefElemArray`, swept clean over the corpus,
and then the **fuzz probe found 2 disagreements in 50,400 programs** (seed 7 d6 plain, seed 13
d6 `--declared`) — both the shape `(i32,i32,i32) => {f: i32}[] | f64`. `nameIsRefArray` is a
strict SUBSET of "a `TyArray` over a non-scalar leaf": it *also* requires the element to be
NAMEABLE by the reflist layer (`structIndexByName` / `shapeElemDeclaredStructIdx` /
`variantIndexOf` / the `unNames` scan), which is **intern state, not structure**. An
inline-shape element array reached only through a closure result is structurally a ref array
whose spelling never interned a struct row, so the name path says NO and `refArrElemName`
answers `""`. With the arena predicate the slot compare degenerates to
`rlSlotByName("") == -1`, which MATCHES a caller's `slot` of -1 and would box under a tag no
producer interned. Both witnesses are loud rejects today, so nothing broke — and both sites
are back on the name path. **The same predicate is exact at `markRefArrayArms`**, whose gate
is `nameIsArray` (spelling only, no intern state); that one stays migrated. This is the D1/D2
lesson wearing a third hat: check *which* question the site is asking, and note that "the
corpus swept clean" was not enough here — only the fuzz leg found it.

**`unionHasCollapsedStringMapArm` is deliberately NOT migrated — it is DEAD.** A sabotage
that fails the compile whenever the function is *entered at all* fires on **0** of the 1,234
corpus programs and **0** of 50,400 fuzz programs; its own dedicated fixture
(`map-closure-return-map-member-union.vl`) reaches `unionHasMapArmSlot` and matches there, so
the collapsed-arm fall-through behind it never runs. Six hand-written attempts at the shape
(`{[string]: K0}` into a `{[string]: string} | X` in binding / arg / return / element
position) also failed to reach it — they mis-narrow *before* the box site, a pre-existing
silent-mismatch family unrelated to this program. With no reachable shape there is nothing to
sabotage-verify against, so migrating it would ship unmeasured; it stays on the name path.
(Its `mapValNameOf(a) == "string"` verdict is not a candidate in any case: it asks about the
checker's RENDER of a litunion map value — the very information the arena keeps and the name
loses.)

Method: an additive probe on all nine sites (both answers computed, the NAME answer kept, a
sticky `emitFail` marker on disagreement) — **0 disagreements** over the corpus (1,234 files,
including `std/` and the compiler's own source) for every site, and **0 over 50,400 fuzz
programs for the six shipped sites** (the only 2 fuzz disagreements were the refuted
`nameIsRefArray` pair above). Sabotage-verified per site, gated on the arena leg actually
having run: `markValueUnionAtoms` 433 · `markRefArrayArms` 433 · `markMapUnionArms` 433 ·
`unionHasMapArmSlot` 25 · `unionHasRefArrayArmSlot` 19 · `unionNestedArrayArmSlot` 4 ·
`unionRefArrayArmSlotForMapElem` 1 · `unionListElemMapFieldMember` 2 ·
`unionHasCollapsedStringMapArm` **0** (the dead one above). Corpus **byte-identical** and
run-identical, 66-case battery 0 diffs — so the ABI/order invariant held.

**The gate channel was sabotage-verified too**, and it found a blind spot worth recording.
Swapping `unMemAtomKind`'s i64/f32 list kinds reddens it (3 byte-diffs + 1 build failure);
declining struct-element arrays in `unMemIsRefElemArray` reddens it hard (11 build failures,
via `markRefArrayArms`).
But **breaking `unionListElemMapFieldMember`'s arena leg outright produces ZERO corpus diffs**
— that classifier is a narrowing-blind frame-scratch *over*-reservation, and on the corpus
something else already reserves what it would. Its migration therefore rests on the probe's
answer-equality (2 corpus programs + fuzz), not on the output gate: the D-RET lesson (a green
A/B is not evidence for what the channel cannot express) applies to a *consumer* here, not
just to a generator.

**Still string-classified (the rest of the layer, honest scope).**
`unionRefArrayArmSlotForElemAtom` (atom-EQUALITY against a rendered element set),
`unionClosureArrElemUnion` (returns an element NAME the name-keyed reflist layer consumes),
`unionHasRefArrayArmSlot` / `unionNestedArrayArmSlot` (refuted, above — they need a predicate
that fuses shape with reflist intern state, which is D5's territory, not a shape dual), and
`unionHasCollapsedStringMapArm` (dead, above). `emitUnionCoerce`'s atom ladder moved in batch
4, below; its ALIAS EXPANSION (`unionMemberSetOf` at the head of the function) deliberately
did not — it hands a member-set STRING to the arms further down that still classify text, and
retiring it is the same job as retiring the name column itself (D5).

**Correct as-is, deliberately untouched:** `unionMemberCount(unionMemberSetOf(…)) > 1` (a
count), `structUnionNullCmpName` (`unionHasAtom(set, "null")` + a non-null count — `null` is
a keyword, not a rendered shape), `setNarrowFromCondElse` / `currentStructNarrowSetOf`
(narrow-SET algebra over the narrowing table, whose keys are member-set strings by design).

**Batch 4 — the union-BOX ABI (`emitUnionCoerce`'s atom ladder and the tag selectors
around it) — SHIPPED.** The highest-risk consumer batch: these predicates do not ask "is
there an arm of shape X", they decide **which tag a value is boxed under**, so a wrong
answer is a silent wrong answer at the matching `is` (or a cast trap), not a loud reject.

**Every path enumerated first**, because that is what the two earlier parks in this program
were caused by not doing. The layer is `unionHasAtom(set, <atom>)` — `splitUnionAtoms` the
member set, compare each atom to a FIXED keyword — reached from **16 decision sites** (28
calls), fifteen in `wasmEmit.vl` and one in `emit_classify`:

| tag | site | the decision |
|---|---|---|
| `UCI` | `emitUnionCoerce` | a bare int boxes `i64` when the union has no `i32` arm but an `i64` one |
| `EQA` | `unionEqAtomOf` | the same i32/i64 choice for the CONCRETE side of a union `==` |
| `UCF` | `emitUnionCoerce` | a float literal boxes `f32` when the only float arm is `f32` |
| `UCL` | `emitUnionCoerce` | an int-element list adopts the union's `i64[]`/`f64[]`/`f32[]` arm (+ `pendingListKind`) |
| `UCLF` | `emitUnionCoerce` | the list twin of `UCF` |
| `ULAE` | `emitUnionListLitViaRefArm` | the union's OWN value-atom list arm wins over the ref-arm route |
| `ULA0` | `emitUnionListLitViaRefArm` | an empty `[]` — route only when NO value-atom list arm could claim it |
| `EQH` | `emitUnionConcreteEq` | the other operand's rep has an arm (else statically unequal) |
| `EQS` | `emitUnionUnionEq` | both sides carry `string` (the `!aUsed` loud reject) |
| `LII` / `LIH` | `emitUnionLitIs` | the literal's rep atom, and whether an arm carries it |
| `SFN` | `emitOmittedFieldNull` | a code-16 field omits to `null` only when `null` is a member |
| `MVN` | `emitMapGetOr` | a boxed map value carrying `null` takes the null-TAG `??` path |
| `CUN`/`KUN`/`MUN` | `emitCoalesce` | the ident / call / union-field `??` null-tag paths |

`unMemHasAtom(name, atom)` is the structural dual, tri-state (1 / 0 / **-1 uncovered**), and
`unionHasAtomTy` is the ladder-faithful wrapper: the arena decides where the row is covered,
the member-NAME scan is the untouched fall-through.

**`EQA` is in the batch because a read/write PAIR must not straddle two legs.**
`unionEqAtomOf` is the concrete side's atom classifier — the read-side mirror of
`emitUnionCoerce`'s `UCI` arm, running the identical `!has("i32") && has("i64")` test — and
its answer is handed straight to `EQH`. Migrating the write side (`UCI`) and leaving the read
side on the name path would mean that on any input where the two legs ever disagreed, a value
would be BOXED under one tag and COMPARED under another: a silent wrong `==`. Nothing in the
corpus or the fuzz corpus makes them disagree, so this is a latent asymmetry rather than a
live bug — but introducing one deliberately is exactly the class of defect this program
exists to remove, so both halves move together.

**Which axis each site is on, decided before the swap.**
- **D2 (type vs REP) — all 16, and the answer is "keep it a TYPE test".** The tempting reuse
  is `unMemAtomKind` (already in the tree, batch 3). It is **wrong here**: it folds `i32[]`,
  `boolean[]` and a litunion `K[]` onto one kind (they share the `lTypeIdx` i32-list
  backing), and these callers turn the atom into `scalarTagOf(atom)`. A fold would hand back
  a tag no producer interned for the value. So `unMemHasAtom` is deliberately EXACT: a
  `TyPrim` with the atom's own `primName`, and for `X[]` a `TyArray` over exactly that
  `TyPrim`. A `(i32 | null)[]` element (`TyNullable`) and a litunion element (`TyUnion`)
  answer NO on both paths, as they must. This is the D2 lesson run in the opposite
  direction from #1094's: there the existing keys were too COARSE, here the tempting one is.
- **D1 (timing).** `unMemTys` records an INDEX at registration and every read re-derives from
  `T.tys[m]` at query time, so an in-place arena mutation (`holeMemberTy`) moves both legs
  together — the property D1's refutation showed a frozen key does not have.
- **D3′ (structure vs intern state) — audited, and the sentinel is clean.** The failure mode
  in #1093's refutation was a degenerate `-1` matching a caller's `-1`. Here the arena leg's
  miss value is a tri-state `-1` consumed only by `unionHasAtomTy`, which turns it into "use
  the name path"; no caller ever sees it. The predicate carries **no** intern state (unlike
  `nameIsRefArray`): it reads the arena and nothing else.

**Method + measurements.** Additive probe at all 16 sites at once (both answers computed, the
NAME answer KEPT, an **accumulating** tag set reported once at the end of `emitProgram`):
**0 disagreements** over the 1,265-file corpus (`tests/cases` + `std/` + the compiler's own
source) and **0** over **25,200** fuzz programs (seeds 1–14 × depths 4–6 × {plain,
`--declared`} × 300). Coverage came from the **inverted** build, never from the probe's own
report channel (method note 7). Corpus **byte-identical** AND run-identical (status +
stdout); 66-case battery 0 diffs; fuzz A/B identical (2,248 shape lines both sides);
self-compile wall clock 1,309 ms → 1,320 ms (min of 7 interleaved rounds).

**Sabotage-verified per site**, one all-sites inversion, gated on the arena leg having
actually answered so "fired" means the MIGRATED leg ran — corpus / fuzz programs:
`UCI` 137/1229 · `UCF` 58/1443 · `MVN` 23/436 · `ULAE` 17/385 · `UCL` 12/210 · `CUN` 12/0 ·
`UCLF` 4/83 · `EQS` 4/0 · `LII` 3/0 · `LIH` 3/0 · `ULA0` 2/0 · `MUN` 2/0 · `KUN` 2/0 ·
`EQH` 2/0 · `EQA` 2/0 · `SFN` 1/0. **No site had zero coverage**, so none was left unmigrated
for want of evidence — the fuzzer reaches only the six `emitUnionCoerce`/map shapes, and the
corpus carries the other ten.

**Gate-channel sabotage, per site.** An arena leg whose verdict is INVERTED exactly where it
answers (every other migrated site left correct) reddens the corpus A/B for **15 of the 16**:
`UCI` 133 byte + 116 run-status + 14 stdout · `UCF` 58 + 56 + 1 · `MVN` 11 byte + 12 build +
15 run · `CUN` 12 build + 12 run · `ULAE` 8 + 2 build + 8 run + 2 stdout · `UCL` 3 + 3 build +
3 run + 3 stdout · `UCLF` 1 + 3 build + 3 run + 1 stdout · `LII` 3 + 2 stdout + 1 run ·
`LIH` 3 + 2 stdout + 1 run · `EQH` 2 + 2 stdout · `EQA` 2 + 2 stdout · `KUN`/`MUN` 2 build +
2 run each · `ULA0` 1 + 1 run · `SFN` 1 build + 1 run. All 15 `wasmEmit` sites inverted at
once: **153 BYTEDIFF + 33 build-status**, **166 run-status + 14 stdout**.
**`EQS` produces ZERO corpus diffs when deliberately broken** — its condition is
`… && … && !aUsed`, and on the whole corpus `aUsed` is already true wherever it is reached,
so the union tests cannot change the outcome. Stated plainly: **the probe (4 corpus firings,
0 disagreements) is that site's only gate.** The risk it carries is bounded — a wrong answer
there can only add or drop a *loud reject* (`union string == but array type not collected`),
never mis-tag a box.

**Sidecar lifetime (method note 7).** `unMemTyStart`/`unMemTyCount`/`unMemTys` are now emptied
at the **top of `emitProgram`**, not only in `collectU`, for the reason D-MAPVAL paid four
trapping suite cases to learn: the rows are `T.tys` indices and a fresh program re-mints the
arena. Gated with a **shared-instance** run (`vl run --batch`, 307 union/struct/map/object/
array programs in ONE compiler instance): 307/307 outputs, 0 errors, 0 traps, 0 diffs vs
master. Measured honestly: removing the new reset leaves the 1,949-case suite and that batch
**green**, so on today's surface `collectU` does run first and the reset is a *precaution* —
but the sidecar's correctness should not rest on collect-pass ordering.

**Still on the name path after batch 4 (12 raw `unionHasAtom` calls).** `emitUnionUnionEq`'s
cross-union arm scan (`unionHasAtom(rname, lAtoms[ai])` — atom EQUALITY between two rendered
member sets, whose result is then fed BACK as `scalarTagOf(arms[k])`; its dual needs a
type-equality join, not an atom test), the eleven narrowing/classification readers in
`emit_classify` (`nulRefMapValInnerOf`, `mvUnionIsScalarNull`, `retNullableUnion`, … — the
narrowing layer, not the box ABI), and `emit_collect`'s inferred-return null test.
`exprIsUnionStrEq`'s two `"string"` tests stay too, deliberately: that is the string-scratch
FRAME reservation, and it pairs with the cross-union arm scan above — both halves of *that*
pair are on the name path, which is the same "do not straddle two legs" argument `EQA` is in
the batch for, applied in the other direction.

### D-UNION-SET — the member SET stops being a string (the set ADT) — SHIPPED

Batches 1–4 moved what the consumers ASK of each member onto the arena. They left the
**set itself** a string: `unMemberSet[u]` is a pipe-joined member list, and every
operation on it — membership (`unionHasAtom`, substring search), subtraction
(`removeAtomFrom`, string surgery, ~2.2% of a self-compile), cardinality
(`unionMemberCount`/`nonNullMemberCountOf`, a re-count), iteration (`splitUnionAtoms`,
a re-split) — serialized to that string and parsed it back. A union does not need to be
a string: `Cat|Dog` can be a data structure.

**The representation: a member REFERENCE list, plus sets as (row, mask).**
`recordUnMemTys` already split each row's set once at registration to record the arena
member types; it now records, in the same pass and the same atom order, three more
columns parallel to `unMemTys` — `unMemAtoms` (the member's VERBATIM spelling),
`unMemAtomIds` (that spelling interned after `peelGroupParens` — the identity two member
references are compared by) and `unMemKinds` (0 the `null` keyword · 1 NOMINAL, a
declared name `cUserTypes` resolved · 2 a scalar `TyPrim` · 3 a composite · -1
unresolved). **That is the only place a member set is ever split.**

A SET is then a subset of one row: `(msSetRow[s], msSetMask[s])`, a bitmask over the
row's members **in the row's recorded order**. So membership is a kind test or a bit
test, subtraction is `mask - (1 << i)`, cardinality is a bit count, and iteration walks
the row's members. Sets are interned per row (`msRowChain`/`msSetNext`), and each is
RENDERED once (`msSetText`) by joining the surviving members' verbatim spellings — which
is byte-identical to the string surgery's output, because those spellings ARE the
substrings the joined set was built from. (Rendering the recorded arena types instead
would not be: the arena's render of a declared `S` is the structural `{v: i32}` — the
D5-final lesson about using the right renderer, in the one place where getting it wrong
would silently re-key a narrowing table.)

**The ABI is safe by construction, not by care.** The box-tag scheme depends on member
ORDER; the mask is defined *over* the recorded order and no operation re-derives it, so
no structural iteration can reorder anything. `msSetOfText` — the bridge for a consumer
still holding a string — matches ONLY a row whose recorded member set IS that exact
string, so the members it hands back are provably the atoms `splitUnionAtoms` would
produce, in the same order. An ALIAS name (`N`, not `A|B`) is declined deliberately: the
legacy operations treat it as a one-atom set and expanding it would change answers.

**33 consumers migrated in `emit_classify`, in three families**, each ladder-faithful
(the structural leg answers, the string path is the untouched fall-through):
subtraction `removeAtomFromSet` (9 — the `is`/`!= null` complement narrowing, both the
`setNarrowFromCond` and `setNarrowFromCondElse` halves, the assignment narrowing, the
`??` atom classifier), `null`-membership `unionSetHasNull` (8), non-null cardinality
`unionSetNonNullCount` (1), and ITERATION `msMemberAtomsOf` (15 — every
`unionMemberSetOf`-derived `splitUnionAtoms`, including one hidden behind a **rebound
local** (`let un = …; un = ums`) that an expression-shaped grep misses, method note 9).

**Two sites measured 0-coverage and were NOT migrated** (method note 6):
`mvUnionIsScalarNull`'s subtraction tail (the fall-through of the `mvValUnionScalarNullAt`
arena chokepoint AND of a 2-member gate) and `pushPostGuardNarrow`'s RHS null test —
0 firings on 1,269 corpus files and 0 on 25,200 fuzz programs. Both keep the string path.

**Method + measurements.** Additive probe at all 35 candidate sites at once (both answers
computed, the OLD one kept, an accumulating tag set reported once at the end of
`emitProgram`): **0 disagreements** over the 1,269-file corpus and **0** over **25,200**
fuzz programs. Coverage came from a SEPARATE inverted build (method note 7) — per site,
corpus/fuzz programs where the structural leg answered: `R7` 213/2544 · `R5` 82/1873 ·
`I2` 61/673 · `R3` 39/1200 · `I4` 31/112 · `I10` 30/542 · `I9` 26/701 · `H3` 25/886 ·
`H1` 24/883 · `H4` 23/236 · `I8` 20/286 · `R2` 17/100 · `H5` 15/170 · `N1` 15/170 ·
`H9` 14/0 · `R4` 13/170 · `H8` 10/0 · `I14` 10/36 · `H6` 8/0 · `I1` 7/86 · `R6` 6/20 ·
`I6` 6/20 · `I5` 5/4 · `I15` 4/35 · `H2` 4/26 · `R10` 3/0 · `I12` 3/30 · `R9` 2/0 ·
`I3` 2/0 · `R8` 1/0 · `I7` 1/0 · `I11` 1/0 · `I13` 1/6. Corpus **byte-identical AND
run-identical**; 66-case battery 0 diffs; fuzz A/B identical (2,248 shape lines both
sides); shared-instance `vl run --batch` 605 programs in ONE instance, 649 outputs,
0 traps, 0 diffs. Self-compile wall clock 1,345 ms → 1,344 ms (min of 9 interleaved
rounds) — this slice buys the REPRESENTATION, not yet the time: the memoized
`removeAtomFrom` is still the fall-through and the text→set bridge costs the map probe
its memo used to. The time comes when the narrowing table holds set IDS instead of
strings, which is the next slice and is what the ADT exists to enable.

**Gate-channel sabotage, per site** (the structural leg's ANSWER perturbed exactly where
it answers, A/B'd against the migrated compiler over that site's own reaching set):
all-sites inversion reddens the corpus **103 BYTEDIFF + 23 build-status + 88 run-status +
19 stdout**. Per site (byte/build/run): `R3` 37/2/39 · `I9` 26/0/26 · `R5` 14/0/13 ·
`H9` 13/1/3 · `H8` 10/0/1 · `R7` 10/17/27 · `I14` 5/2/6 (+1 stdout) · `R4` 0/9/9 ·
`R6` 1/2/3 · `H5` 1/1/2 · `H6` 1/0/1 · `R8`/`R9`/`R10` 1/0/1 each · `H1` 0/1/1 ·
`H3` 0/1/1. **Seventeen sites produce ZERO output diffs when deliberately broken** —
`R2`, `H2`, `H4`, `N1` and every `I` site except `I9`/`I14`. That is not a gap in the
migration, it is the batch-3 finding again (method note 4): those consumers are
narrowing-blind PRE-PASS classifiers whose answers are conservative frame-scratch
over-reservations — `unionMapArmName`'s reversed-and-truncated member list still produced
byte-identical output on all 62 files that reach it, because something else already
reserves what it would. For those sites the carrying evidence is the probe's
answer-equality, and the probe is exhaustive there: the `I` family compares the WHOLE
atom array element-wise against the very `splitUnionAtoms` it replaces.

**Sidecar lifetime, measured rather than asserted.** The member columns and the set pool
are emptied at the top of `emitProgram`, the pool is generation-stamped (a set id that
outlives its program reads as uncovered), and `recordUnMemTys` self-heals if it observes
`unMemTys` reset behind it (`collectU`). Honest finding: **none of the three is
load-bearing on today's surface.** Removing the `emitProgram` reset, or the self-heal, or
both, leaves the 605-program shared-instance batch byte- and output-identical — and a
control marker shows why the leg cannot see it: with both mechanisms removed, a marker on
"the columns are out of sync at a query" fires on **0** of the 249 batch programs that
reach the query, while an unconditional control marker at the same spot fires on 249. So
`vl run --batch` does not in fact retain these module-level columns across programs. The
mechanisms stay because a sidecar's correctness should not rest on pass ordering (method
note 7) — but the shared-instance leg is weaker evidence for that class than it looks.

**The two "irreducible" name fallbacks, revisited.** Both exist because "the composite
nominal string lives nowhere in the arena".

- **`registerInferRetNominalUnion` (#1057) — the parse RETIRES, measured.** Its decision
  is `splitUnionAtoms(nm).length >= 2` over a name the compiler had just BUILT
  (`structUnionRetName` joins `nominalNameOfObj` over `t.uMembers`; the niche arms join a
  fixed two). The member count is therefore a property of the arena type the name was
  joined from, and `retMemCountOf` (the union/nullable spine's leaf count) now records it
  alongside the name as `inferRetMemCount` / `inferRetMemCountAt` — **this slice lands
  that producer** (foundation-style: byte-identical, no consumer). The consumer half was
  built and measured too: with `registerInferRetNominalUnion` deciding on the recorded
  count and the split kept only as the unrecorded-row fall-through, the corpus is
  **byte- and run-identical over 1,269 files**, a probe comparing the two verdicts finds
  **0 disagreements**, and an inverted build shows the decision is reached with a recorded
  count on **389** corpus programs. It is a two-line diff in `emit_collect.vl`, held as a
  hand-off because that file is being edited concurrently. What does NOT retire is the
  registration itself: the row is keyed by the composite NAME, which is nominal identity
  and legitimately a string.
- **`registerCollapsedUnionName` (#1055) — NOT reachable from this structure, and here is
  precisely why.** Its subject is a spelling that is *not a registered union row* — the
  fallback is what registers it — so a pool built over registered rows declines it by
  construction. The information it needs is how many members the SOURCE spelled *before*
  `resolveAnnot`'s `sameVariantTy` deduped them away, which exists only inside the
  checker's annotation resolution. The #1057 recipe transfers exactly (record the count
  where the members are still in hand, do not re-split the name), but the recording site
  is `resolveAnnot`'s union arm and the sidecar is per-ANNOTATION-NODE, not per-union-row:
  a different piece of work, not this one wearing a hat.

**Still string-shaped after this slice** (honest scope): `removeAtomFrom` /
`unionHasAtom` / `nonNullMemberCountOf` / `splitUnionAtoms` themselves (`emit_base` /
`typecheck` — the fall-through implementations, plus the `unionMemberCount` name-COUNT
callers), the 4 `removeAtomFrom` + 1 `unionHasAtom` sites in `wasmEmit.vl` and the 1 in
`emit_collect.vl` (both files concurrently edited — the migration is one call rename each,
`removeAtomFromSet` / `unionSetHasNull` are exported and ready), the `splitUnionAtoms`
sites whose argument is a bare type NAME rather than a member set, and the narrowing TABLE
itself, which still stores rendered set strings. (The narrowing table is done in D-NARROW
below — and it did NOT turn this into a time win: the parses it removes are ~3% of a
self-compile, so a 12-23% cut of them is around 0.5%, under the measurement floor.)

### D-RET — the inferred-return value-union VERDICT (`valueUnionRetName`) — SHIPPED

`valueUnionRetName` built the emitter-format union name (`collectRetAtoms` renders every
leaf with `tyToStr`, joined on `|`) and then asked `isValueUnionName` to **re-parse the
string it had just built** — construct-a-name-then-classify-the-text, on every inferred
return in the program. It was also the compiler's single largest string cost: 8.4% self
plus 8.2% of all samples inside its `__str_concat__` calls (18.1% inclusive) on a
self-compile profile.

`tyIsValueUnion(er)` is the structural dual: `collectRetAtomKinds` walks the same
union/nullable spine `collectRetAtoms` walks and pushes each leaf's ATOM KIND
(`retAtomKindOf` — `valueAtomKind` over a primitive's own `primName`, or the list-atom
kind of a prim-element array; `6` for the nullable slot), and `valueUnionFromAtomKinds` is
`isValueUnionName`'s verdict over that kind sequence. The verdict now comes first and the
name is built only when the answer is yes — as the emitter's name-keyed tables' key, which
is the only thing it was ever for. The returned string is unchanged.

Why the join is transparent (the piece that makes the mirror exact): behind
`retAtomsCheap`, every admitted leaf renders to a single top-level atom — no `|`, no `=>`,
balanced groupers — so the built name's `splitUnionAtoms` atoms are exactly the walk's
leaves, in order. A composite leaf (which could render a `|`) is declined before either
path runs. The two arms that must consult a name are the ones where the *name* is the
identity: a primitive's `primName`, and `nameIsLitUnionType` for a prim-spelled list
element (`valueAtomKind` tries its litunion-array arm ahead of `f64[]`/`string[]`/`i64[]`/
`f32[]`, so the dual must ask the same question in the same order).

Method: additive probe (compute both, keep using the old answer, `tErr` on disagreement in
either direction) — **0 disagreements** over the 1,299-file corpus + battery and 25,200
fuzz programs. Sabotage-verified by inverting the predicate: it fires on 1,208 of 1,299
corpus files, with both directions witnessed (`old=yes new=no` on `i32|string` / `i32|null`,
`old=no new=yes` on a plain `i32` return). Corpus + battery A/B: **byte-identical** wasm,
identical run status/stdout; fuzz A/B shapes identical. Measured after: `valueUnionRetName`
0.0% self, 0.01% inclusive; total `__str_concat__` self 11.9% → 5.2%; profile samples
−15.8%.

The sibling `litUnionArrayValueUnionRetName` gets a structural **pre-decline** only
(`tyUnionHasLitUnionArrayMember` — no litunion-array member, no name to build). Its atoms
come from `tyToEmitName`, whose alias-preserving grammar flattens nested unions into a
member name, so the atom-level dual of THAT renderer is a separate piece of design (the D2
lesson: a different renderer asks a different question); its rendered `hasLitArr` stays the
verdict.

### D-CLASSIFY — the name-CLASSIFIER layer (batch 1 SHIPPED)

The diffuse leg: ~9% of a self-compile's self-time sits in functions that PARSE a rendered
type name character by character (`splitUnionAtoms`, `nameIsRefArray`, `refArrElemName`,
`nameIsI32Array`, `nameIsMap`, `annArrowAt`, …). No single hotspot — the cost is the
*drivers* that call them, and the hottest family is the `letIs*` BINDING classifiers, which
re-parse a `let`'s annotation rendering on every ladder rung, per binding, per query.

**The seam already existed.** `vtKindOfType` (the value/composite-position ladder) has
consulted `repOfNode` FIRST since the repOf strangler landed: where the checker's arena
covers an annotation's shape, the descriptor decides the rep and the name ladder is skipped.
That leg is now `annRepKindOf(tyNodeIx) : VKind | null` — `null` = "the arena does not decide
this shape; keep your name ladder" — and the binding classifiers consult the SAME one, so
"what rep does this annotation have" has a single structural answer.

**Batch 1 — seven binding classifiers migrated**: `letIsArray` (`"list"`), `letIsRefArray`
(`"reflist"`), `letIsStringArray` (`"strlist"` / `"reflist"`-rejects), `letIsF32Array`,
`letIsI64Array`, `letIsF64Array`, `letIsMap` (`"map"`). Each keeps its ladder SHAPE exactly:
the arena replaces the name PREDICATES in place (accepts and authoritative rejects alike) and
the fall-through to the initializer path is untouched, so a covered annotation never changes
which arm answers — only how that arm computes. Three name tests fall out for free:
`nameIsStringArray`'s `(string|null)[]` fold and `nameIsI32Array`'s `boolean[]`/litunion
folds are the arena's list arms, and `nameIsMap`'s `nameIsMapMemberUnion` exclusion is just
"a map-member union is a `TyUnion`, not a `TyMap`". `isUName` stays a name lookup — a
declared union NAME is nominal identity, not a structural re-derivation.

Method (the D1/D2 discipline): an **additive probe** computing both answers at all seven
sites with a sticky `emitFail` marker on disagreement — **0** over the corpus (1,234 cases),
**0** over **50,400** fuzz programs (seeds 1–14 × depths 4–6 × {plain, `--declared`} × 300),
0 on the compiler's own source. **Sabotage-verified per site**, gated on the annotation
actually being arena-covered so "the site fired" means the MIGRATED leg ran: 247–572 corpus
programs per site (`letIsArray` 247 · `letIsRefArray` 477 · `letIsStringArray` 478 ·
`letIsF32Array` 468 · `letIsI64Array` 467 · `letIsF64Array` 474 · `letIsMap` 572) — unlike
D-UNION's batches, no site had a coverage gap to pin. Corpus **byte-identical** and
run-identical; fuzz A/B identical findings.

**Measured** (8 guest profiles per side, self-compile): classifier self-time **7.4% → 4.6%**;
the `letIs*` drivers **2.12% → 0.04%** combined. Wall-clock self-compile on identical source,
9 interleaved runs: min **1.276s → 1.234s**.

**What remains in this layer.** The residual classifier time is now driven by
`parenUnionArrElemName` (1.3%) and `valueAtomKind` (0.8%) — the union-element-list and
union-atom families, i.e. the D-UNION arc, not the binding ladder. The composite name tests
(`nameIsI32ListArray` / `nameIsMapArray` / `nameIsLitUnionArray`) are now called almost
exclusively from those, and `tyAnnRefListKind` / `tyAnnRefListSlot` / `paramRefArray` (~0.2%
each) are the next annotation-keyed sites — the same `annRepKindOf` seam applies to them.
The other `letIs*` members (`letIsStruct`, `letIsUnion`, `letIsNulRefArray`, …) do not appear
in the driver profile at all (< 0.05%) and were left alone.

### D4 — residual structural decisions made by rendering

The ~10 sites that decide structure by comparing rendered text
(`tyToStr(t.nInner) == "string"`, `tyToEmitName(x) != ""` used as a representability probe).
Replace with arena predicates. `tyEq` (typecheck.vl) is the model — it already decides
render-equality *structurally, without building the strings*.

### D5 (enabler) — the struct/variant FIELD-ELEMENT layer — SHIPPED

`sFieldElemName` (a field's element/target type NAME) was the **input to every slot
resolver** the field layer consults — `rlSlotByName`, `structIndexByName`,
`mvSlotOfValNameFind`, `emitUnionCoerce`. The name column cannot retire while it is the
only way to ask *"which slot does this field's element type use?"*, so this slice builds
the arena answer and moves the ref-list and nested-struct consumers onto it.

**Sidecars (byte-identical, no consumer).** `sFieldElemTyIx[]` ∥ `sFieldElemName` and
`uFieldElemTyIx[]` ∥ `uFieldElemName` — the arena type each recorded element/target name
denotes, resolved ONCE at intern time (`recordSFieldElemTyIx` / `recordUFieldElemTyIx` →
`fieldElemTyIxOfName`: nominal `cUserTypes` first, then `resolveAnnot`). Recorded at all
**14** `push` sites (12 in `internInlineShape`/`internShapeAs`/`collectGenAliasShapes`,
2 in `collectS`/`collectAnonShapes`; 2 more for the variant table). Pad-on-push like
`recordSTyIx`, so a missed site self-heals to -1 and every consumer falls through to the
name path. A synthetic `#anonN` element name resolves through neither path and records
-1 — the honest "uncovered", and (see the coverage gap below) the reason two consumers
had no coverage at all.

**Arena-input resolvers.**
- `rlSlotOfTy(ty)` — the ref-list layer is ALREADY keyed on `repElemKey` (D2), so this
  is a lookup, not new design: it answers `rlSlotByName`'s first two rungs (the
  exact-stored-name fast path, and the `repElemKeyOfName` rescan that resolves the name
  back to a type to compute exactly this key) straight from the type. The THIRD rung —
  the struct-twin NAME fallback — has no arena input and is deliberately not reproduced;
  the caller keeps its name path for the -1 answer. That is D1 leg C's **ladder-faithful**
  shape: the arena replaces the predicate in place, the fall-through is untouched.
- `structIndexOfTy(ty)` — `structIndexByName`'s twin, scanning the D0 `sTyIx` sidecar
  with the same first-match-wins order. Chokepointed as `sFieldTgtStructIdx(si, fi)` /
  `uFieldTgtStructIdx(vi, fi)` (arena leg, then the recorded name).

**Migrated — 14 consumers.** Ref-list slot: `sFieldRefSlot`, `variantFieldRefSlot`
(**RL**, **VRL**). Code-15 nested-struct target: the field default's `ref.null $S`
(**SI-DEF**), the literal seed (**SI-LIT**) and its variant twin (**VSI-LIT**), the
struct-eq recursion (**SI-EQ**), the type section (**SI-TYS**, **VSI-TYS**), the
closure-field scan (**SI-CLO**), the optional chain (**SI-OPT**), `structIndexOfExpr`'s
member arm (**SI-MEM**) and its narrowed-variant arm (**VSI-NAR**), and
`variantFieldLayoutEq`'s two twin probes (**VSI-TWA/TWB**).

**Deliberately NOT migrated, with reasons.**
- `structIndexOfExpr`'s **un-narrowed variant** arm — the arena twin exists and is used
  everywhere else, but this arm fired on **zero** corpus files and **zero** of 50,400
  fuzz programs under a per-site sabotage build. A declared variant *rejects*
  nested-struct fields and an inline-shape arm resolves through `structIndexOfExpr`'s
  struct leg first, so the arm looks unreachable on today's surface. Unverifiable ⇒
  unmigrated.
- The **map-value** consumers (`mvSlotOfValNameFind` ×4, `mvShapeOfValName` ×2) — the
  layer is PARKED (`mvValName` has several resolution paths and an earlier single-site
  probe under-covered); an arena entry point there is its own slice.
- `emitUnionCoerce`'s code-16 field name and `unionHasAtom(elem, "null")` — the union
  **boxing ABI**, the D-UNION residue.
- `ensureRefElem` / `rlInternName` — INTERN sites, which still need the emit-canonical
  stored *name* (`rlElemStoredName`, the D2 residual).
- `emit_mono`'s `sFieldElemNameAt` — it returns a type NAME as a mono key; nominal
  identity, correct as-is. Same for `sFieldUnionName` / `variantFieldElemName` readers.

**Method + measurements.** Additive probe at all 14 sites (compute both, KEEP the name
answer, marker on disagreement), gated on the arena leg actually answering so "fired"
means the MIGRATED leg ran: **0 disagreements** over the 1,236-file corpus + the 66-case
battery and **50,400** fuzz programs (seeds 1–14 × depths 4–6 × {plain, `--declared`} ×
300). Corpus **byte-identical** and run-identical (status + stdout); battery 0 diffs;
fuzz A/B findings identical (2,248 shape lines both sides).

**Sabotage-verified per site.** The marker ACCUMULATES a tag set and reports once at the
end of `emitProgram` rather than aborting at the first hit, so an all-sites inversion
reports every site reached instead of only the first — the limitation D-UNION's batches
worked around with one build per site. Per-site corpus counts: SI-TYS 79 · SI-LIT 69 ·
RL 63 · SI-MEM 62 · SI-CLO 19 · VSI-TYS 13 · VSI-NAR 12 · VRL 12 · VSI-LIT 8 · VSI-TWB 3
· VSI-TWA 3 · SI-OPT 2 · SI-EQ 1 · SI-DEF 1. Cross-checked against isolated single-tag
builds for the two rarest.

**Coverage gap found and pinned.** `SI-DEF` (the omitted-nullable-nested-struct-field
null) and `SI-EQ` (the struct-equality recursion) fired on **nothing** in the corpus.
The cause is not that the code is dead — it is that `objects/equality.vl` compares
`{pos: {x: 1}}` literals, whose nested rows are synthetic `#anonN` shapes the sidecar
records as -1, so the migrated leg was never consulted. It took an **annotated** nested
field. Pinned as `tests/cases/objects/declared-nested-struct-field-equality.vl` and
`declared-nested-struct-field-omitted.vl`; both now fire (1 file each).

**Gate-channel sabotage.** A deliberately-wrong compiler — both arena legs returning an
in-range but OFF-BY-ONE slot/row wherever they answer (and only there, so the break is
exactly as narrow as the migrated legs) — produced **53 BYTEDIFF + 29 build-status** and
**78 run-status + 1 stdout** diffs on the corpus, and the fuzz leg failed hard (the
generator no longer compiles). Both gate channels are live for this slice; the D-RET
"green A/B over a shape the generator cannot produce" trap does not apply here.

**Residual name readers (the honest D5 picture).** `sFieldElemName` is NOT retirable yet.
Its remaining non-diagnostic readers, by family: the **map-value** layer
(`mvSlotOfValNameFind` in `wasmEmit` ×4 and `emit_sections`; `mvShapeOfValName` ×2 and
`ensureRefElem` in `emit_collect`), the **union-box ABI** (`emitUnionCoerce` ×2,
`unionHasAtom(…, "null")`, `sFieldUnionName`), the **litunion classifiers**
(`sFieldIsLitUnion` / `sFieldIsLitUnionArray` — `nameIsLitUnionType` /
`nameIsLitUnionArray` over the recorded name), the **row-dedup comparators**
(`annShapeIndexOf`'s `en != bi`, `collectNestedFieldShapes`' scanner,
`shapeFieldTypeCompat`'s two `sFieldElemName` reads in `emit_rep`), the `unionArmPath*`
walkers' threaded `elem` local (5 sites), and `emit_mono`'s nominal mono key. Each is a
distinct question; none is answered by the field-element slot resolvers this slice moved.
(The litunion classifiers and `structFieldCodesEq`'s row resolution moved in D-LITUNION,
below; `annShapeIndexOf` and `shapeFieldTypeCompat` are measured-and-deferred there.)

### D-LITUNION — the litunion FIELD classifiers + the row-dedup comparators — SHIPPED

Two families that re-derived structure from a recorded field-element NAME, among the last
non-diagnostic readers of `sFieldElemName` / `uFieldElemName`.

**Migrated — 5 sites, all on the D2 (type vs REP) axis for the classifiers and the D5
chokepoint pattern for the comparator.** "Is this field ATOM-repped?" is a *rep* question,
and the D5 sidecars already record the arena type each recorded element name denotes, so
the answer is a structural test, not a re-classification of a rendering:

| tag | site | was | now |
|---|---|---|---|
| LU-S | `sFieldIsLitUnion` | `nameIsLitUnionType(sFieldElemNameAt(si,fi))` | `tyIsLitUnion(sFieldElemTyIxAt(si,fi))` |
| LU-SA | `sFieldIsLitUnionArray` | `nameIsLitUnionArray(…)` | `tyIsLitUnionArray(…)` |
| LU-V | `variantFieldIsLitUnion` (new chokepoint for `emitVariantStruct`'s code-0 arm + `exprIsLitAtom`'s narrowed-variant member read) | `nameIsLitUnionType(variantFieldElemName(vi,fj))` | `tyIsLitUnion(uFieldElemTyIxAt(vi,fj))` |
| LU-VA | `variantFieldIsLitUnionArray` (+ `emitVariantStruct`'s code-4 arm routed through it) | `nameIsLitUnionArray(…)` | `tyIsLitUnionArray(…)` |
| RD-ROW | `structFieldCodesEq`'s code-15 referenced-row resolution | `repStructRowByName(ea)` / `(eb)` | `repStructRowByTy(repFieldElemTyIx(…))`, name for the -1 |

One new arena predicate carries the array half: `tyIsLitUnionArray` — a `TyArray` whose
element `tyIsLitUnion`. It needs neither of the name predicate's two peels (a grouping paren
is not a type; exactly one array hop is taken), and the exclusions line up on both sides: a
2-D `K[][]` (element is itself a `TyArray`), a `(K | null)[]` and a `("a"|"b"|null)[]` (a
`TyNullable` element / member) all answer NO on both paths. Every site keeps the
**ladder-faithful** shape (D1 leg C): the arena replaces the predicate in place, the
fall-through to the recorded name is untouched, so an uncovered row (-1 — a plain field's ""
element, or an `#anonN` spelling) answers exactly as before.

**What deliberately does NOT move in `structFieldCodesEq`: the `ea != eb` trigger.** Equal
recorded names are a *sufficient* identity fast path. Swapping it for arena-index equality
would newly MERGE rows whose element spelling the struct table cannot name — struct/reflist
**intern state**, not structure — which is the D3′ refutation's exact shape. The probe
measured that swap too (tag `RD-EQ`, 7 corpus programs, 0 disagreements); it is left
unmigrated on the argument, not on the measurement.

**Deliberately NOT migrated, with reasons.**
- `annShapeIndexOf`'s `en != bi` element compare and its two #974 atom-vs-plain arms
  (`AS-EN` 18 / `AS-L0` 1 / `AS-L4` **0** corpus programs under sabotage): the query side is
  an annotation TEXT with **no recorded arena index**. The only arena input is `resolveAnnot`
  at query time, which MINTS arena types *inside the interning scan* — D1's timing axis at its
  worst, and it perturbs `tyMutEpoch` mid-intern. Probed with the non-minting nominal lookup
  only: 0 disagreements, but that leg covers 18 of the 144+ reached rows, and these arms are
  the #974 ABI split where a wrong answer is invalid wasm.
- `shapeFieldTypeCompat`'s `want == 0` / `want == 4` atom-identity arms (`SC0`/`SC4`) —
  **UNVERIFIABLE, 0 firings.** The `elemTy` plumbing was built and reverted. A reach-marker
  build shows the `want == 0` arm IS entered (29 corpus files) but its recorded `elem` is
  **""** on every single reach — 0 of 1,265 corpus files and 0 of 25,200 fuzz programs ever
  hand it a non-empty recorded element name, so the arena leg could never run; `want == 4` is
  not reached at all. Nothing to sabotage-verify against ⇒ left on the name path.
- `emit_collect`'s three `sFieldElemName[sfi]` reads (`mvShapeOfValName` ×2, `ensureRefElem`)
  — the map-value layer and an INTERN site needing the emit-canonical stored name (the D2
  residual). Out of scope, per D5.

**Method + measurements.** Additive probe at all 11 candidate sites at once, with the
**accumulating** marker (a tag set reported once at the end of `emitProgram`, not a sticky
first-hit abort): **0 disagreements** over the 1,265-file corpus (`tests/cases` + `std/` + the
compiler's own source) and **25,200** fuzz programs (seeds 1–14 × depths 4–6 × {plain,
`--declared`} × 300; shape output identical to master, 2,248 lines both sides). *A probe
lesson worth recording:* the first probe build also carried `?` "uncovered" coverage markers,
which — sharing the `emitFail` report channel — silently **aborted** 241 corpus builds and
5× the fuzz findings. A coverage marker that rides the failure channel is not additive; the
counts came from the inverted build instead.

**Sabotage-verified per site**, gated on the arena leg having actually answered, corpus
counts: `LU-S` 29 · `AS-EN` 18 · `RD-EQ` 7 · `LU-V` 4 · `LU-SA` 3 · `RD-ROW` 2 · `LU-VA` 1 ·
`AS-L0` 1 · `AS-L4` 0 · `SC0` 0 · `SC4` 0.

**Gate-channel sabotage.** A deliberately-wrong compiler — every migrated arena leg inverted
(and the row leg returning an in-range OFF-BY-ONE row), only where it answers — produced
**34 BYTEDIFF + 33 run-status** diffs on the corpus. `RD-ROW` was sabotaged **alone** as well,
because a row-resolution divergence could plausibly be invisible: it reddens on its own
(1 BYTEDIFF + 1 run-status, `structs/structural-twin-heap-dedup.vl`). Both gate channels are
live for every migrated site here; the D-RET blind-spot trap does not apply.

Corpus **byte-identical** and run-identical (1,265 files), 66-case battery 0 diffs, fuzz A/B
identical. The #974 atom-vs-plain row split (`types/atom-vs-plain-field-twin-rows.vl`) is
byte-identical under the migration — it lives in `annShapeIndexOf`, which this slice
deliberately left alone.

### D-MAPVAL — the map-VALUE slot layer (`mvValName`) — SHIPPED

The layer that had been parked TWICE: `mvValName` is the mv table's key, and a
single-site probe on `mvSlotOfValNameFind` once swept the corpus with 0 disagreements
and then FAILED sabotage verification — the load-bearing path was elsewhere. The
unblocking tool is D5's **accumulating marker** (a tag SET reported once at the end of
`emitProgram` instead of a sticky first-failure abort), which lets one all-sites
inversion report every site reached.

**Every resolution path in the layer, enumerated first.** Five `mvValName[i] == name`
scans, three shared inputs:

| path | where | miss answer |
|---|---|---|
| `mvShapeOfValName` | emit_classify — the INTERNER (find-or-mint) | mints a new row |
| `mvSlotOfValNameFind` | emit_classify — the loud find | `emitFail` |
| `mvSlotOfMapValNameOrMono` | emit_classify — the mono-tolerant find | `-3` |
| `mapAnnShape` | emit_classify — the annotation's map shape | `-1` |
| `mvSlotByValNameOr` | emit_collect — the element-heap resolver | `-1` |

plus two things that are *not* separate resolvers and are covered transitively:
`mvCanonValName` (the key CANONICALISER the first three run their input through — the
D2 shape, string surgery encoding rep equivalence) and `ensureRefElem` (an INTERN entry
point whose kind-3 arm calls `mvShapeOfValName` for its side effect and discards the
answer — it makes no slot decision of its own). The nine field consumers D5 listed as
residuals (`mvSlotOfValNameFind` ×4 in `wasmEmit`, ×2 in `emit_sections`, ×3 in
`emit_classify`) are all callers of these five, so migrating the resolvers in place
covers them without threading a type through each site.

**`repMvValKey(ty)` — the layer's rep key.** Neither of the two existing keys works,
and the reasons are the D2 lesson from both ends:

- NOT `repElemKey`. The ref-list layer folds every shared-wrapper leaf list to one
  token (`i32[]` / `boolean[]` / litunion `K[]` → `$rlI32L`). The mv table does not:
  each spelling interns its OWN row, and the layout dedup happens later and separately
  (`mvTwin` / `mvCanonRepOf`). Folding here would hand a caller a row whose recorded
  NAME is a different spelling.
- NOT `repCanonKey`. It expands a declared struct structurally, so `{[string]: A}` and
  `{[string]: B}` (declared twins) would collapse — yet they are distinct mv rows with
  distinct `mvValStructIdx`. A declared struct keys on its NOMINAL slot
  (`repSlotOfTyDecl`); only an inline shape expands.

The single fold it *does* perform is `mvCanonValName`'s: a litunion member of a MIXED
union keys `"string"`, same niche guard. **Strictness is the safe direction** — a key
finer than name-equality makes the resolver DECLINE (the caller falls through to its
name scan); a coarser one would hand back another row's slot.

**Sidecar.** `mvValTyIx[]` ∥ `mvValName`, recorded at intern time
(`recordMvValTyIx` → `fieldElemTyIxOfName`), pad-on-push. Both sides of a comparison
compute `repMvValKey` at QUERY time from the recorded INDEX — never a key frozen at
intern time — so an in-place arena mutation moves both together (the D1 hazard).

**A per-PROGRAM reset the name column never needed.** The sidecar's rows are indices
into `T.tys`, which a fresh program REBUILDS; the name column is merely stale text, so
`collectA`'s reset was late enough for it and is not for the sidecar. A compiler
instance that lowers several programs (`cases_wasm_test.ts` shares one) let program
N-1's rows answer a query issued before `collectA` — a stale index into a rebuilt
arena, and 4 suite cases trapped `array element access out of bounds`. `mvValTyIx` is
now emptied at the top of `emitProgram`, ahead of every collect pass, so that window
resolves to "uncovered" and every consumer keeps its name path. **The corpus A/B could
not see this**: `vl build` gives each file a fresh instance, so the corpus and the fuzz
leg were both green while the shared-instance suite was red. A third gate channel —
the suite's shared-instance driver — is the only one that expresses it.

**Method + measurements.** Additive probe at all five sites (compute both, KEEP the
name answer, accumulating marker), gated on the arena leg actually answering so
"fired" means the MIGRATED leg ran: **0 disagreements** over the 1,265-file corpus
(`tests/cases` + `std/` + the compiler's own source), **0** over **25,200** fuzz
programs (seeds 1–14 × depths 4–6 × {plain, `--declared`} × 300), and **0** over the
1,949-case suite under the probe seed. Corpus **byte-identical** and run-identical;
66-case battery 0 diffs; fuzz A/B identical (2,248 shape lines both sides);
self-compile wall clock unchanged (min 951 ms vs 952 ms over 7 interleaved rounds).

**Sabotage-verified per site**, one all-sites inversion, 137 corpus files reached:
`SHAPE` 133 · `MONO` 68 · `ANN` 52 · `FIND` 36 · `OR` 23. No site had a coverage gap,
so none was left unmigrated for want of evidence.

**Gate-channel sabotage, per site.** An arena leg answering an in-range but OFF-BY-ONE
slot — broken only where the migrated leg answers — reddens the corpus A/B for *every*
one of the five independently: SHAPE 32 build-status + 17 byte-diffs / 47 run-status +
1 stdout · FIND 2 + 11 / 12 · MONO 14 + 11 / 24 · ANN 11 + 9 / 20 · OR 1 + 15 / 15.
Unlike batch 3's `unionListElemMapFieldMember`, no site here rests on the probe alone.

**What remains in the layer.** The mv table's NAME column is not retirable: the *key*
is structural now, but `mvValName[slot]` is still READ as a type name by
`emitUnionBoxArg` / `refArrElemName` / `unionHasAtom` in `wasmEmit`, by
`nulRefMapValInnerOf` / `mvUnionIsScalarNull` / `repNameCanonKey` in `emit_classify`,
and `mvValKindOfName` still classifies the value by its spelling. Those are the D5
`sFieldElemName` situation one layer over: each is a distinct question, and none is
answered by the slot resolvers this slice moved. `mvCanonValName` also survives as the
stored-name canonicaliser (the `rlElemStoredName` residual's twin) even though it is no
longer the key. (**Update — D5-final (b), below:** every one of those readers except the
`emitUnionBoxArg` name ARGUMENT, the `nameIsRefArray` write guard and the name PRODUCERS
now answers from `mvValTyIx`, with the name path as the fall-through.)

### D5-final (a) — the ref-list ELEMENT-NAME readers (`rlElemName`) — SHIPPED

D2 destringified the ref-list slot **key** (`repElemKey`) and left the **name** column
standing for its readers — "the *key* is destringified; retiring the *name* column is
D5's job, once those consumers move to the arena". This slice moves the readers that
recover **structure** by string surgery on the stored element name. It deliberately does
**not** try to delete the column: names as strings are fine, deriving structure from a
rendering is not.

**Every reader enumerated first** (the discipline two earlier parks in this program were
caused by skipping). 30 call sites in four files read `rlElemName[slot]`; they split
five ways:

| family | the surgery | sites |
|---|---|---|
| **A** inner slot of a nested/nullable ref-array element | `rlSlotByName(refArrElemName(rlElemName[s]))` | 8 |
| **B** struct row of a struct element | `structIdxOfElemName(rlElemName[s])` (+ one `structIndexByName` after a manual `\| null` peel) | 9 |
| **C** is the element a nullable niche | `nullablePartOf(rlElemName[s]) != ""` | 4 |
| **F** the closure element's `$fnsig` | strip grouping parens, `annSigKey` the rendered signature | 1 |
| **not this slice** | the map-VALUE slot of a map element (`mapValNameOf` → `mvSlot*`, 6 sites), the concrete-VARIANT index of an element name (3), `rlSlotByName`'s own struct-twin rung, and the ~11 sites that simply **return** `rlElemName[slot]` as a name to a name consumer | — |

**Sidecar.** `rlElemTyIx[]` ∥ `rlElemName` — the arena type each slot's **stored**
spelling denotes (`fieldElemTyIxOfName`, recorded once at `rlInternName`'s push;
pad-on-push, -1 = uncovered). The *stored* name is resolved, not the raw one:
`rlElemStoredName` may re-spell (`boolean[]` → `i32[]`), and the stored spelling is what
every reader sees. Emptied at the **top of `emitProgram`** as well as in `collectA`
(method note 7): `collectU`/`collectS` run before `collectA`, and a stale `T.tys` index
traps where a stale name is merely wrong text.

**Five chokepoints, all ladder-faithful (D1 leg C — the arena replaces the predicate in
place, the fall-through is untouched):** `rlElemInnerSlot` (A: peel `TyNullable`, take
`TyArray.aElem`, `rlSlotOfTy` — the layer's own `repElemKey` lookup), `rlElemStructRow`
and `rlElemLitStructRow` (B: peel the niche, `structIndexOfTy`), `rlElemIsNulNiche`
(C: `T.tys[..] is TyNullable`), `rlElemCloSigKey` (F: `sigKeyOfTy` off the `TyFunc`
spine, D3's key). **16 of the 22 candidate call sites migrated.**

**Which axis each family is on, decided before the swap.**
- **D1 (timing).** The sidecar stores an INDEX and every read re-derives from `T.tys[ix]`
  at query time, so an in-place arena mutation (`holeMemberTy`) moves both legs together
  — the property D1's refutation showed a frozen key does not have.
- **D2 (type vs REP).** Family A's answer is a ref-list SLOT, which is a rep question —
  so it goes through `rlSlotOfTy`/`repElemKey`, the key the layer is already interned on,
  never `repCanonKey`. Families B/C/F are type questions (a struct ROW, a niche, a
  functype), and they stay exact.
- **D3′ (structure vs intern state).** Every arena leg's miss value is consumed only by
  its own chokepoint, which turns it into "use the name path"; no caller ever sees it. In
  particular `rlSlotByName` misses with -1 and A's arena leg *also* returns -1 on a miss —
  but the -1 is swallowed by the chokepoint before any slot comparison, so the degenerate
  `-1 == -1` collision that refuted `nameIsRefArray` in D-UNION batch 3 cannot arise.

**Read/write pairing (#1095's lesson), and it decided the batch boundary.** The families
each contain both halves of a pair, and both halves move together:
`mAssignTypeIndices`'s `rlSig` + `rlElemHeap` (A-SIG9/A-HEAP9, B-SIG/B-HEAP) DECIDE which
WasmGC heap a slot's element gets — the **write** — while `emitArr` / `refElemValueCtx` /
the indexed-store / `.push` sites (A-LIT9, A-CTX9, B-LIT, B-ST, B-PUSH) **read** the same
resolution to build and store elements, and `structListPopGetElem` / the nullable-index
classifier (B-POP, C-IDX) read it back out. Sizing a heap under one resolution and filling
it under another is exactly the defect this program exists to remove.

**Method + measurements.** Foundation (sidecar, no consumer) **byte-identical** over the
1,265-file corpus. Additive probe at all 19 candidate tags at once (compute both, KEEP the
name answer, an **accumulating** tag set reported once at the end of `emitProgram` — never
a first-hit abort, and coverage never on the failure channel, method note 7):
**0 disagreements** over the corpus and over **25,200** fuzz programs (seeds 1–14 ×
depths 4–6 × {plain, `--declared`} × 300; the probe build is itself corpus-byte-identical,
so it really was additive). Migrated: corpus **byte-identical** and run-identical, 66-case
battery 0 diffs, fuzz A/B identical (2,248 shape lines both sides).

**Shared-instance gate** (the only channel that sees a sidecar-lifetime bug): 601
array/struct/union/map/object/closure/type programs through **ONE** `vl run --batch`
compiler instance per side — 645 outputs each, **0 traps, 0 diffs** vs master.

**Sabotage-verified per site**, gated on the arena leg having actually answered so
"fired" means the MIGRATED leg ran — corpus files: `B-SIG` 155 · `B-HEAP` 155 ·
`C-IDX` 120 · `B-LIT` 110 · `F-SIG` 50 · `A-SIG9` 35 · `A-HEAP9` 35 · `B-PUSH` 31 ·
`A-LIT9` 24 · `C-FOR` 8 · `A-NRA` 7 · `B-ST` 3 · `B-POP` 2 · `A-FOR` 2 · `A-CTX9` 2 ·
`B-AN` 1.

**Three sites are NOT migrated here — `rlSlotsLayoutTwin`'s kind-9 arm and its struct
tail** (`A-TW9`, `B-TWS`, `C-TW`). A *reach* marker — one that fires on merely ENTERING
the chokepoint, covered or not — fires on **0 of 1,265** corpus files and **0 of 25,200**
fuzz programs for all three, so at this slice they are unverifiable and keep the
element-NAME path. (The reachability study below later *constructed* the reachers and
migrated them; the 0-firing measurement was a property of the sampled surface, not a
proof of deadness.)

**Gate-channel sabotage, per site.** An arena leg answering an in-range but OFF-BY-ONE
slot/row (C inverted, F key-mangled) — broken only where that site's migrated leg answers,
every other site left correct — reddens the corpus A/B for **15 of the 16**:
`C-IDX` 104 byte + 16 build / 16 run · `B-HEAP` 76 byte / 75 run · `A-HEAP9` 34 / 34 ·
`A-LIT9` 21 + 3 build / 24 · `B-PUSH` 19 build / 19 · `B-SIG` 18 byte / 13 ·
`B-LIT` 15 + 23 build / 38 · `C-FOR` 6 + 2 build / 2 · `A-NRA` 2 + 5 build / 7 ·
`F-SIG` 3 + 26 build / 29 · `A-SIG9` 1 + 32 build / 33 · `A-CTX9` 2 / 2 ·
`A-FOR` 1 + 1 build / 2 · `B-ST` 1 build / 1 · `B-POP` 1 build / 1. All at once:
**76 BYTEDIFF + 108 build-status**, **146 run-status**.
**`B-AN` produces ZERO corpus diffs when deliberately broken** — including when its arena
leg is broken to `-1` outright. Its one reaching program is
`tests/cases/intrinsics/array-new-ref-elems.vl`, whose `__array_new__` struct fill the
NATIVE emitter rejects downstream for unrelated reasons (the case is host-corpus only), so
the element struct row it computes never reaches the output. Stated plainly: **the probe
(1 corpus firing, 0 disagreements) is that site's only gate.**

**What still reads `rlElemName` after this slice, and why.** The **map-VALUE** family
(`mapValNameOf(rlElemName[..])` → `mvSlotOfMapValNameOrMono`/`mvSlotByValNameOr`, 6 sites
in `rlSlotsLayoutTwin` / `compositionMapReadSlot` / `mAssignTypeIndices`) — an arena entry
exists (`mvSlotOfTy`, D-MAPVAL) but the callers' miss values are **tri-state and
overloaded** (`-1` means "mono map, rides the shared struct", `-3` "uninterned"), so an
arena `-1` would be read as "mono": the D3′ sentinel collision, and untangling it is its
own slice. The concrete-**VARIANT** index of an element name (3 sites) — the variant table
has no arena sidecar yet, so there is no `variantIndexOfTy` to call. `rlSlotByName`'s own
struct-twin rung — half of it (the row side) has an arena input and half (the query side,
a raw NAME) does not, and straddling a resolver's ladder is the pair hazard above.
`cloArrSlotRetName` and the ~11 `return rlElemName[slot]` sites — they hand a NAME to a
name consumer; that is the D2 `rlElemStoredName` residual and it retires with its
consumers, not here.

### D5-final (b) — the map-VALUE-NAME readers (`mvValName`) — SHIPPED

D-MAPVAL destringified the map-value slot **key** (`repMvValKey`) and said so honestly:
"the remaining `mvValName[slot]` reads are name CONSUMERS, not keys". D5-final (a) then
moved the ref-list element readers but **deliberately skipped** the map-value family,
citing a tri-state sentinel overload. This slice is that family — the readers that recover
**structure** by string surgery on the stored map-value name. It does not delete the
column: names as strings are fine, deriving structure from a rendering is not.

**Every reader enumerated first.** 20 `mvValName[...]` reads across three files (the brief's
starting list was incomplete by three — two name PRODUCERS and one `refArrElemName`
producer, all found by the enumeration). They split seven ways:

| family | the surgery | sites | verdict |
|---|---|---|---|
| **A** inner ref-list slot of a list-valued map | `rlSlotByName(refArrElemName(mvValName[s]))` | 3 | migrated |
| **E** inner mv slot of a nested-map value | `mvSlotOfMapValNameOrMono(mapValNameOf(mvValName[s]))` | 1 | migrated |
| **C** does a boxed union value admit null | `unionHasAtomTy(mvValName[s], "null")` | 1 | migrated |
| **F** is the value a niche-nullable ref | `nulRefMapValInnerOf(mvValName[s]) != ""` | 1 | migrated |
| **U** is the value exactly `scalar \| null` | `splitUnionAtoms` + `valueAtomKind(removeAtomFrom(…))` | 1 | migrated |
| **G** the `mvTwin` layout comparator | `repNameCanonKey(mvValName[a\|b])` | 2 | migrated |
| **not this slice** | the union-BOX ABI's name argument (`emitUnionBoxArg`, 2), `emitMapGetOrUnionBox`'s atom peel (1), the `nameIsRefArray` write guard (1), the 3 name PRODUCERS, and the `mvValName[i] == name` nominal fast path | 8 | see below |

**Sidecar: none added.** `mvValTyIx[]` ∥ `mvValName` already exists (D-MAPVAL, #1094),
recorded at the single intern push (`recordMvValTyIx` → `fieldElemTyIxOfName`, pad-on-push)
and — **verified, not assumed** (method note 8) — already emptied at the **top of
`emitProgram`**, ahead of `collectU`/`collectS`/`collectA`. Every arena leg re-derives from
`T.tys[ix]` at QUERY time, never from a key frozen at intern time (the D1 hazard).

**Four chokepoints + two in-place legs, all ladder-faithful (D1 leg C).**
`mvValInnerRlSlot` (A), `mvValInnerMvSlot` (E), `mvValUnionHasNull` (C), `mvValCanonKey`
(G); `mvSlotNullable` (F) and `mvUnionIsScalarNull` (U) already were the layer's
chokepoints, so their arena leg went in front of the existing body. The name path is
untouched in all six.

**Which axis each family is on, decided before the swap.**
- **D2 (type vs REP).** Family A's answer is a ref-list SLOT — a rep question — so it goes
  through `rlSlotOfTy`/`repElemKey`, and family E's is an mv SLOT, so it goes through
  `mvSlotOfTy`/`repMvValKey` (#1094's deliberately-not-`repElemKey`, deliberately-not-
  `repCanonKey` key). C/F/U are exact TYPE tests. G is a canonical KEY and stays on
  `repCanonKey`, the vocabulary the name path already computed through `resolveAnnot`.
- **D3′ (structure vs INTERN STATE / SENTINELS) — the hazard that parked this family.**
  `mvSlotOfMapValNameOrMono` is tri-state: `-1` = a MONO i32 map that rides the shared
  struct, `-3` = uninterned/unsupported, `>= 0` = a slot. A degenerate arena miss landing
  on `-1` would be read as "mono" — the collision that refuted `nameIsRefArray` in D-UNION
  batch 3. **Sentinel audit, per site:** every arena leg's miss is consumed *only* by its
  own chokepoint, which turns it into "use the name path", so no caller ever sees it. E's
  leg answers **only** `>= 0`; `-1` (uncovered / not a `TyMap` / no row claims the inner
  value) is indistinguishable from "mono" *inside* the chokepoint and therefore never
  escapes it. C/F/U answer `-1` = "the arena declines" — never "no" — so an object shape the
  struct table does not claim (F) or a member kind the arena cannot classify (U) keeps the
  rendered-name test rather than answering falsely. A's `-1` is swallowed before any slot
  comparison, exactly as in D5-final (a).

**Read/write pairing.** A's three sites are the pair: `emitMapSetValExpr` (the store — it
builds the value list under that slot) and `emitMapValDefault` / `letNulMapReadSlotArg`
(the reads that fill and bind it) now resolve the inner slot through ONE chokepoint. The
vals WRAPPER those elements land in (`mvValsWrapOf` → `rlWrapIdx[mvRlSlot[slot]]`) was
already index-keyed, so the sizing side needed no move. F is inherently both halves — it
seeds `nulRefHeap` on the store and skips the non-null recover on the read. G is a WRITE
decision (which slots share one map-struct heap index); every downstream reader of that
decision is already index-keyed (`mvTwin`/`mvMapTypeIdx`).

**Method + measurements.** Additive probe at all 8 tags at once (compute both, KEEP the
name answer, an **accumulating** tag set reported once at the end of `emitProgram`; coverage
never on the failure channel, method note 7): **0 disagreements** over the 1,265-file corpus
and over **25,200** fuzz programs (seeds 1–14 × depths 4–6 × {plain, `--declared`} × 300) —
and the probe build is itself corpus **byte-identical and run-identical**, so it really was
additive. Migrated: corpus **byte-identical** AND run-identical, 66-case battery 0 diffs,
fuzz A/B identical (2,248 shape lines both sides). **Shared-instance gate** (the only channel
that sees a sidecar-lifetime bug): 601 programs through **ONE** `vl run --batch` instance per
side, 645 outputs each, **0 traps, 0 diffs**.

**Sabotage-verified per site**, gated on the arena leg having actually answered so "fired"
means the MIGRATED leg ran — corpus files: `F-NIC` 109 · `G-KEY` 26 · `C-NUL` 23 · `U-SN` 18 ·
`A-SET` 15 · `A-DEF` 13 · `E-LET` 1 · `A-LET` 1 (113 files reached in all). No site had a
coverage gap, so none was left unmigrated for want of evidence.

**Gate-channel sabotage, per site.** An arena leg broken only where that site's migrated leg
answers (slots off-by-one, predicates inverted), every other site left correct, reddens the
corpus A/B for **all eight**: `F-NIC` 92 byte + 5 build / 5 run · `A-SET` 13 + 2 / 15 ·
`A-DEF` 13 / 13 · `C-NUL` 11 + 12 / 15 + 1 stdout · `U-SN` 6 + 12 / 18 · `A-LET` 1 / 1 ·
`E-LET` 1 / 1 · `G-KEY` 1 + 1 / 2. All at once: **77 BYTEDIFF + 23 build-status, 41
run-status**.
**One sabotage lesson worth recording:** G's first break — prefixing the arena key with a
constant — produced **ZERO** diffs, because the site is an *equality comparator* and any
INJECTIVE relabeling of a key leaves every comparison unchanged. Only a break that changes
which slots COLLIDE (suffixing each key with its own spelling, so no two slots ever twin)
reddens it. When sabotaging a key site, break the equivalence, not the text.

**What still reads `mvValName` after this slice, and why.** The union-BOX ABI's name
ARGUMENT (`emitUnionBoxArg(body, mvValName[mslot], …)`, 2 sites) — it hands a NAME to a
name-consuming API whose own tag/widening decisions D-UNION batch 4 already moved to the
arena; retiring the argument is the union layer's slice, not this one. `emitMapGetOrUnionBox`'s
`scalar | null` peel — it re-parses the member to reach `vbHeapIdxOfAtom` / `scalarTagOf`,
and those are keyed by the atom's TEXT, so a folding arena predicate could hand back a tag no
producer interned (#1095's refutation); its *classification* half is exactly `U-SN`, which
this slice did migrate. The `nameIsRefArray(mvValName[mslot])` write GUARD — `nameIsRefArray`
folds ref-list INTERN STATE (`shapeElemDeclaredStructIdx`, `variantIndexOf`, the `unNames`
scan) into a shape test, and D-UNION batch 3 measured an arena dual of exactly that predicate
disagreeing on 2 of 50,400 fuzz programs; it needs its own rep-classifier slice, and the SLOT
it guards is migrated either way. The 3 sites that **return** `mvValName[slot]` (or
`refArrElemName` of it) to a name consumer — the `rlElemStoredName` residual one layer over.
And the `mvValName[i] == name` scan, which is the layer's nominal fast path ahead of
`repMvValKey` (legitimate, #1094).

### D5-final (c) — the map-ELEMENT ref-list readers (`rlElemName` → the mv layer) — SHIPPED

D5-final (a) migrated the ref-list element readers and **deliberately skipped one family**:
the sites that ask *"which mv slot does this map ELEMENT's value occupy?"* —
`mvSlotOfMapValNameOrMono(mapValNameOf(rlElemName[s]))` and its `mvSlotByValNameOr` twin.
The stated reason was the D3′ sentinel: the name resolvers are **tri-state and overloaded**
(`-1` = a MONO i32 map riding the shared struct, `-3` = uninterned/unsupported, `>= 0` = a
slot), so a degenerate arena `-1` would be read as "mono" — the collision that refuted
`nameIsRefArray` in D-UNION batch 3, where a clean corpus and **2 disagreements in 50,400
fuzz programs** were the whole difference. This slice is that family.

**Every path enumerated first, and the enumeration corrected the scope by three.** The
starting list carried four sites (`rlSlotsLayoutTwin`'s kind-3 arm ×2, `compositionMapReadSlot`
×2). Scanning for the same surgery performed *through a local* — `let en = rlElemName[s]` …
`mapValNameOf(en)`, which no `mapValNameOf(rlElemName[…])` grep can see — found **three more
in `mAssignTypeIndices`**, and those three are the **WRITE half of the pair** the twin
comparator reads:

| tag | site | file | the decision |
|---|---|---|---|
| `TW3A`/`TW3B` | `rlSlotsLayoutTwin`'s kind-3 arm | emit_classify | do two MAP-element ref-list slots share an element heap |
| `CMPN` | `compositionMapReadSlot`, nested-map read | emit_classify | the mv slot an `outer[k]` read's inner map has |
| `CMPL` | `compositionMapReadSlot`, list-of-maps read | emit_classify | the same for `xs[i]` over a `{[string]:V}[]` |
| `WSIG3` | `mAssignTypeIndices`' `rlSig` kind-3 arm | emit_collect | which ref-list slots TWIN (`"3:m"` mono vs `"3:<rep>"`) |
| `WHP3A` | `mAssignTypeIndices`' `rlElemHeap` kind-3, pass 1 | emit_collect | the shared `mStructIdxPre` vs a deferred typed map struct |
| `WHP3B` | `mAssignTypeIndices`' kind-3 second pass | emit_collect | the element's own `mvMapTypeIdx` |

`rlSlotsLayoutTwin`'s own doc comment states the invariant that makes this a pair — *"each
arm must stay at least as strict as its `rlSig` twin, so a claimed twin always resolves equal
(backing, wrapper) pairs there"*. Migrating the comparator and leaving the sig on the name
path is exactly the straddle `EQA` was pulled into D-UNION batch 4 to avoid: on any input
where the two legs disagreed, slots would be *claimed* twins by one resolution and given
*different* heap pairs by the other. Both halves move together. (The read side has a third
consumer, `mapShapeOfExpr`, which is itself the one chokepoint both the local's declared map
struct — the write — and every later map op on it — the read — go through, so
`compositionMapReadSlot` is inherently both halves.)

**One arena leg + three chokepoints, all ladder-faithful (D1 leg C).**
`rlElemMapValMvSlotAt(slot, peelNul)` is the arena leg — `rlElemTyIx` → (optionally peel one
`TyNullable`) → the `TyMap`'s value → `mvSlotOfTy`, i.e. the mv layer's own `repMvValKey`
lookup. `rlElemMapValMvSlot` / `rlElemNulMapValMvSlot` (emit_classify) and `rlMapElemValSlot`
(emit_collect, whose `canon` flag picks which of the two *name* legs falls through) put it in
front of the untouched name path.

**Which axis each site is on, decided before the swap.**
- **D2 (type vs REP).** The answer is an mv SLOT — a rep question — so it resolves through
  `mvSlotOfTy`/`repMvValKey`, never `repCanonKey` (which expands a declared struct and would
  collapse `{[string]:A}` / `{[string]:B}` twins that hold distinct mv rows) and never
  `repElemKey` (which folds every shared-wrapper leaf list onto one token). The
  `mvCanonValName` fold the second heap pass performs on its *name* is subsumed:
  `repMvValKey` performs the same mixed-litunion→`string` fold itself, so the arena leg needs
  no `canon` flag and the two name legs keep theirs.
- **D1 (timing).** The sidecar stores an INDEX and every read re-derives from `T.tys[ix]` at
  QUERY time, so an in-place arena mutation (`holeMemberTy`) moves both legs together.
  `rlElemTyIx` is already emptied at the **top of `emitProgram`** — verified, not assumed
  (method note 8) — ahead of `collectU`/`collectS`/`collectA`; no new sidecar was added.
- **D3′ (structure vs SENTINELS) — the hazard that parked this family, audited per site.**
  Every arena leg answers **only `>= 0`**. Its own miss — uncovered row, not a `TyMap`, no mv
  row claims the inner value — is *indistinguishable from "mono" inside the chokepoint* and
  is therefore consumed there and turned into "use the name path". No caller ever sees the
  arena's miss, so the degenerate `-1 == -1` collision cannot arise: `rlSlotsLayoutTwin`'s
  `ma == -1 && mb == -1 { return 1 }` rung and `mAssignTypeIndices`' `mmv < 0 → "3:m"` rung
  are reached only with the NAME path's own `-1`. This is `E-LET`'s containment discipline
  from D5-final (b), applied to six sites instead of one.

**Method + measurements.** Additive probe at all 7 tags at once (compute both, KEEP the name
answer, an **accumulating** tag set reported once at the end of `emitProgram`; coverage never
on the failure channel, method note 7): **0 disagreements** over the 1,269-file corpus
(`tests/cases` + `std/` + the compiler's own source) and over **25,200** fuzz programs
(seeds 1–14 × depths 4–6 × {plain, `--declared`} × 300) — and the probe build is itself
corpus **byte-identical and run-identical**, so it really was additive. Migrated: corpus
**byte-identical** AND run-identical, 66-case battery 0 diffs, fuzz A/B identical (2,248
shape lines both sides). **Shared-instance gate** (the only channel that sees a
sidecar-lifetime bug): 605 array/struct/union/map/object/closure/type programs through **ONE**
`vl run --batch` instance per side — 649 outputs each, **0 traps, 0 diffs**.

**Coverage, per site** — files where the ARENA leg actually answered, counted in the INVERTED
build, never on the probe's own report channel: `WSIG3` 24 · `WHP3A` 24 · `WHP3B` 24 ·
`CMPL` 14 · `CMPN` 10 · `TW3A` 2 · `TW3B` 2. No site had a coverage gap, so none was left
unmigrated for want of evidence. (A pure *reach* marker — entering the site, covered or not —
fires on 33 `CMPL` / 13 `CMPN` / 13 `RLEMV` / 2 `TW3` files; the difference is rows the
sidecar does not cover, which keep the name path.)

**Gate-channel sabotage, per site.** An arena leg broken only where that site's migrated leg
answers, every other site left correct — corpus byte / build-status / run-status:
`WHP3B` 23 byte / 22 run · `CMPL` 12 + 2 build / 12 · `CMPN` 5 + 4 build / 8 ·
`WSIG3` 3 + 1 build / 4 · `TW3A` 2 / 2 · `TW3B` 1 / 1. All seven at once: **18 BYTEDIFF +
6 build-status, 22 run-status**. Both kind-3 pins (`maps/map-value-twin-heap.vl` and
`unions/variant-twin-map-elem-list-field.vl`, the reachers #1099's study constructed) are the
files that redden for `TW3A`/`TW3B` — the entombment test the brief prescribes for a
byte-identical migration, where a pin *cannot* fail on master.

**Two sabotage lessons worth recording.**
- **`TW3A`'s off-by-one perturbation produced ZERO diffs, and the reason is method note 9.**
  `ma` is the LOWER of the two slots the comparator is handed, so `ma + 1` lands on the OTHER
  member of the same layout-twin class — an injective relabeling INSIDE one equivalence class,
  which leaves every comparison unchanged. Forcing the arena's answer to the mono sentinel
  instead changes which slots COLLIDE, and reddens both pins. `TW3B` reddened under the
  off-by-one only because `mb + 1` runs off the end of the mv table and degrades to the same
  mono forcing. When sabotaging a comparator, break the equivalence — and check that your
  perturbation actually left the class.
- **`WHP3A` produces ZERO corpus diffs when deliberately broken, and that is provable rather
  than a corpus gap.** The second heap pass (`WHP3B`) overwrites `rlElemHeap[rmf]`
  unconditionally wherever its own resolve answers `>= 0`, and its arena leg is *the same
  leg* — so on every input where `WHP3A`'s migrated leg answers, `WHP3B` answers too and
  writes over it. `WHP3A`'s decision is unobservable **by construction**, not merely on this
  surface. Stated plainly: **the probe (24 corpus firings, 0 disagreements) is that site's
  only gate**, and it is in the batch because leaving one of the three passes on a different
  resolution is precisely the straddle this slice exists to prevent. (The D-RET lesson — a
  green A/B is not evidence for what the channel cannot express — applied for the fourth time
  in this program; see also batch 3's `unionListElemMapFieldMember` and D5-final (a)'s `B-AN`.)

**`refListElemNameOfExpr` is TERMINAL — a name producer, measured, not asserted.** Its
map-read arm (`refArrElemName(mvValName[slsMv])`) was the last item on the close-out's
unmigrated list, classified as "a name producer; it retires with its consumers". The
classification was re-checked two ways and both confirm it.

*By consumer.* `refListElemNameOfExpr` returns a NAME, and its callers consume it as one:
`rlInternName(refListElemNameOfExpr(i, -1), 1)` (emit_collect — an **INTERN** site, which
needs the emit-canonical stored spelling, the D2 `rlElemStoredName` residual),
`fRetRArrElem[i] = …` (a name COLUMN), `structIndexByName` / `variantIndexOf` at
`structIndexOfExpr`'s and `exprVariantIndex`'s Index arms (**nominal identity** — a declared
name *is* the identity, explicitly not a target of this program), `structIdxOfElemName`, and
`rlSlotByName` via `refListSlotOfExpr` (already `repElemKey`-keyed since D2). Nothing here
re-derives structure from the rendering; the site FORWARDS a name to name-keyed APIs.

*By measurement.* The only arena route to a NAME is to render the recorded index
(`tyToEmitName(tyRefArrElemOf(mvValTyIxAt(slsMv)))`), and an additive probe comparing the two
**disagrees on 5 of the 1,269 corpus files**, in the direction that matters: the stored name
is NOMINAL and alias-preserving, the arena render is STRUCTURALLY EXPANDED —
`S` vs `{v:i32}`, `P` vs `{n:i32}`, `Cat|Dog` vs `{meow:i32}|{bark:i32}`,
`C|S` vs `{kind:i32,r:i32}|{kind:i32,side:i32}`, `((i32)=>i32)` vs `(i32)=>i32`
(`maps/ref-list-values.vl`, `maps/ref-list-value-boundary.vl`, `maps/struct-list-valued-map.vl`,
`types/union-array-operations.vl`, `closures/closure-array-literal-classify.vl`). Feeding the
expanded spelling to `structIndexByName` / `variantIndexOf` answers NO exactly where the
stored spelling answers YES. This is the D2/D-RET lesson once more — *a different renderer
asks a different question* — and here it is load-bearing rather than theoretical. **The site
stays name-keyed**, and it retires when the `rlElemStoredName` column does, not before.

### D5 — delete the name columns

Once nothing reads a table's name column for anything but diagnostics, demote it to a
sidecar or delete it. Terminal-condition check: the greps in "How to verify" return only
diagnostic and nominal-lookup hits.

## How to verify (the standing check)

```sh
# structural decisions made by comparing rendered names — must be empty
grep -nE '(tyToStr|tyToEmitName|nodeTyName|canonEmitName)\([^)]*\) *(==|!=)' compiler/*.vl

# tables keyed by a type-name string — must be nominal lookups only
grep -nE '\b(sNames|rlElemName|mvValName|unNames|uVariants)\[[^]]*\] *(==|!=)' compiler/*.vl
```

## Gate for every slice

`refresh-compiler.sh` (check RC explicitly) · `rep-fuzz-check.sh` · `native-fixpoint.sh` ·
`lint-self.sh` · `SELFHOST_NATIVE_ALIGN=1 deno task test` · corpus **run**-diff (status +
stdout; a check-only diff cannot see "checks clean, emits invalid wasm") · fuzz A/B ≥20k
programs/side · `fuzz-sweep.sh` gating leg.

## Scorecard (measured at master 6bbd579, after D0–D4)

Raw table ref-counts are a **poor metric** — the name tables persist for *rendering* and
nominal lookup even where every structural decision has moved off them. The terminal
condition names two things, so measure those:

| metric | at start | now |
|---|---|---|
| structural decisions made from a **rendered** type (`tyToStr(x) == "string"` &c.) | 13 | **0** |
| struct-row canon key derived by parsing a name | yes | **no** (`sTyIx`; `sAnonCanon` deleted) |
| ref-list element slot key derived by string surgery | yes | **no** (`repElemKey`) |
| `$fnsig` key derived by rendering + re-parsing | yes | **no** at `cloCallSigKey` (`sigKeyOfTy`) |
| inferred-return value-union verdict derived by rendering + re-parsing | yes | **no** (`tyIsValueUnion`) |
| per-atom classify-by-render of a union member set | 15 sites | **12 functions still contain the pattern**; batches 1-3 made the arena answer FIRST in most (see the counting caveat) |
| struct/variant FIELD-ELEMENT slot resolved by re-resolving a NAME | 14 sites | **0** for the ref-list + nested-struct layers (`sFieldElemTyIx`/`uFieldElemTyIx` → `rlSlotOfTy`/`structIndexOfTy`); the union-box / litunion readers stay |
| map-VALUE slot keyed by canonical-name equality | 5 scans | **0** (`mvValTyIx` → `repMvValKey`; the name scan is the fall-through) |
| struct/variant FIELD-ELEMENT slot resolved by re-resolving a NAME | 14 sites | **0** for the ref-list + nested-struct layers (`sFieldElemTyIx`/`uFieldElemTyIx` → `rlSlotOfTy`/`structIndexOfTy`); the map-value / union-box readers stay |
| struct/variant field LITUNION (atom-rep) classified by re-parsing a NAME | 4 sites | **0** (`tyIsLitUnion` / `tyIsLitUnionArray` over the D5 sidecars) |
| `structFieldCodesEq`'s referenced ROW resolved from a recorded NAME | yes | **no** (`repStructRowByTy`; the `ea != eb` identity fast path stays, deliberately) |
| union-BOX tag / widening chosen by comparing a member set's rendered ATOMS | 16 sites | **0** (`unMemHasAtom` → `unionHasAtomTy`; the atom scan is the fall-through). 12 raw `unionHasAtom` calls remain, none of them the box ABI — see D-UNION batch 4 |
| ref-list ELEMENT structure re-derived by string surgery on the stored name (its inner slot / struct row / niche / `$fnsig`) | 22 sites | **19 migrated** (`rlElemTyIx` → `rlElemInnerSlot`/`rlElemStructRow`/`rlElemIsNulNiche`/`rlElemCloSigKey`) — the last 3 were `rlSlotsLayoutTwin`'s kind-9 arm + struct tail, reached and migrated by the reachability study below. The variant-index / name-producing readers are untouched |
| ref-list MAP-ELEMENT value slot re-derived by string surgery on the stored name | 7 sites | **7 migrated** (`rlElemTyIx` → `rlElemMapValMvSlotAt` → `rlElemMapValMvSlot`/`rlElemNulMapValMvSlot`/`rlMapElemValSlot`) — see D5-final (c). Both the twin comparator (read) and `mAssignTypeIndices`' three sig/heap passes (write) move together |
| map-VALUE structure re-derived by string surgery on the stored name (its inner ref-list slot / inner mv slot / null atom / niche / `scalar\|null` peel / twin key) | 9 sites | **9 migrated** (`mvValTyIx` → `mvValInnerRlSlot`/`mvValInnerMvSlot`/`mvValUnionHasNull`/`mvValNulRefNicheAt`/`mvValUnionScalarNullAt`/`mvValCanonKey`) — see D5-final (b). The union-box name ARGUMENT, the `nameIsRefArray` guard and the 3 name-producing readers stay |

The 12 remaining `table[i] == name` scans split three ways, and **most are not the disease**:

- **Legitimate nominal identity** — `unNames`/`uVariants` lookups (a declared name *is* the
  identity), the `rlElemName` exact-match fast path ahead of the structural key.
- **Legitimate ABI identity** — the `cloSigKeys` scan: that key text *is* the interned
  WasmGC functype's identity, so a string is its natural representation. What mattered was
  that every *producer* derives it structurally, which D3 did.
- **Genuinely open** — `unMemberSet` (the union arc). The `mvValName` map-value scans
  are done (D-MAPVAL): all five key on `repMvValKey` now, with the name scan as the
  fall-through, and the value-name READERS are done too (D5-final (b)) — what is left of
  `mvValName[slot]` is a name handed to a name consumer.

### The open arc: union member sets

`unionMemberSetOf(name)` returns a pipe-joined member string; consumers `splitUnionAtoms` it
and classify each atom **by its rendered text**. That per-atom re-derivation is the disease.
Batches 1–3 took seventeen of the twenty-three sites (the "is there an arm of shape X" family,
the `unionArmPath*` field-path walks, and the `mark*` registration + the map-shaped `*ArmSlot`
resolvers) and **batch 4 took the box ABI itself** (the 16 `unionHasAtom` tag/widening
decisions); what remains is the atom-EQUALITY / element-NAME residue named in D-UNION above,
the two `nameIsRefArray`-gated slot resolvers refuted in batch 3, the one classifier measured
DEAD (`unionHasCollapsedStringMapArm`), and the narrowing-layer `"null"` readers in
`emit_classify` (a different question from the box's null tag).

**Scope carefully:** an atom that is a declared variant name (`Cat`) feeding
`variantIndexOf` is *nominal identity — lossless and correct*. Only the inline-shape /
composite atoms are the disease. **ABI hazard:** the box-tag scheme depends on member
ORDER (`unVarStart`/`unVarCount` slice `uVariants`), so any reordering is an ABI change.

**Update — D-UNION-SET closed the SET half.** The member set is now a structure
(`unMemAtoms`/`unMemAtomIds`/`unMemKinds` + the (row, mask) set pool), and membership /
subtraction / cardinality / iteration are structural operations on it at 33 consumers;
the remaining string-shaped pieces are enumerated at the end of that section.


### Counting caveat — read before quoting a scorecard number

Two different things get called "sites", and conflating them produced disagreeing numbers in
this doc's own history (a "15 → 4" and a "15 → 5 + 1 dead", neither reproducible by an
independent scan, which found 12).

- **Source-pattern count**: functions that still `splitUnionAtoms` a member set and call a
  `nameIs*` / `valueAtomKind` on an atom. A **ladder-faithful** migration — the shape D1's
  refutation forced, where the arena replaces the predicate *in place* and the name
  fall-through is deliberately untouched — **leaves this pattern in the source**. So this
  count barely moves even when the arena is doing the deciding.
- **Authority count**: how many consult the arena *first*, with the name path reached only
  when the arena declines.

The second is what the program changes; the first is what a grep can see. Quote both, or
neither. Reproduce the source-pattern count with: for each `splitUnionAtoms` line, look ahead
~14 lines for
`(nameIsMap|nameIsRefArray|nameIsArray|nameIsClosureArray|refArrElemName|valueAtomKind|nameIsLitUnionType|annArrowAt|strContains)\s*\(\s*(atoms?\[|arm|a\b|at\b)`,
then walk back to the enclosing function and dedupe.

## Method notes earned during this program

1. **An additive probe must cover every resolution path of a layer, and must be
   sabotage-verified** (invert the comparison; confirm it fires on the target shape) before a
   "0 disagreements" means anything. A single-site probe on the map-value layer swept 0 and
   then *failed* sabotage — the load-bearing path was elsewhere. An unverified 0 is worthless.
2. **A recorded arena index ≠ a name key** (D1) — intern-time vs query-time resolution
   diverge once the arena mutates in place.
3. **A type key ≠ a rep key** (D2) — slot layers fold structurally-distinct types that share
   a wrapper.

4. **Sabotage the GATE CHANNEL, not only the probe** (batch 3) — three deliberately-wrong
   compilers were built to check the corpus byte/run-diff can go red for each migrated
   predicate. Two did; the third (`unionListElemMapFieldMember`) produced **zero** diffs,
   because a conservative over-reservation's wrong answer is invisible in the output. A site
   like that can only be defended by the probe's answer-equality — know which of your two
   pieces of evidence is actually carrying the site.
5. **A green CORPUS is not a green probe** (batch 3) — `unMemIsRefElemArray` swept the whole
   corpus clean at `unionHasRefArrayArmSlot` and disagreed on **2 of 50,400** fuzz programs.
   The predicate it replaced folded reflist INTERN STATE into a shape test. Run the fuzz leg
   of the probe before the replacement, not only after it.
6. **A zero-coverage consumer may be DEAD, not merely untested** (batch 3) — all three union
   batches found a classifier that fires on nothing. Batches 1 and 2 pinned theirs with a new
   fixture. Batch 3's (`unionHasCollapsedStringMapArm`) could not be reached at all: its own
   dedicated fixture now matches at the earlier arm and six hand-written attempts mis-narrow
   before the box site. **Do not migrate what you cannot sabotage-verify** — record the
   measurement and leave it on the name path.

7. **An arena sidecar has a LIFETIME the name column it parallels does not** (D-MAPVAL) —
   a recorded index is only meaningful while the arena it indexes is the one that minted
   it, so every sidecar needs a reset no later than the first query of a new program. A
   stale NAME is merely wrong text; a stale INDEX traps. Neither the corpus A/B nor the
   fuzz leg can see this (both give each program a fresh compiler instance) — only the
   suite's shared-instance driver does. Run it before believing a green A/B.
7. **A coverage marker must not ride the FAILURE channel** (D-LITUNION) — the first probe
   build reported "uncovered" with the same accumulating `emitFail` marker it used for
   disagreements. That aborted 241 corpus builds and quintupled the fuzz findings, i.e. the
   probe stopped being additive and its own A/B gate went dark. Coverage counts belong in the
   INVERTED (sabotage) build, where an abort is the intended signal.
8. **Sabotage a COMPARATOR by breaking the equivalence, not the text** (D5-final (b), and
   again in (c)) — an INJECTIVE relabeling of a key leaves every comparison unchanged and
   reads as a false "probe-only" verdict. D5-final (b) learned it from a constant key prefix
   that produced zero diffs; (c) hit the sharper version: an OFF-BY-ONE slot at `TW3A` landed
   on the other member of the same layout-twin class — a relabeling *inside* one equivalence
   class — and produced zero diffs, while the identical perturbation at `TW3B` reddened only
   because it ran off the end of the table and degraded into a sentinel forcing. After
   perturbing, check that you actually left the class.
9. **A grep for `f(table[i])` misses the same surgery routed through a LOCAL** (D5-final (c))
   — three of that slice's seven sites spell it `let en = table[i]` … `f(en)`, and they were
   the WRITE half of a read/write pair whose read half the brief did enumerate. Enumerate by
   *resolver called*, not by expression shape.
10. **REACHED is not the same measurement as CONSEQUENTIAL** (D-TOTALITY) — a decline path
    reached 47,000 times can never once change the caller's answer, and a decline path
    reached 6 times can change it all 6. Every slice before this one measured whether the
    arena leg AGREED where it answered; none measured what the name fall-through does where
    the arena DECLINES. Deletion is decided by the second question, so instrument the
    fall-through against *the value the caller would get if the fall-through were deleted*,
    not against whether the branch ran.
11. **A 0 does not transfer between SIBLING sites** (D-TOTALITY) — `sFieldRefSlot` and
    `variantFieldRefSlot` are the same four lines over two tables; one's fall-through is
    consequential 18 times in 49,422 programs and the other's is consequential 0 times in
    3,840 reaches. The struct table receives anonymous literal rows and the variant table
    does not, so the shared shape hides different input populations. Measure each site.

12. **A comparator that cannot fire is not a clean A/B** (D-ANNSLOT) — a fuzz A/B compared
    `<case>.out` while `vl run --batch --out-dir` writes `<case>.vl.out`, so every file it
    checked was absent on both sides and it reported 0 diffs over 50,400 programs. It was
    caught only because a SABOTAGE that reddens the corpus 163 times reported 0 on the same
    fuzz leg. Run the sabotage through the whole harness before trusting a 0 — and prefer
    comparing whole output TREES (`diff -r`) to per-file names you construct.

14. **A byte-identical migration makes the obvious profile A/B profile the SAME BINARY**
    (D-NARROW) — the recipe `vl build compiler/entry.vl --compiler <seed> --names` builds the
    profiled artifact from the CURRENT source, so with A and B differing only in a
    byte-identical way, `named-before.wasm` and `named-after.wasm` came out `cmp`-identical
    and the two profiles described one compiler. The profiled artifact must be built from
    each side's OWN source; the fixed thing is the INPUT.
15. **Count the work, do not time it** (D-NARROW) — a ~0.5% change is invisible to both a
    1,400-sample profile and a wall clock on a shared box. Two instrumented compilers
    (each side + call counters) compiling ONE fixed input answer "how much work was
    removed" exactly and with no load sensitivity. Time the change only after checking
    what share of the profile the surface actually holds: this slice cut 12-23% of a 3%
    surface, and no honest wall-clock method was going to show it.

13. **A migrated rung with two halves needs both measured** (D-ANNSLOT) — the struct-twin
    rung resolves a QUERY row and a CANDIDATE row and compares them. Three structural
    versions of it were byte-identical over 51,670 programs and answered 0 of the 6 cases
    the name rung answers, because only the query half had migrated. "Byte-identical" said
    nothing; the per-witness diagnostic (which half diverges) said everything.

16. **`vl run --batch` is a shared-MODULE run, not a shared-INSTANCE one** (D-ATOMKIND) —
    every slice since D-MAPVAL has quoted it as the sidecar-LIFETIME gate note 7 asks for,
    and it is not: `compile_vl_instance` instantiates the compiler once per CASE from a
    once-loaded Module, so module globals are re-initialised between programs. A build whose
    per-program column reset AND whose staleness check were both removed is byte-, output-
    and transcript-identical over 751 `--batch` programs, and fails **21** cases of
    `tests/cases_wasm_test.ts` — which builds ONE `WebAssembly.Instance` and compiles the
    whole corpus through it. `SELFHOST_NATIVE_ALIGN=1 deno task test` is the lifetime gate.
17. **A probe that reports at the END cannot see a sabotage that rejects EARLY**
    (D-ATOMKIND) — the accumulating-marker discipline (note 7) puts the report at the end of
    `emitProgram`, so a perturbation whose consequence is a loud `emitFail` earlier in the
    same compile silently removes its own evidence. Four tags read 0 under an all-sites
    sabotage for that reason alone and lit under a milder one that kept every consumer gate
    satisfied. When a sabotage produces 0 at a site the coverage build says is reached, check
    whether the program still reaches the report.

The first three are the same underlying mistake: assuming an arena artifact answers the same
question the string did. Check which question the site is asking, first.

## Close-out measurement (after D5-final (c), 13 slices)

Measured, not asserted. The reproducible commands are in "How to verify" and the
"Counting caveat".

| check | at e1e2ad6 (11 slices) | now |
|---|---|---|
| structural decision from a **rendered** type | 0 | **0** (the 4 grep hits are doc comments naming the retired pattern) |
| string surgery on a stored name column | 18 matches → 7 doc comments, 5 ladder fall-throughs, **6 genuinely unmigrated** | 17 matches → **9 doc comments**, **7 ladder fall-throughs** (inside a migrated chokepoint, by design; an 8th hides behind a local in `emit_collect`'s `rlMapElemValSlot`), **1 genuinely unmigrated** |
| name-keyed `table[i] == name` scans | 13 | **12** real scans (14 grep hits − 1 doc comment − 1 `!= ""` emptiness test) — nominal identity (`sNames`/`unNames`/`uVariants`), ABI identity (`cloSigKeys`), the union member-set algebra (`unMemberSet`), and the exact-match fast paths ahead of the structural keys |

### The 6, resolved: 5 migrated, 1 terminal

| item | verdict |
|---|---|
| `rlSlotsLayoutTwin`'s kind-9 arm + struct tail (×2 of the original ×4) | **migrated** (#1099) — the reachability study *constructed* the reachers a 0-firing marker had missed |
| `rlSlotsLayoutTwin`'s kind-3 arm (×2) | **migrated** — D5-final (c), `TW3A`/`TW3B`; sentinel contained inside the chokepoint |
| `compositionMapReadSlot` (×2 — the enumeration found it is two sites, not one) | **migrated** — D5-final (c), `CMPN`/`CMPL` |
| `refListElemNameOfExpr` | **TERMINAL, with a measurement.** A name PRODUCER whose output feeds an INTERN site (`rlInternName`), a name COLUMN (`fRetRArrElem`) and two NOMINAL lookups (`structIndexByName` / `variantIndexOf`). The only arena route to a name renders the recorded index, and that render **disagrees on 5 corpus files** — nominal `S` / `Cat\|Dog` vs structurally-expanded `{v:i32}` / `{meow:i32}\|{bark:i32}` — in the direction that would break the nominal lookups. It retires with the `rlElemStoredName` column, not before. |

Plus **3 sites the enumeration added** and D5-final (c) migrated: `mAssignTypeIndices`'
`rlSig` kind-3 arm and its two `rlElemHeap` kind-3 passes — the WRITE half of the pair
`rlSlotsLayoutTwin`'s kind-3 arm reads, invisible to a `mapValNameOf(rlElemName[…])` grep
because the surgery runs through a local.

### What "done" means here

The disease this program targeted — *deriving structure from a rendering* — is gone from
every layer that decides structure, representation, or ABI. Names persist for rendering,
for nominal identity, and as the fall-through of ladders whose arena leg decides first.
That was the stated terminal condition, and it holds.

**A handful of consumers stand deliberately unmigrated** across the program, each for a
reason that was *measured*, not assumed: sabotage found them unverifiable (0 firings —
`unionHasCollapsedStringMapArm`, `shapeFieldTypeCompat`'s atom arms,
`structIndexOfExpr`'s un-narrowed variant arm), or the arena artifact was shown to answer a
**different question** than the name path (`nameIsRefArray`'s reflist intern state,
`structFieldCodesEq`'s `ea != eb` identity fast path, `annShapeIndexOf`'s query-time minting,
and — the last item on the close-out list — `refListElemNameOfExpr`, whose arena render
disagrees with the stored nominal spelling on 5 corpus files). A reasoned *"this must stay
name-keyed"* converts an open item into a terminal one; that is the intended outcome of the
method, not a shortfall.

## Reachability study — `rlSlotsLayoutTwin`'s kind-9 arm and struct tail

A 0-firing reach marker says *the sampled surface does not reach this*, not *nothing
reaches this*. Worked backwards from the arm preconditions instead of sampling: what makes
two DISTINCT ref-list slots of the same kind exist at once, and which caller compares them.

The answer is the **canonical-key/rep-key split**. `repCanonKey` (the variant + map-value
dedup key) EXPANDS a declared struct to its field shape, while `repElemKey` (the ref-list
intern key) keeps a declared struct NOMINAL. So `{ns: A[]}` and `{ns: B[]}` with `type A =
{v:i32}` / `type B = {v:i32}` key the same at the layer that asks the question and intern
DISTINCT slots at the layer that answers it — exactly the precondition. Two programs, both
found on the first attempt:

- struct tail — twin variants with a ref-list field of declared-twin elements
  (`tests/cases/unions/variant-twin-reflist-field-struct-twin-elem.vl`);
- kind-9 arm — the same with `A[][]`/`B[][]`
  (`tests/cases/unions/variant-twin-nested-reflist-field-struct-twin-elem.vl`), and through
  the map-value caller with `{[string]: A[]}` (the vals list's element IS a ref array, so
  the map slot pair lands on kind 9).

Both arms are load-bearing: with either forced to "not twins", the pins TRAP (variant heap
split under a structural crossing) or emit INVALID WASM (map-struct heap split). Both are
now on the arena chokepoints (`rlElemInnerSlot`, `rlElemStructRow`, `rlElemIsNulNiche`), and
a leg probe confirms the ARENA leg is what answers in every reaching program.

Two guards inside the arms stay **unverifiable** and were measured as such: forcing the
`| null` niche-parity refusal off, and forcing the struct-row comparison to always agree,
each leave the corpus (1,269 files) and the 66-case battery byte- and run-identical. Every
pair that reaches these arms comes pre-filtered by canonical-key equality, so the arms only
ever answer "twin" on today's surface; their refusal direction has no witness.

The kind-3 (map-element) arm is reachable too — `tests/cases/unions/variant-twin-map-elem-list-field.vl`
and, already in the corpus, `tests/cases/maps/map-value-twin-heap.vl` — but its two sites
needed the tri-state `mvSlotOfMapValNameOrMono` sentinel untangled first (the D3′ collision
above), so they stayed on the name path with a pin guarding them. **D5-final (c) untangled
it** (containment: the arena leg answers only `>= 0`, its miss consumed inside the
chokepoint) and migrated both sites; those two pins are exactly the files that redden under
the `TW3A`/`TW3B` gate-channel sabotage, which is the entombment test a byte-identical
migration can have.

## SCORECARD CORRECTION — the program has been measuring the wrong thing

The owner's terminal condition, stated precisely:

> A **name is a name** — nominal identity (`structIndexByName("Cat")`) is fine, and rendering a
> type for a human is fine. But **parsing a type string outside the parser is always wrong.**

Every scorecard in this document above measured *proxies*: render-equality comparisons, and
readers of specific name columns. Both went to ~0 while the actual disease was untouched.

**Measured against the real condition — calls that PARSE a rendered type:**

| parser | calls |
|---|---|
| `nullablePartOf` | 88 |
| `annArrowAt` | 60 |
| `splitUnionAtoms` | 58 |
| `refArrElemName` | 53 |
| `nameIsRefArray` | 48 |
| `mapValNameOf` | 46 |
| `nameIsMap` | 40 |
| `nameIsLitUnionType` | 38 |
| `nameIsArray` | 37 |
| `nameIsMapMemberUnion` | 29 |
| `nameIsStringArray` / `nameIsI32Array` / `nameIsClosureArray` | 45 |
| `isTopLevelFuncTypeName` / `unionMemberCount` / `peelGroupParens` / `parenUnionArrElemName` / `annSplitParams` / `nameIsSingleShape` | 65 |
| **TOTAL** | **607** |

By file: emit_classify 387 · emit_collect 87 · emit_base 77 · typecheck 25 · wasmEmit 12 ·
emit_mono 8 · others 11.

### Why the earlier numbers were not wrong, but were not the point

Nine slices genuinely moved *decision* layers onto the arena, and those gates hold. But a
migrated decision that still receives a **rendered name** and picks it apart has relocated the
parse, not removed it. The chokepoints introduced (`rlElemInnerSlot`, `rlElemStructRow`, …)
each still parse inside their name fall-through.

### The correct strategy: kill the SOURCES, not the call sites

Each of the 607 parses consumes a string produced somewhere. Migrating a parse site in
isolation is whack-a-mole; converting its **producer** to hand over a type index deletes the
parse outright. Work backwards from the producers (`tyToEmitName`, `sNames[]`, `rlElemName[]`,
`mvValName[]`, `sFieldElemName[]`, `fRetRArrElem[]`) and let the parsers die.

### A verdict this correction overturns

`refListElemNameOfExpr` was filed TERMINAL in #1100 on the evidence that its arena route
renders `{v:i32}` where the stored name is `S`. That is not evidence the string is required —
it is evidence the **wrong renderer** was used. `tyToNominalName` (typecheck.vl:5755) renders
name-faithfully and yields `S`. The site parses a type string (`refArrElemName(mvValName[…])`)
and must go. **Verdict withdrawn.**

**Terminal condition restated: 0 type-string parse calls outside the parser.** Currently 607.

## D-REFARR — the ref-array interior chokepoints, ANNOTATION-NODE consumers (#1105)

The three interior parsers `refArrElemName` (53) / `nameIsRefArray` (48) /
`refArrElemKind` (15) are the *reflist naming layer's own machinery*: they keep ~10 further
parsers alive (`nameIsClosureArray`, `nameIsI32ListArray`, `nameIsMapArray`,
`nameIsStringArray`, `parenUnionArrElemName`, `nullClosureArrElem`, the `nameIsNul*`
family). This slice takes the first coherent consumer family off them.

### The enumeration (the counting method)

A **local-aware** scan of all 16 compiler modules — every textual call, with the enclosing
function and, for a bare-identifier argument, the `let`/`const`/param/assignment that bound
it (`scan_sites.py` + `locals.py`). **116 textual matches; 102 non-comment; 3 of those are
the parsers' own `function f(name: string)` headers ⇒ 99 real call sites** (14 comments).
By file: emit_classify **81** · emit_collect **15** · wasmEmit **3**. (116 as a *match* count,
99 as a *call* count — say which is being reported, or the scorecard drifts again.)

| class | sites | what |
|---|---|---|
| **(i) parser-internal** | **15** | the family's own mutual recursion (`nameIsRefArray` 2, `refArrElemKind` 3, `refArrElemName` 2) + its intern machinery (`ensureRefElem` 2, `nullArrayArrElem`, `nameIsNestedScalarLeafArray` 3, `nameIsNulRefList`, `checkArrName`) — the layer, not consumers of it |
| **(iii) parser-domain** | **27** | annotation / `is`-test TEXT on its way INTO the tables: `collectA` 11, `registerInlineUnion` 4, `internInlineShape` 2, `shapeFieldElemName` 2, `forceCloResultListTypes` 2, `refArrTagOf`, `emitIs`, and `annParamKind`/`annRetKind` 4 (a *rendered function-type substring* off `annSplitParams` — no node to key on; blocked behind the `$fnsig` producer) |
| **(ii) real consumers** | **57** | **28** ANNOTATION-NODE family (this slice migrates 13 of its 18 functions = 18 of its 28 calls; the other 10 are name PRODUCERS) · **21** union-ATOM family (`unionHasRefArrayArmSlot` & friends — the REFUTED set, see below) · **8** stored-column (4 of them `refListElemNameOfExpr`, plus the `rlElemInnerSlot` / `mvValInnerRlSlot` fall-throughs already inside migrated chokepoints) |

Name PRODUCERS across the consumer classes: **14** calls in 6 functions.

### Shape vs intern state, per site

Every consumer this slice touches asks **intern state**, and is migrated as such — *"which
ref-list ROW holds this annotation's element"*, answered by `rlSlotOfTy` (the layer's own
`repElemKey` lookup). None is migrated to the structural *"a `TyArray` over a non-scalar
element"* dual that D-UNION batch 3 refuted, because that dual drops `nameIsRefArray`'s
extra requirement — that the element be NAMEABLE by the reflist layer. Asking for the ROW
asks the intern question directly, so the refuted gap (a degenerate `rlSlotByName("") == -1`
matching a caller's `-1`) cannot open: a missing row is `-1` and every caller keeps its name
path there.

Three helpers carry it (`emit_classify.vl`): `annRefArrSlot` (`| null`-tolerant, matching
the callers that peel `nullablePartOf` first), `annBareRefArrSlot` (non-nullable only — the
callers that ask `nameIsRefArray` of the WHOLE annotation get NO for `S[] | null`, so the
arena leg must too) and `annNulRefArrSlot` (its dual), over `annTyNulFlag`'s tri-state.

### 13 consumers migrated, in one gated batch

| tag | consumer | question | probe reach (corpus files) | sabotage (vs migrated, 1,269 files) |
|---|---|---|---|---|
| A-SLOT | `tyAnnRefListSlot` | element ROW | 174 | 154 build-fail + 11 byte-diff |
| A-KIND | `tyAnnRefListKind` | ROW's interned kind | 172 | **see below** — 39 build-fail + 55 byte-diff only after leaving the equivalence class |
| B-PAR | `nulRefArrayInnerSlot` (param arm) | inner ROW (READ half) | 4 | 3 build-fail + 1 byte-diff |
| B-LET | `nulRefArrayInnerSlotOfLet` | inner ROW (WRITE half) | 7 | 6 build-fail + 1 byte-diff |
| C-RET | `retRefArrFlag` | is a ref array | 52 | 15 build-fail + 37 byte-diff |
| C-PAR | `paramRefArray` | is a ref array | 25 | 25 build-fail |
| D-RETN | `retNulRefArrFlag` | is a NULLABLE ref array | 7 | 7 build-fail |
| D-LETN | `letIsNulRefArray` | is a NULLABLE ref array | 8 | 7 build-fail + 1 byte-diff |
| E-LETRA | `letIsRefArray` (residual behind `annRepKindOf`) | is a ref array | 55 | 50 build-fail + 5 byte-diff |
| F-STR | `letIsStringArray`'s ref-array reject | is a ref array | 55 | 29 build-fail + 26 byte-diff |
| F-F32 | `letIsF32Array`'s ref-array reject | is a ref array | 50 | 30 build-fail + 20 byte-diff |
| F-I64 | `letIsI64Array`'s ref-array reject | is a ref array | 53 | 29 build-fail + 21 byte-diff |
| F-F64 | `letIsF64Array`'s ref-array reject | is a ref array | 53 | 29 build-fail + 21 byte-diff |

Read/WRITE pairs moved together: B-LET (the kind-18 local's stored inner slot) with B-PAR
(the param/expr read of the same slot), and D-LETN (which bindings ARE kind 18) with B-LET
(what slot they store).

### The A-KIND sabotage that proved the method, not the site

The first `A-KIND` sabotage rotated the returned kind `1→2, 2→5, 5→1`. It produced **0
byte-diffs and 0 run-diffs over 1,269 corpus files**, and — with the WHOLE classifier
rotated, both legs — **0 differences over 25,200 fuzz programs**. That is not an inert
site; it is a sabotage that never left the equivalence class. `tyAnnRefListKind`'s only
consumer is `pendingListKind`, and `emitArr`'s `== 1`, `== 2` and `== 5` arms have
**byte-identical bodies** (`isRefLit = true`, the three scalar-literal flags cleared). The
class boundary is *list vs NOT-a-list*. Answering `0` where the arena leg answers reddens
immediately: 39 build failures + 55 byte-diffs. Recorded because "perturb the equivalence
classes and verify you actually left the class" is otherwise easy to believe you did.

### What did NOT move, and why

- The **union-ATOM family** (`unionHasRefArrayArmSlot`, `unionRefArrayArmSlotForElemAtom`,
  `unionRefArrayArmSlotForMapElem`, `unionNestedArrayArmSlot`, `unionHasMapArrayArm`,
  `calleeIsUnionElemFieldClosure`, `unionClosureArrElemUnion`,
  `unionStructArmMapListElemIndex`, `unionListElemMapFieldMember`) stays put — these are
  exactly the sites D-UNION batch 3 refuted, and their input is a rendered ATOM, not a node.
  The arena route for them is `unMemTys`/`unMemAtoms`, which is a separate slice.
- The **14 name-PRODUCER calls** stay: converting them moves the parse to their consumers unless
  the consumers move first. `refListElemNameOfExpr` in particular feeds an INTERN site, a
  name COLUMN and two NOMINAL lookups.
- `annParamKind` / `annRetKind` receive a **substring of a rendered function type**
  (`annSplitParams`), with no node to key on; they retire with the `$fnsig` producer (D3).

### Parsers deleted: 0 — and what deletion would take

Every leg is ladder-faithful (D1 leg C): the arena answers first, the name path is the
untouched fall-through, so the parse CALL count is unchanged at 99 — **18 of those 99 calls
now sit behind an arena leg that answers first**. Deleting a name leg
needs the arena leg proven **total** for that site's input, which means `nodeTyIx` coverage
for every annotation node that reaches it — the C1-endgame question, not this slice's.
The honest scorecard for a slice of this shape is *consumers migrated*, not *calls removed*.

### Gate

Corpus **byte-identical + run-identical** (1,269 files) · 66-case battery **0 divergences**
· shared-instance `vl run --batch` **700 programs in ONE instance, rc 0, 0 traps, identical
transcript** · fuzz A/B **25,200 programs/side** (seeds 1-14 × depths 4,5,6 × {plain,
`--declared`} × 300) with identical shape sets · additive probe **0 disagreements** over
1,271 corpus files and over 25,200 fuzz programs, with all 13 sites confirmed REACHED by
the separately-built inverted (agreement) marker — never the same build as the
disagreement channel. `refresh-compiler.sh` / `rep-fuzz-check.sh` / `native-fixpoint.sh` /
`lint-self.sh` / `SELFHOST_NATIVE_ALIGN=1 deno task test` (1,953 passed) / `fuzz-sweep.sh`
all RC=0.

## D-TOTALITY — the DECLINE-rate map: which name fall-throughs are dead weight (#1106)

Fifteen slices of ladder-faithful migration have deleted **zero** parsers, and #1105 said
why: deletion needs the arena leg proven **TOTAL** for its input. This slice measures the
thing that decides it — not what the arena leg *answers*, but what happens where it
**declines**.

Every ladder-faithful leg in this program has a decline branch: the arena says "I do not
cover this" and the name fall-through — a type-string PARSE — runs. Two questions per
site, and they are not the same question:

- **reach** — was the decline branch entered at all (did the parse RUN)?
- **consequential** — was the decline entered AND did the name path's answer DIFFER from
  the value the caller would get if the fall-through were simply deleted (did the parse
  MATTER)?

A leg whose decline is reached 47,000 times and is **never consequential** is dead weight
on the sampled surface. A leg reached 6 times and consequential all **6** is load-bearing.
Reach alone cannot tell those apart, which is why every earlier scorecard in this document
under-determined the deletion question.

### Method

One probe build, 48 instrumented decline branches, a tag accumulated per site and reported
ONCE at the end of `emitProgram` through `emitFail`. A pure REACH probe, so the abort IS
the intended signal and channel separation (method note 7) does not apply — but the
**consequential** channel is a comparison, so it was sabotage-verified on a **separately
built inverted** compiler (`ttNote` flipped: the `+` tag fires exactly where the reach
probe's does not). Corpus = 1,269 files (`tests/cases` + `std/` + the compiler's own
source); fuzz = **48,153** programs (seeds 1–14 × depths 4,5,6 × {plain, `--declared`} ×
300). The fuzz GENERATOR runs on the master seed — the probe compiler fails every build by
design and cannot host it.

### The map (reach / consequential, corpus · fuzz)

| tag | leg — its name fall-through | corpus R/C | fuzz R/C | verdict |
|---|---|---|---|---|
| SFTGT | `sFieldTgtStructIdx` → `structIndexByName` | 6 / **6** | 0 / 0 | **load-bearing, 100%** |
| MVNIC | `mvSlotNullable` → `nulRefMapValInnerOf` | 6 / **6** | 122 / **122** | **load-bearing, 100%** |
| MSCNT | `unionSetNonNullCount` → `nonNullMemberCountOf` | 17 / **17** | 26 / **26** | **load-bearing, 100%** |
| RLLSR | `rlElemLitStructRow` → `nullablePartOf` + `structIndexByName` | 25 / **17** | 197 / **90** | **load-bearing, ~50%** |
| RLSR | `rlElemStructRow` → `structIdxOfElemName` | 103 / **28** | 1,920 / **246** | **load-bearing, ~15%** |
| MSNUL | `unionSetHasNull` → `unionHasAtom` | 149 / **33** | 6,351 / **289** | **load-bearing, ~5%** |
| WSFRL | `sFieldRefSlot` → `rlSlotByName` | 492 / **6** | 15,621 / **12** | **load-bearing, 0.1%** |
| ASLOT | `tyAnnRefListSlot` → `nameIsRefArray` + `rlSlotByName` | 917 / 0 | 46,085 / 0 | never consequential |
| AKIND | `tyAnnRefListKind` → `nameIsRefArray` + `refArrElemKind` | 917 / 0 | 46,085 / 0 | never consequential |
| DLETN | `letIsNulRefArray` → `nullablePartOf` + `nameIsRefArray` | 550 / 0 | 29,752 / 0 | never consequential |
| DRETN | `retNulRefArrFlag` → `nullablePartOf` + `nameIsRefArray` | 777 / 0 | 28,953 / 0 | never consequential |
| CRET | `retRefArrFlag` → `nameIsRefArray` | 760 / 0 | 27,644 / 0 | never consequential |
| CPAR | `paramRefArray` → `nameIsRefArray` | 801 / 0 | 11,481 / 0 | never consequential |
| ELETRA | `letIsRefArray` → `nameIsRefArray` | 14 / 0 | 26 / 0 | never consequential |
| FSTR | `letIsStringArray`'s ref-array reject | 18 / 0 | 167 / 0 | never consequential |
| FF32 | `letIsF32Array`'s ref-array reject | 16 / 0 | 167 / 0 | never consequential |
| FI64 | `letIsI64Array`'s ref-array reject | 18 / 0 | 169 / 0 | never consequential |
| FF64 | `letIsF64Array`'s ref-array reject | 19 / 0 | 169 / 0 | never consequential |
| NBNSTR | `retNulStringFlag` → `nullablePartOf(tyNameOf)` | 944 / 0 | 48,153 / 0 | never consequential |
| NBCLO | `nulCloFlag` → `nameIsNulClosure` | 737 / 0 | 12,994 / 0 | never consequential |
| NBNLST | `retNulListFlag` → `nameIsNulI32List` | 721 / 0 | 11,565 / 0 | never consequential |
| NBCLOA | `nameIsClosureArrayTy` → `nameIsClosureArray` / `nullClosureArrElem` | 24 / 0 | 16 / 0 | never consequential |
| SFLU | `sFieldIsLitUnion` → `nameIsLitUnionType` | 269 / 0 | 5,505 / 0 | never consequential |
| UFLU | `variantFieldIsLitUnion` → `nameIsLitUnionType` | 138 / 0 | 1,675 / 0 | never consequential |
| SFLUA | `sFieldIsLitUnionArray` → `nameIsLitUnionArray` | 22 / 0 | 184 / 0 | never consequential |
| UFLUA | `variantFieldIsLitUnionArray` → `nameIsLitUnionArray` | 23 / 0 | 20 / 0 | never consequential |
| UFRL | `variantFieldRefSlot` → `rlSlotByName` | 193 / 0 | 3,647 / 0 | never consequential |
| CRLMV | `rlMapElemValSlot` → `mapValNameOf` + `mvSlotByValNameOr` | 26 / 0 | 408 / 0 | never consequential |
| WSFMV | `sFieldMapValSlot` → `mvSlotOfValNameFind` | 10 / 0 | 349 / 0 | never consequential |
| WUFMV | `uFieldMapValSlot` → `mvSlotOfValNameFind` | 2 / 0 | 29 / 0 | never consequential |
| RLNMV | `rlElemNulMapValMvSlot` → `nulMapInnerName` + `mapValNameOf` | 20 / 0 | 105 / 0 | never consequential |
| RLMV | `rlElemMapValMvSlot` → `mapValNameOf` | 4 / 0 | 97 / 0 | never consequential |
| MVSN | `mvUnionIsScalarNull`'s atom tail | 4 / 0 | 26 / 0 | never consequential |
| RLNIC | `rlElemIsNulNiche` → `nullablePartOf` | 5 / 0 | 0 / 0 | never consequential |
| MVCK | `mvValCanonKey` → `repNameCanonKey` | 0 / 0 | 4 / 0 | never consequential |
| MVMV | `mvValInnerMvSlot` → `mapValNameOf` | 1 / 0 | 0 / 0 | never consequential |
| RLCSK | `rlElemCloSigKey` → paren-strip + `annSigKey` | 0 / 0 | 1 / 0 | never consequential — **now pinned** |
| ARK | `annRepKindOf` → `null` (the D-CLASSIFY name ladders) | 164 / – | 4,192 / – | reach-only channel |
| MSSUB | `removeAtomFromSet` → `removeAtomFrom` | 27 / – | 2 / – | reach-only channel |
| MSIT | `msMemberAtomsOf` → `splitUnionAtoms` (15 sites) | 17 / – | 0 / – | reach-only channel |
| NBSCAL | `nodeScalarName`'s uncovered-node arm | 873 / – | 48,153 / – | reach-only channel |
| NBAEL | `arrElemRep`'s uncovered-node arm | 769 / – | 48,153 / – | reach-only channel |
| RLIN | `rlElemInnerSlot` → `refArrElemName` + `rlSlotByName` | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| MVRL | `mvValInnerRlSlot` → `refArrElemName` + `rlSlotByName` | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| MVNUL | `mvValUnionHasNull` → `unionHasAtomTy` | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| UBAT | `unionHasAtomTy` → `unionHasAtom` | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| UFTGT | `uFieldTgtStructIdx` → `structIndexByName` | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| BPAR | `nulRefArrayInnerSlot`'s param arm | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| BLET | `nulRefArrayInnerSlotOfLet` | **0** / 0 | **0** / 0 | **NEVER REACHED** |
| NBBOOL | `tyIsNulBool` → `nullablePartOf` | **0** / 0 | **0** / 0 | **NEVER REACHED** |

The `MSIT` row deserves its own note: `msMemberAtomsOf`'s decline — the 15 surviving
`splitUnionAtoms` iteration sites — is reached by **17 files, every one of them
`compiler/*.vl`**, and by **0** of 48,153 fuzz programs. The union set ADT's alias-decline
is a compiler-scale phenomenon; nothing in `tests/cases` exercises it.

**Channel sabotage (the inverted build, corpus).** Every site with reach > 0 lit its `+`
tag under inversion, at exactly its reach count — `AKIND` 917 · `NBNSTR` 944 · `CPAR` 801 ·
`DRETN` 777 · `CRET` 760 · `NBCLO` 737 · `NBNLST` 721 · `DLETN` 550 · `WSFRL` 492 ·
`SFLU` 269 · `UFRL` 193 · `MSNUL` 124 · `RLSR` 75 · `CRLMV` 26 · `NBCLOA` 24 ·
`UFLUA` 23 · `SFLUA` 22 · `RLNMV` 20 · `FF64` 19 · `FSTR`/`FI64` 18 · `FF32` 16 ·
`ELETRA` 14 · `WSFMV` 10 · `RLLSR` 8 · `RLNIC` 5 · `RLMV` 4 · `WUFMV` 2 · `MVMV` 1 — and
the three 100%-consequential sites (`SFTGT`, `MVNIC`, `MSCNT`) correctly lit **nothing**.
So the consequential channel is live at every measured site, and a 0 there is a
measurement rather than a dead wire.

Two sites need their `0` read carefully. `ASLOT`'s `+` marker sits *inside* its
`nameIsRefArray` gate and fired 0 under inversion too — meaning the gate itself is never
passed; `AKIND` evaluates the identical predicate on the identical nodes and its inverted
count (917 = its full reach) is the measurement. `MVSN`'s marker sits behind two early
`return false`s that always take.

### Parsers deleted: 0 — and this time the reason is a measured gap, not an unasked question

Eleven legs — the whole `nameIsRefArray` D-REFARR consumer family — are never consequential
across **49,422** programs. That is the strongest deletion case this program has ever had,
and it still does not close, for two mechanisms a 0-firing count cannot rule out:

1. **`nodeTyIx` coverage.** `annBareRefArrSlot` declines whenever the annotation node has
   no recorded arena type, *whatever the spelling is*. `synthTypeRef` → `recordClonedNodeTy`
   records `nameToTy(name)`, which is -1 for a name that grammar cannot parse; and the
   checker's annotation recorders (`nodeTyIx[n.fnRet]`, `[p.parType]`, `[d.letType]`,
   `[fd.fdType]`) only run for functions it actually checks. A `S[]`-spelled annotation on
   an unrecorded node makes `nameIsRefArray` say YES where the arena says nothing. Nothing
   in the corpus or the fuzz corpus produces one; the mechanism exists.
2. **`rlSlotByName`'s third rung.** `rlSlotOfTy` reproduces rungs 1–2 (exact stored name,
   `repElemKey` rescan) and deliberately **not** rung 3, the struct-twin name fallback,
   which has no arena input. That rung is not hypothetical: it is exactly what makes
   `WSFRL` consequential on 6 corpus files and 12 fuzz programs.

And (2) carries the slice's sharpest finding, a **sibling asymmetry**: `sFieldRefSlot`
(`WSFRL`) and `variantFieldRefSlot` (`UFRL`) are the same four lines over the struct table
and the variant table. `WSFRL`'s fall-through is consequential 18 times; `UFRL`'s is
consequential **0** times in 3,840 reaches. Deleting `UFRL`'s name leg on its 0 would be
deleting the twin of a leg proven load-bearing. **A 0 does not transfer between siblings**,
and the minimal witness is `type T0 = {f: {f: string}}` used as `T0[]` at a param while the
value is spelled inline `{f: {f: string}}[]` — the declared-vs-inline spelling twin rung 3
exists for (fuzz seed 13, depth 5, `--declared`).

### Reachability study — the eight NEVER-REACHED legs

`RLIN`, `MVRL`, `MVNUL`, `UBAT`, `UFTGT`, `BPAR`, `BLET`, `NBBOOL`: 0 reaches in 49,422
programs. Per #1099's discipline a 0 is not a proof, so each was worked backwards to the
mechanism that would generate it and eight programs were constructed against those
mechanisms. **No reacher was found** — and no impossibility could be argued either. These
are the specific blockers, recorded so the next attempt starts here rather than at the
sampling:

- **`RLIN`** needs a ref-list slot whose element is a NESTED array *and* whose `rlElemTyIx`
  is uncovered. Uncovered rl rows are common (`RLNIC` finds 5, all inline-shape element
  rows whose stored name is a `#anonN` the resolver declines) — but an `#anonN[]` element,
  i.e. a nested array of an inline shape, is a **loud reject** today (`emitProgram: nested
  arrays are not supported`). The two preconditions do not currently intersect.
- **`BPAR`/`BLET`** are reachable only *through* `DRETN`/`DLETN`'s name leg: their guards
  (`paramNulRefArray`, `letIsNulRefArray`) answer via `annNulRefArrSlot` whenever the arena
  covers the node, and in that case the inner slot resolves off the same call. So these two
  are downstream of the D-REFARR question, not independent of it.
- **`UFTGT`** is the variant twin of `SFTGT`, which is 100% consequential on 6 corpus
  files — all of them ANON rows minted by object literals (`objects/pass.vl`'s
  `{a: {x: 7}, b: 2}`). A variant row's field element names come from the union arm's
  *spelling*, never a `#anonN`; and a nested-struct field on a union variant is itself a
  loud reject (`only i32 / boolean / string / array union-variant fields are supported`).
- **`MVRL`/`MVNUL`/`MVCK`** need an uncovered mv row. Every `mvValName.push` is paired with
  `recordMvValTyIx` at the single mint site, so the only gap is a value spelling
  `fieldElemTyIxOfName` cannot resolve; four fuzz programs reach `MVCK` that way, none
  consequential, and none of them is a ref-list or nested-map value.
- **`UBAT`** needs `unionHasAtomTy` called with a union NAME whose row `unMemTys` does not
  cover. Uncovered member-set TEXT is common (`MSNUL` 6,500 reaches) — but those are
  *narrowed subsets*, never registered rows, and `unionHasAtomTy`'s callers all pass a
  registered union name. The two populations do not overlap.
- **`NBBOOL`** is `tyIsFuncType`'s shape (`if nodeTyIxOf(tyIx) >= 0 { return … }`) — and
  `tyIsFuncType` has ALREADY retired its name leg in this tree on the same gate. It is the
  closest thing to a free deletion here, and it is still gated on the same unproven
  `nodeTyIx`-totality claim as (1) above.

### The one pin this slice lands

`tests/cases/closures/map-value-nullable-closure-list-elem-sigkey.vl` — the single shape in
49,422 measured programs that reaches `rlElemCloSigKey`'s name fall-through
(a `{[string]: (() => boolean | null)[]}` map value: a list of NULLABLE-returning closures).
0 corpus files, 1 fuzz program (seed 5, depth 6, plain). That fall-through computes a
`$fnsig` key — the closure ABI's identity — so its failure mode is an iso-recursively
distinct functype and a `ref.cast` trap, never a loud reject. The corpus now carries it.

### What this changes about the program's strategy

The SCORECARD CORRECTION said: kill the SOURCES, not the call sites. This map says which
sources are worth killing, and it is a much smaller set than the call counts suggest.

- **7 of 48** decline paths are load-bearing. Three of those seven fall through to
  `structIndexByName` / `nonNullMemberCountOf`, which are **nominal identity and a count** —
  explicitly not targets of this program. The genuinely load-bearing *parses* are
  `structIdxOfElemName` (`RLSR`), `nullablePartOf` (`RLLSR`), `nulRefMapValInnerOf`
  (`MVNIC`), `unionHasAtom` (`MSNUL`) and `rlSlotByName`'s twin rung (`WSFRL`). Five.
- **38 of 48** never change an answer, and 11 of those 38 are the single `nameIsRefArray`
  family. Retiring them is ONE piece of work — **prove `nodeTyIx` totality for annotation
  nodes** (the C1 endgame) and **give `rlSlotByName`'s struct-twin rung an arena input** —
  after which eleven legs fall together. That is the highest-leverage item this program has,
  and this map is what identifies it as one item rather than eleven. (Done in D-ANNSLOT
  below — 13 legs, and neither prerequisite turned out to be needed in the form stated: the
  intern pass already knows the answer and can bank it on the node.)
- The measurement also refutes a tempting shortcut: "delete the legs that never fire". Two
  of the seven load-bearing legs (`SFTGT`, `MVNIC`) fire on **6 corpus files each** — well
  inside the range a reader would dismiss as noise — and both are consequential **100%** of
  the time they fire. Low reach is not low stakes.

### Gate

Source-identical to master apart from the pin and this section, so the corpus A/B, the
66-case battery and the shared-instance batch are byte-identical by construction. The
measurement itself: probe and inverted probe each `refresh-compiler.sh` RC=0 from the
pinned master seed; corpus sweep 1,269 files per build; fuzz 48,153 programs. Standing gate
on the landed tree: `refresh-compiler.sh` / `rep-fuzz-check.sh` / `native-fixpoint.sh` /
`lint-self.sh` / `SELFHOST_NATIVE_ALIGN=1 deno task test` / `fuzz-sweep.sh` all RC=0.

## D-ANNSLOT — the first name fall-throughs DELETED: the intern pass banks its row on the node

D-TOTALITY named the one piece of work that would retire the whole `nameIsRefArray`
consumer family: prove the arena leg **total** for an annotation node. It listed two
mechanisms a 0-consequential count cannot rule out — `nodeTyIx` coverage, and
`rlSlotByName`'s struct-twin third rung. This slice closes the first, measures the second
to a sharper verdict than the one it was given, and **deletes 13 name fall-throughs**.

The unlock is not a better structural classifier. It is noticing that the question these
consumers ask has *already been answered* earlier in the same compile:

> `collectA`'s ref-array arm runs on exactly `nameIsRefArray(name) || nameIsNulRefList(name)`
> — the same predicate the consumers' name legs evaluate — and interns the element's
> ref-list ROW. That row IS what every one of those consumers wants.

So the arm banks it on the annotation NODE (`annRlSlot` / `annRlNul`, an `i32` column pair
keyed by node index, cleared with the ref-list table it names), and `annRefArrSlot` /
`annTyNulFlag` read it after the recorded type declines. The parse stays exactly where this
program always said it belonged — the **intern** side, class (iii) — and the 13 consumers
become lookups.

### Why this is total where a classifier is not

The claim needed for deletion is: *if the deleted name path would have answered, the arena
side answers.* With the sidecar it factors into three checkable parts:

1. **The predicate is the same one.** `collectA`'s arm is guarded by the very
   `nameIsRefArray` / `nameIsNulRefList` test the deleted legs ran, and the arm interns
   unconditionally (`ensureRefElem` → `rlInternName`). Measured: the arm fires on **190**
   corpus files and **3,425** fuzz programs; an EARLIER arm of the `else if` chain
   (arrow / map / nulmap / string-array) swallowing a node the predicate accepts —
   the one way the guard could be narrower than the consumers' — fires **0** times in
   1,270 corpus files and 50,400 fuzz programs, as does an empty element name.
2. **Every annotation node is walked.** `collectA` scans the whole node arena, and the
   pass table re-runs it (`collectA#2`) after `monomorphize` and `synthRetAnnots`, so mono
   clones and synthesized return pins are covered. The only two annotation SYNTHESES that
   postdate `collectA#2` — `synthParamAnnots` and `collectLocals`' inferred `<elem>[]`
   binding — record at their own mint site, on the same predicate.
   Both recorders are exercised, not defensive dead code: the param recorder's site is
   reached on **140** corpus files and banks a row on 1; the `collectLocals` site is
   reached on 4 and banks a row on 1.
3. **A node with no recorded type is no longer a hole.** `annTyNulFlag`'s -1 arm now reads
   the sidecar's `| null` flag, so an uncovered node reaches `annRefArrSlot` instead of
   being gated out of it.

Part 3 is what the C1-endgame question was blocking on, and the study says the hole is
narrower than feared. A probe that classifies **every** decline of the three helpers found,
over 1,270 corpus files and 48,153 fuzz programs: **0** nodes with no recorded arena type,
**0** covered-but-not-an-array nodes where the name sees an array, **0** rung-3-answerable
misses. The synthesis side is equally clean — `synthTypeRef` recorded -1 **0** times; the
only unresolvable-name records are the deliberate placeholder pins (`#anonN`, `=>sigkey`,
30 corpus / 22 fuzz), never an array spelling. And the checker's own recorders cannot be
skipped: `nodeTyIx` is sized to `P.nodes.length` at `checkProgram` entry, the checker
creates no AST nodes, and an annotation it cannot resolve raises a diagnostic — which
`compileSource` turns into "no emit" before the emitter ever runs.

### What was deleted (13 legs)

`tyAnnRefListSlot` · `tyAnnRefListKind` · `retRefArrFlag` · `retNulRefArrFlag` ·
`paramRefArray` · `letIsNulRefArray` · `nulRefArrayInnerSlotOfLet` ·
`nulRefArrayInnerSlot` (param arm) · `letIsRefArray` · and the ref-array rejects of
`letIsStringArray` / `letIsF32Array` / `letIsI64Array` / `letIsF64Array`.

Ref-array parser CALL counts, master → now (non-comment call sites):
`nameIsRefArray` **44 → 35**, `refArrElemKind` **14 → 12**, `refArrElemName` **44 → 42**,
`rlSlotByName` **26 → 25**, `nullablePartOf` **84 → 79** — net **−19** calls, including the
3 the two late-synthesis recorders add back. The parser FUNCTIONS stay: they are the intern
side's own machinery, which is where this program has always said the parse belongs.

### Decline-rate re-measurement

The 13 legs' fall-throughs no longer exist, so their reach is 0 by construction. Two
measurements are worth recording instead.

- **Before deleting**, the same D-TOTALITY probe re-run on the sidecar tree reproduced
  master's numbers exactly (corpus: `ASLOT`/`AKIND` 918, `CPAR` 802, `DRETN` 778,
  `CRET` 761, `DLETN` 551, `ELETRA` 14, `FSTR`/`FI64` 18, `FF64` 19, `FF32` 16;
  consequential **0** everywhere) — and an added marker inside `ASLOT`'s decline shows its
  `nameIsRefArray` gate is passed **0** times, so the whole 918-file decline population is
  "not a ref array at all".
- **The sidecar itself never fires**: on 1,270 corpus files and 46,310 reaching fuzz
  programs, `annRefArrSlot`'s recorded-type leg answers or nothing does — the sidecar
  supplied a row **0** times, and its `| null` flag **0** times. It is a proof obligation
  discharged, not a hot path: it exists so that an uncovered node or a synthetic-`#anonN`
  element row cannot silently answer "not a ref array" now that the name legs are gone.

### The struct-twin rung: the QUERY half migrates, the CANDIDATE half does not

D-TOTALITY attributed `sFieldRefSlot`'s (`WSFRL`) load-bearing fall-through to
`rlSlotByName`'s third rung and asked whether that rung can take an arena input. It can be
*asked* structurally — and the answer, measured, is that only half of it currently resolves:

- A structural rung was implemented three ways (query row via `repSlotOfTy`, via
  `structIndexOfTy`, via `repRowOfTyStruct`), each byte- and run-identical over 1,270
  corpus files and 50,400 fuzz programs — and each answered **0** of the 6 corpus cases
  where the name rung answers. Byte-identical AND useless is the honest reading: it was not
  landed.
- A per-call diagnostic at those 6 witnesses says why. The QUERY half migrates cleanly:
  `repRowOfTyStruct(elemTy, sScanLim())` picks the **same** struct row as
  `structIndexOfTypeName(qBase)` at 6/6. The `| null` niche parity migrates too
  (`rlElemIsNulNiche` never disagreed with the stored name's `nullablePartOf`). The
  CANDIDATE half does not: `rlElemStructRow(j)` — the ROW's own element→struct-row
  resolution — differs from `structIndexOfTypeName(eBase)` at every witness, and the row's
  (covered!) element type does not canon-resolve to the name's row either. Substituting the
  name's candidate resolution makes the rung answer immediately.
  **The blocker is `rlElemStructRow`, not `rlSlotOfTy`** — the next slice's target, and a
  smaller one than "give the twin rung an arena input" suggested.
- One correction to the D-TOTALITY map: `WSFRL`'s 6 consequential corpus declines all have
  a **covered** element type (`WSFRLU`, the uncovered-element population, is 465 files and
  is consequential **0** times). They are genuinely the twin-spelling class, not the
  `#anonN` class — which is why the fix is a resolution-vocabulary fix and not a coverage one.

### Gate

Corpus **byte-identical + message-identical** (1,270 files, `vl build` bytes and the
compiler's full stdout/stderr) · fuzz A/B **50,400 programs/side** (seeds 1-14 × depths
4,5,6 × {plain, `--declared`} × 300), whole `--batch` output trees compared, **0** diffs ·
66-case battery **0** diffs · shared-instance `vl run --batch` **700 programs in ONE
instance**, rc 0, **0** traps, transcript and every output identical · sabotage (the bare
leg forced to decline, i.e. the deletion made wrong) **163** corpus diffs and **288** fuzz
diffs, so the A/B has power at these sites. `refresh-compiler.sh` / `rep-fuzz-check.sh` /
`native-fixpoint.sh` / `lint-self.sh` / `SELFHOST_NATIVE_ALIGN=1 deno task test` (1,954
passed) / `fuzz-sweep.sh` all RC=0.

## D-NARROW — the NARROWING TABLE stops storing a parsable type (#1108)

`narrowVariants[i]` — the type a binding is narrowed to, as a rendered string — was the
last big string-keyed structure in the emitter, and #1104's own report named it: *"the
narrowing table itself still stores rendered strings — that last one is what converts
this into a time win."* Every read of a narrowed binding re-classified that string
(`valueAtomKind` → `nameIsFuncTypeAtom` → `annArrowAt`, `nameIsRefArray`, `nameIsMap`),
and every complement narrowing rendered a member set only for the next complement to
parse it back.

### The enumeration (local-aware, by resolver called)

A scan of all 16 compiler modules for every mention of the table and its accessors
(`narrowNames` / `narrowVariants` / `narrowTop` / `narrowVariantFor` / `pushNarrow` /
`currentNarrowSetOf` / `currentStructNarrowSetOf`), resolving each bare-identifier result
to its binding and every later use of that local inside the same function (method note 9):
**99 match lines**, of which 57 are local-uses.

| class | sites | what |
|---|---|---|
| WRITERS | **19** `pushNarrow` calls, all in `emit_classify` | 3 `is`-tests (ident / member path / `?.` path), 4 `null` pins, **12** complement pushes whose value is a `removeAtomFromSet` rendering |
| the table itself | 6 | declaration (`emit_state`), reset (`emit_sections`), the push + the innermost-slot scan |
| READERS that only ask "is it narrowed" / nominal identity | 8 | `memIsNarrowed` ×2, `memNarrowVariantIndex` ×2 (`variantIndexOf` — nominal), `memberIsClosure`, `emitNarrowedMem` ×2, `exprUnion`'s member arm |
| READERS that PARSE the stored string | **7** | `narrowedValueAtomOf`, `narrowedRefArrayOf`, `narrowedMapOf` (+ `narrowedClosureOf` through the first), `exprNulStrArray`'s `nameIsNulStrList`, `unionNameOfExpr`'s `valueAtomKind`, and `emitNarrowedMem`'s `valueAtomKind` (wasmEmit) |
| READERS that do SET ALGEBRA on it | **14** | the 12 complement writers' own `currentNarrowSetOf` / `currentStructNarrowSetOf` reads, plus `emitMem`'s `splitUnionAtoms(currentStructNarrowSetOf(…))` and `emitCoalesce`'s `removeAtomFrom(currentNarrowSetOf(…))` (both wasmEmit — hand-offs, below) |

### The representation

Two `i32` columns beside `narrowVariants`, both -1 where they do not apply, so every
consumer keeps its rendered path as the fall-through:

- **`narrowSets`** — the interned member-SET id of a COMPLEMENT narrowing. A complement is
  by construction a subset of the receiver's union row, which is exactly #1104's
  `(row, mask)` ADT: `msSubNull` / `msSubAtom` already compute the surviving set, and the
  push now BANKS that id instead of throwing it away and re-deriving it from the rendering
  at the next subtraction (`currentNarrowSetIdOf` reads the banked id; its un-narrowed leg
  is the same `msSetOfText` the string path used, so the deliberate ALIAS decline is
  unchanged).
- **`narrowTys`** — the arena TYPE of an `is`-test narrowing. This is the #1107 technique,
  not a new classifier: `checkIsExprNode` ALREADY resolves the tested spelling
  (`nameToTy(n.isVariant)`, to enforce the variant-membership rule) and now banks it on the
  `is` NODE (`isVarTyIx` / `isVarTyIxOf`, sized and cleared with `nodeTyIx` at
  `checkProgram`). The emitter's push carries it; an emitter-synthesized (monomorphized)
  `is` node reads -1 and lands on the name path.

`narrowSlotOf` is the one stack walk the queries share, and `narrowSlotTy` resolves a
slot's type from either column — a complement that has subtracted down to ONE member
(`i32 | null` minus `null`) binds that member's type via `msSoleMemberTy`.

### What migrated (and the containment)

| tag | site | arena leg | probe reach (corpus / fuzz programs) |
|---|---|---|---|
| V | `narrowedValueAtomOf` | `unMemAtomKind` (`valueAtomKind`'s arena dual) REJECTS a non-atom, non-litunion type | 200 / 1,520 |
| R | `narrowedRefArrayOf` | `unMemAtomKind >= 0` or `!unMemIsRefElemArray` REJECTS | 188 / 1,604 |
| M | `narrowedMapOf` | `!unMemIsMap` REJECTS | 181 / 1,252 |
| C1 | `setNarrowFromCond` value-union `!= null` | banked set − `null` | 39 / 1,200 |
| C2 | `setNarrowFromCond` struct-union `!= null` | banked set − `null` | 13 / 170 |
| C3 | `setNarrowFromCondElse` value-union `is` | banked set − atom | 82 / 1,873 |
| C4 | `setNarrowFromCondElse` member-PATH `is` | banked set − atom | 6 / 0 |
| C5 | `setNarrowFromCondElse` struct-union `is` | banked set − atom | 213 / 2,544 |
| C6 | `setNarrowFromCondElse` value-union `== null` | banked set − `null` | 1 / 0 |
| C7 | `setNarrowFromCondElse` struct-union `== null` | banked set − `null` | 2 / 0 |
| C8 | `pushPostGuardNarrow` assignment narrowing | declared set − `null` | 3 / 0 |

The three READ legs are deliberately **reject-only**. The narrowed value's rendering is
NOMINAL (`is N` where `type N = i32` renders `N`, and the answer these functions return IS
that spelling), so an accepting arena leg would answer where the name path declines — the
D5-final "wrong renderer" trap. Rejecting is sound in the other direction and is where the
cost is: `valueAtomKind`'s reject path runs the whole ladder down to `annArrowAt`, and the
dominant narrowed binding (a struct variant) is exactly a reject. Measured: the arena leg's
ACCEPT direction agrees too (`VK` — arena kind == name kind — on 317 corpus files and 5,291
fuzz programs, `RK` on 36/163), so the containment costs nothing today; it is insurance
against the alias spelling nothing in the corpus produces. Worked backwards to its
mechanism (per #1099's discipline), that spelling turns out to be a **loud reject** on
today's surface — `type N = i32; function f(x: N | string) { if x is N { … } }` fails with
`emitProgram: \`is\` names a type that is not a union variant`, on master and on this tree
alike. So the accepting arena leg would very likely have been safe; the reject-only shape
is kept because "very likely" is not the standard this program uses, and it costs nothing.

### Probe

Additive, all 11 sites at once, both answers computed, the OLD one kept, one accumulating
tag reported once at the end of `emitProgram`: **0 disagreements** over **1,272** corpus
files and **50,400** fuzz programs. Coverage came from a SEPARATELY BUILT inverted compiler
(method note 7) — the table above is its output; every site is reached, and the banked-type
rate at the read sites is **317 covered / 60 uncovered** corpus files (`VC`/`VU`).

### The measurement: parses removed, deterministically — and the time that did NOT move

This slice was expected to be where #1104's representation became a time win. It is not,
and the reason is worth recording precisely.

**What moved (deterministic).** Two instrumented compilers — master + counters and
migrated + counters — compiling the **same fixed input** (a snapshot of master's
`compiler/`), each reporting its call counts once at the end of `emitProgram`. No sampling,
no load sensitivity:

| parser | master (49c8c78) | migrated | Δ |
|---|---|---|---|
| `annArrowAt` | 183,173 | 160,885 | **−12.2%** |
| `valueAtomKind` | 72,981 | 56,363 | **−22.8%** |
| `nameIsFuncTypeAtom` | 70,936 | 54,318 | **−23.4%** |
| `nameIsRefArray` | 29,353 | 23,781 | **−19.0%** |
| `nameIsMap` | 114,347 | 108,885 | **−4.8%** |
| `removeAtomFrom` | 2,090 | 2,090 | 0 |
| `splitUnionAtoms` | 33,423 | 33,423 | 0 |
| `unionHasAtom` | 322 | 322 | 0 |

One in five re-classifications of a narrowed binding is gone. The WRITE side does not move:
#1104 had already routed `removeAtomFromSet` through the set ADT, so banking the id removes
a render→re-parse round trip *inside* it, not a call to the string surgery.

**What did not move (wall clock).** Interleaved A/B, `vl build compiler/entry.vl` with the
`.cwasm` AOT sidecar WARM (one untimed run per side first; the sidecar is worth ~10× on the
absolute), on an otherwise quiet box (load average 4–12):

| block | master seed | migrated seed |
|---|---|---|
| min of 25 (at 9068bdb) | **1,240 ms** | **1,237 ms** |
| min of 12 (at 9068bdb) | **1,247 ms** | **1,234 ms** |
| min of 14 (rebased, at 49c8c78) | **1,244 ms** | **1,249 ms** |

That is parity — a ±13 ms difference against a 20–30 ms run-to-run spread, and the sign is
not stable across blocks. Earlier blocks
taken while a concurrent agent loaded the box to average 130–220 read 1,418 / 1,329 ms and
should be ignored; a loaded box's min is not a clean estimator here.

**Why, arithmetically.** The parsers this slice thins are ~3% of a self-compile, not 26%:
`annArrowAt` 1.49% self, `nameIsRefArray` 1.66% inclusive, `valueAtomKind` 1.19% inclusive,
`removeAtomFrom` **0.65% inclusive / 0.01% self** (the ~2.2% figure predates #1104's set
ADT). Cutting 12–23% of a 3% surface is ≈0.5% of compile time — below what this harness can
resolve. The 26% `__str_eq__` bill is identifier/symbol resolution, `modSrcPush` and
`fnStmtsPosOf`, none of which the narrowing table touches.

**Profile, before/after** — the profiled compiler is each side's OWN `--names` build, both
compiling the same fixed input, 10 runs aggregated per side (13,785 / 16,108 samples).
Reported for completeness; at these sample counts the error bars (±0.1–0.2% on a 1% entry)
exceed the effect:

| function (self / incl) | master | migrated |
|---|---|---|
| `__str_eq__` self | 26.70% | 25.54% |
| `__str_concat__` self | 0.86% | 1.15% |
| `annArrowAt` self | 1.49% | 1.51% |
| `nameIsFuncTypeAtom` self | 0.91% | 0.83% |
| `removeAtomFrom` incl | 0.65% | 0.65% |
| `splitUnionAtoms` self | 0.31% | 0.31% |
| `narrowedValueAtomOf` incl | 0.84% | 0.66% |
| `narrowedMapOf` incl | 0.20% | 0.14% |
| `narrowedRefArrayOf` incl | 1.81% | 1.84% |
| `valueAtomKind` incl | 1.19% | 1.05% |

A methodological trap worth recording: the obvious profiling recipe — build `named.wasm`
from the CURRENT source with each seed, then profile each — produces **byte-identical**
binaries on a byte-identical migration, so "before" and "after" profile the *same compiler*.
The profiled artifact must be built from each side's OWN source; the fixed thing is the
INPUT.

### Gate

Corpus **byte-identical AND message-identical** (1,272 files: `tests/cases` + `std` +
`compiler` + `scripts`; both `vl build` bytes and the compiler's full stdout/stderr) and
**run-identical** (1,010 `@run` files) · fuzz A/B **50,400 programs/side** (seeds 1-14 ×
depths 4,5,6 × {plain, `--declared`} × 300), whole `vl run --batch` output TREES compared
(`diff -r`, `.out` + `.err` + per-config transcript): **0** diffs · 66-case battery **0**
diffs · shared-instance `vl run --batch` **1,009 programs in ONE instance** per side, rc 0,
**0** traps, 986 outputs, tree and transcript identical.

**Gate-channel sabotage, per site** (each arena leg pushed OUT of its equivalence class —
the reject legs made to reject every banked slot, the complement made to bank the
UN-subtracted set), A/B'd against the migrated compiler over the 1,272-file corpus:

| sabotage | build-status | message | run-status |
|---|---|---|---|
| V (`narrowedValueAtomOf`) | 39 | 159 | 193 |
| R (`narrowedRefArrayOf`) | 36 | 0 | 36 |
| M (`narrowedMapOf`) | 28 | 0 | 28 |
| C (the complement banking) | 23 | 58 | 80 |
| ALL | 113 | 130 | 238 |

**Comparator sanity** (method note 12): the ALL sabotage was pushed through the *fuzz*
harness at the volume the real A/B used — **9,101** differing paths over the same 50,400
programs that reported 0. The comparator has power at the volume it is quoted at.

`refresh-compiler.sh` / `rep-fuzz-check.sh` (exact, 0 new / 0 stale) / `native-fixpoint.sh`
(stage3 == stage4) / `lint-self.sh` / `SELFHOST_NATIVE_ALIGN=1 deno task test` (1,367 passed,
0 failed) / `fuzz-sweep.sh` all RC=0.

The whole net was re-run after rebasing onto D-UNION-ATOM (#1108), which lands in the same
subsystem: corpus 1,272 files byte/message/run-identical, fuzz A/B 50,400 programs/side with
0 tree diffs, battery 0 diffs, shared-instance 1,009 programs 0 traps 0 diffs, and every
standing script RC=0 again. The parse counts above are measured against 49c8c78.

### What did NOT move

- **The two `wasmEmit.vl` readers of the table** — `emitMem`'s member-set dispatch and
  `emitCoalesce`'s `??` complement — were migrated to the set ADT by D-UNION-ATOM (#1108)
  while this slice was in flight, so they now resolve the narrowed set from its RENDERING
  (`msMemberAtomsOf` / `removeAtomFromSet` both start at `msSetOfText`). Both are one line
  from the banked id: export `currentNarrowSetIdOf` and they skip the text→set resolution
  entirely. Left as the obvious next step rather than taken across a concurrently edited
  file.
- `exprNulStrArray`'s `nameIsNulStrList(narrowVariantFor(…))` and `unionNameOfExpr`'s
  member-path `valueAtomKind`: both read a narrowed value keyed by a member PATH, where the
  slot's banked type exists but the question ("a `(string | null)[]` list") has no
  measured dual today. Left on the name path.
- The `null` pins (`pushNarrow(nm, "null")`) bank nothing: `valueAtomKind("null")` is the
  first string compare in the ladder, so there is nothing to save.

## D-ATOMKIND — the value-atom KIND is banked at the recorder, and 13 parses DELETED (#1110)

D-UNION-ATOM (#1108) cleared the member-SET algebra in `wasmEmit.vl` + `emit_collect.vl` and
left the ATOM algebra with an explicit hand-off:

> The `valueAtomKind` / `scalarTagOf` / `vbHeapIdxOfAtom` family stays. `unMemKinds` is a
> 5-way classifier and cannot produce a `valueAtomKind` code, which is a 13-way ABI tag.
> The D-ANNSLOT technique applies exactly — `markValueUnionAtoms` already computes the kind
> per atom and could bank an `unMemValKind` column — but that column lives in
> `emit_state.vl` / `emit_rep.vl`. **HAND-OFF**, with #1095's warning attached.

This slice takes it, and the enumeration moved the producer one step earlier than the
hand-off named: **`recordUnMemTys` is the right recorder, not `markValueUnionAtoms`**.

### Where the storage went, and why

`emit_state.vl` — the natural home, beside `unMemKinds` — is owned by a concurrent agent, so
the column lives in `emit_rep.vl` (this slice's file), which is where `recordUnMemTys` already
is. That turned out to be the better home anyway, for three reasons:

- `recordUnMemTys` is the ONE place a member set is ever split, and it holds each member's
  atom TEXT already. `markValueUnionAtoms` runs only for rows that pass
  `isValueUnionName` / `nameIsLitUnionArmValueUnion`; the recorder runs for **every**
  registered row, so banking there covers strictly more.
- The banked value is `valueAtomKind(a)` on the very string the consumers would pass —
  **exact, not a fold** (#1095). No re-classification, no `unMemKinds` substitute.
- The reset lives with the write. `unMemAtoms` is cleared from ABOVE this module (the top of
  `emitProgram`, `collectU`), which cannot see a column in `emit_rep`; the recorder observes
  the disagreement as a length mismatch and re-empties in the same call.

### The enumeration (local-aware, by resolver called)

A `scan_sites.py`-style scan of the three files for every call to the atom algebra
(`valueAtomKind` / `scalarTagOf` / `vbHeapIdxOfAtom` / `litUnionArrayElemOf` and the two
`wasmEmit`-private derivatives `atomIsRef` / `atomListWrapHeap`), each with its enclosing
function and — for a bare-identifier argument — the `let`/`const`/param/assignment that bound
it, INCLUDING re-assignments (method note 9). **46 call sites** (44 textual matches for the
three exported names, of which 1 is a comment and 2 are the private helpers' own headers).

The local-awareness earned its keep twice. `emitUnionCoerce`'s `atom` is bound `let atom =
"i32"` and then RE-ASSIGNED at **16** further points before the tag is emitted — a
bind-site-only scan reads it as the constant `"i32"` and mis-files the site as a keyword.
And `emitIs`'s `isAtom` is re-assigned *between* its two `valueAtomKind` calls (the
litunion→`"string"` rewrite), which is exactly why that site takes a `let` code kept in step
rather than one `const`.

| class | sites | what |
|---|---|---|
| **(i) keyword constants** | **13** | `scalarTagOf("null")` — a keyword, not a parse (#1108's reading, unchanged) |
| **(iii) parser-domain** | **2** | `emit_collect`'s `registerInlineUnion` and `nulCloMixedUnionUnregistered` — annotation TEXT on its way into the tables |
| **(ii) real consumers** | **31** | the family this slice takes |

### 13 parses DELETED — the kind is derived ONCE and the decisions are projections of it

The unlock is not the bank. It is that **three of the four decisions were never independent
questions**: given `k = valueAtomKind(atom)`,

- `scalarTagOf(atom)` **is** `uVariants.length + k` (`scalarTagOfKind`);
- `vbHeapIdxOfAtom(atom)` **is** a 4-arm switch on `k` (`vbHeapIdxOfKind`);
- `atomListWrapHeap(atom)`'s seven spelling questions are a partition of `k`
  (`listWrapHeapOfKind`): kind 7 is exactly the i32-list backings (`i32[]`, `boolean[]`, a
  litunion `K[]`, the `(boolean | null)[]` / `(K | null)[]` niches), kind 9 exactly the
  string-list backings, and kinds 8/10/12 arise ONLY from the spellings `f64[]`/`i64[]`/`f32[]`;
- `atomIsRef(atom)`'s `atom == "string"` **is** `k == 2` (`valueAtomKind` answers 2 for that
  spelling and no other).

So the consumers that needed two, three or five of these each compute the code once and read
the projections. **No fall-through, nothing to measure** — the same shape as #1108's `RINL`:
the site reads a value it already has.

| site | before | after |
|---|---|---|
| `atomListWrapHeap` → `listWrapHeapOfKind` | `litUnionArrayElemOf` + `valueAtomKind` | — (kind-keyed) |
| `atomIsRef` → `atomIsRefKind` | `valueAtomKind` | — (kind-keyed) |
| `emitValueUnionUnboxRead` | 4 derivations (string test, closure test, list wrap, value box) | 1 |
| `emitUnionCoerce` | 5 derivations (`scalarTagOf` + `atomIsRef`'s 3 + `vbHeapIdxOfAtom`) | 1 |
| `emitIs` | `valueAtomKind` ×2 + `scalarTagOf` | 1 |
| `emitNarrowedMem` | `valueAtomKind` + `vbHeapIdxOfAtom` | 1 (`mk` was already bound) |
| `emitMapGetOrUnionBox` / `emitCoalesce` (call, field) | `vbHeapIdxOfAtom` beside a bound kind | — |

### 6 consumers migrated to the BANK (arena-first, ladder)

| tag | site | question | corpus reach | fuzz reach | decline |
|---|---|---|---|---|---|
| WMAP | `emitMapGetOrUnionBox` | the `X \| null` residual's ABI code | 3 | 87 | **0** |
| WCOA1 | `emitCoalesce` (ident LHS) | ″ | 12 | 0 | **0** |
| WCOA2 | `emitCoalesce` (call LHS) | ″ | 2 | 0 | **0** |
| WCOA3 | `emitCoalesce` (field LHS) | ″ | 2 | 0 | **0** |
| WEQW/WEQ | `emitUnionUnionEq` | the shared arms' tags, from the row's kind column | 4 | 0 | **0** |
| RBANK | `msSoloValKind` itself | banked vs re-derived, at the point of use | 19 | 87 | – |

The four residual sites share one chokepoint, `unionResidualSoloKind(set)`: the set ADT
already performs the SUBTRACTION structurally (`msSubNull` clears the null members' bits) and
then RENDERS the result, which the callers parsed back. Now the residual set keeps its
identity — a singleton hands over its member's banked code, a non-singleton answers -1 (what
`valueAtomKind` gives the rendered `""` / `"a|b"`), and only an uncovered set falls through.

`emitUnionUnionEq` is the read/WRITE pair (method note 9 / #1105's discipline): the WRITE half
is the arms loop, which pushes the left row's banked code beside each surviving spelling; the
READ half is the tag emitted per arm. Both moved together, and an uncovered row marks its arms
`-2` so the fall-through stays per-arm rather than per-union.

### The measurement

Additive probe, 15 tags, accumulated and reported ONCE at the end of `emitProgram`.
**0 disagreements over 1,270 corpus files and 50,400 fuzz programs.** All 15 tags confirmed
REACHED by a SEPARATELY built inverted (coverage) compiler — never the same build (note 7):
corpus `SBANK` 426 · `WIS` 321 · `WCOE` 247 · `WUNB` 197 · `RBANK` 19 · `WCOA1` 12 ·
`WEQ`/`WEQW` 4 · `WMAP` 3 · `WCOA2`/`WCOA3` 2 · `WNMEM` 1; fuzz `SBANK` 16,423 ·
`WCOE` 6,190 · `WIS` 4,323 · `WUNB` 3,936 · `WMAP`/`RBANK` 87. Every DECLINE marker
(`WMAPD`/`WCOA1D`/`WCOA2D`/`WCOA3D`/`WEQD`) fired **0** times: where these sites are
reached, the arena leg answers.

`SBANK` is the intern-time-vs-query-time question in its strongest form (method note 2). At
the END of every emit the probe re-derives `valueAtomKind(unMemAtoms[m])` for **every**
recorded member and compares it to what the recorder banked. That matters because
`valueAtomKind` is not purely textual: it reads `cUserTypes` through `nameIsLitUnionType` for
the `K[]` / `(K | null)[]` array-of-litunion spellings, so a member banked before the checker
table settled would diverge. Over 1,270 corpus files (426 reaching) and 50,400 fuzz programs
(16,423 reaching) it diverged **0** times.

### Comparator sanity, per site (method note 12 — before believing any 0)

The probe's own comparison channel was proven able to go red by building the migrated legs
WRONG and re-sweeping: `WCOE` 194 · `SBANK` 194 · `WIS` 100 · `WUNB` 54 · `WNMEM` 1
(class-leaving box/list/tag perturbations), and — with a milder perturbation, because the
first one makes those programs a LOUD REJECT before the end-of-emit report runs —
`SBANK` 167 · `RBANK` 17 · `WCOA1` 11 · `WMAP`/`WMAPB`/`WCOA2`/`WCOA2B`/`WCOA3`/`WCOA3B` 2 each.
That "the sabotage killed the program before the marker could report" trap is worth its own
note: a probe that reports at the END cannot observe a perturbation whose consequence is an
early `emitFail`.

The GATE channel was sabotaged per site (note 4), each perturbation chosen to leave the
equivalence class the consumer actually distinguishes:

| perturbation | what it breaks | corpus (vs migrated, 1,270 files) |
|---|---|---|
| `vbHeapIdxOfKind` i64 box ↔ f64 box | the `ref.cast` target + payload rep | **99 byte-diff + 93 run-status** |
| `listWrapHeapOfKind` f64 list ↔ i64 list | the list wrapper cast (NOT the `>= 0` test) | **3 byte-diff + 3 run-status** |
| `scalarTagOfKind` i32 tag ↔ boolean tag | the box tag the two share a value box under | **164 byte-diff + 4 stdout + 1 run-status** |
| `msSoloValKind` → the row's last member | the residual's identity | **19 build-status + 19 run-status + 19 msg-diff** |
| the BANK itself, i32 ↔ f64 | every projection downstream | **22 byte-diff + 19 run-status + 17 msg-diff** |
| `msMemberValKindsOf` i32 ↔ boolean | the `==` arm chain's tags | **4 byte-diff, 0 run-diff** |

The last row is the note-4 case in miniature: the perturbation is byte-observable on exactly
the 4 files the probe says reach it, and observable in NOTHING else — the site is carried by
the byte channel, not the run channel. And the all-sites sabotage was pushed through the whole
harness at full volume before any 0 was believed: **205 byte-diff + 19 build-status + 107
run-status + 4 stdout-diff** on the corpus and **5,382 tree diffs over 50,400 fuzz programs**.

### A correction the sidecar-lifetime gate needed: `vl run --batch` is NOT shared-instance

Method note 7 says a new arena-index column needs a shared-instance run, because corpus and
fuzz give every program a fresh compiler. This slice's column is exactly that class, so the
guard was sabotage-tested — and the test exposed that the gate this program has been quoting
does not measure it:

- **`vl run --batch` instantiates the compiler once PER CASE** from a once-loaded Module
  (`compile_vl_instance`'s own doc comment in `scripts/vl-host/src/main.rs` says so). Module
  globals are re-initialised per case. A build with BOTH lifetime guards removed — so a
  misaligned column is actually READ — is byte-, output- and transcript-IDENTICAL over 751
  programs in "one instance".
- **`tests/cases_wasm_test.ts` is the shared-instance driver**: it builds ONE
  `WebAssembly.Instance` of the seed and compiles the entire corpus through it. The same
  guardless build fails **21** of its cases.

So `SELFHOST_NATIVE_ALIGN=1 deno task test` is the sidecar-lifetime gate, and the `--batch`
run is a shared-*Module* smoke test. Both are reported below, now labelled honestly.

The sabotage also separated the two guards, which is why both are kept:

- accessor length check present, recorder reset removed → the suite is **GREEN** (1,954
  passed). The column silently goes DEAD after program 1 and every consumer falls through.
  Correctness is preserved; the bank is not.
- both removed → **21 failures**. The accessor's `unMemValKind.length == unMemAtoms.length`
  invariant is the correctness guard; the recorder's reset is what keeps the bank ALIVE across
  programs in one instance. (And the fact that the guardless build fails at all is positive
  evidence the bank is read and consequential in a shared instance — a dead column would be
  green.)

### The call arithmetic

Atom-algebra call sites in the three files, master → now:
`vbHeapIdxOfAtom` **8 → 2**, `scalarTagOf` **20 → 16** (13 of which are the constant
`scalarTagOf("null")`, so non-constant **7 → 3**), `litUnionArrayElemOf` **1 → 0**,
`atomIsRef` **2 → 0**, `atomListWrapHeap` **3 → 0**, `valueAtomKind` **12 → 12** —
net **46 → 30**.

`valueAtomKind`'s flat total hides the move that matters: **one call migrated INTO the
recorder** (`emit_rep`, the intern side — class (iii), where this program has always said a
parse belongs) and `wasmEmit`'s ten became nine while ABSORBING five sites that previously
derived the code inside `scalarTagOf` / `vbHeapIdxOfAtom` / `atomListWrapHeap`. Of the nine,
**five are ladder fall-throughs behind an arena leg** and four are the single per-site
derivation the projections read.

Across all parsers in the three files (the SCORECARD CORRECTION's list): **155 → 144**
(`wasmEmit` 55 → 43, `emit_collect` 98 unchanged, `emit_rep` 2 → 3).

### What did NOT move, and why

- **`scalarTagOf("null")` ×13** — a keyword, not a parse.
- **`emitUnionPayloadUnbox` / `emitMem`** (`vbHeapIdxOfAtom`, 1 each) — neither has a kind in
  hand, so converting them is 1 parse → 1 parse. They retire when their CALLERS carry the
  code: `emitUnionPayloadUnbox`'s four callers already do at two of them (`emitUnionUnionEq`'s
  `armK`), which is a signature change, not a resolution change. Left for the next slice.
- **`emitUnionConcreteEq` / `emitUnionLitIs` / `emitUnionCoerce`'s closure arm**
  (`scalarTagOf`, 3) — their atoms come from `unionEqAtomOf` / a literal ladder /
  `unionClosureArmName`, none of which is a (row, index) into a recorded member. They need the
  member→index resolution #1108 filed as the next export, not the kind bank.
- **`emit_collect`'s 2 `valueAtomKind`** — parser-domain (class (iii)): `registerInlineUnion`
  classifies annotation text on its way INTO the tables, and `nulCloMixedUnionUnregistered`
  declines by construction.

### Hand-offs

- **`emit_classify.vl`** (concurrently owned): `vbHeapIdxOfAtom` should delegate to
  `emit_rep`'s `vbHeapIdxOfKind`, and `scalarTagOf` to `scalarTagOfKind`, so the kind→box and
  kind→tag tables have one home each. Exact diffs:
  `export function scalarTagOf(atom: string) { scalarTagOfKind(valueAtomKind(atom)) }` and
  `export function vbHeapIdxOfAtom(atom: string) { vbHeapIdxOfKind(valueAtomKind(atom)) }`
  (plus the two names in the `./emit_rep` import). Until then the tables are kept in step by
  hand, and the per-site sabotage above is what would catch a drift.
- **`emit_state.vl`**: if the column is ever moved beside `unMemKinds`, its reset belongs in
  `emitProgram`'s existing block and the recorder's lock-step guard can go — but the
  accessor's length check must NOT, per the two-guard measurement above.
- `emit_classify`'s private `msRowStart` can delegate to `emit_rep`'s `unMemRowStart` (same
  bounds, same 31-bit mask limit); the duplication exists only because `emit_rep` is BELOW
  `emit_classify` in the module graph.
- D-NARROW (#1109) filed `currentNarrowSetIdOf` as the export that would let
  `emitCoalesce`'s `??` complement skip the text→set resolution. That hand-off now covers
  one more caller: `unionResidualSoloKind(cset)`'s entry is the same `msSetOfText`, so the
  ident-LHS site would take the banked id directly and the whole path from narrowing table
  to ABI code would never render a set at all. Same for `emitUnionUnionEq`'s
  `msMemberValKindsOf(msSetOfText(lname), …)`, whose `lname` is a union NAME rather than a
  narrowed set — that one wants a row id, not a set id.

### Gate

Corpus **byte-, run- AND message-identical** (1,270 files) · 66-case battery **0 diffs** ·
fuzz A/B **50,400 programs/side** (seeds 1-14 × depths 4,5,6 × {plain, `--declared`} × 300),
compared as whole `--out-dir` TREES, **0** diffs · shared-MODULE `vl run --batch` **751
programs, 807 outputs** per side, rc 0, **0** traps, transcript identical · shared-INSTANCE
(`tests/cases_wasm_test.ts`, one `WebAssembly.Instance` for the whole corpus) **1,954 passed,
0 failed** · additive probe **0 disagreements** over 1,270 corpus files and 50,400 fuzz
programs, all 15 tags REACH-confirmed by a separately built inverted compiler.

`refresh-compiler.sh` / `rep-fuzz-check.sh` / `native-fixpoint.sh` / `lint-self.sh` /
`SELFHOST_NATIVE_ALIGN=1 deno task test` (1,954 passed) / `fuzz-sweep.sh` all RC=0.

The whole net was re-run after rebasing onto D-NARROW (#1109), which lands in the same two
functions (`emitCoalesce`'s `??` complement, `emitMem`'s member-set dispatch): corpus 1,270
files byte/run/message-identical, fuzz A/B 50,400 programs/side with 0 tree diffs, probe 0
disagreements over both, battery 0 diffs, `--batch` 751 programs 0 traps 0 diffs, and every
standing script RC=0 again. The counts above are measured against 16881cd.
