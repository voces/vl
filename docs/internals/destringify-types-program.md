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

**Three sites are NOT migrated, on zero evidence — `rlSlotsLayoutTwin`'s kind-9 arm and
its struct tail** (`A-TW9`, `B-TWS`, `C-TW`). A *reach* marker — one that fires on merely
ENTERING the chokepoint, covered or not — fires on **0 of 1,265** corpus files and **0 of
25,200** fuzz programs for all three. The function is reached (its singleton-kind arms
answer), but the nested-list arm and the struct fall-through are not, on today's surface.
Unverifiable ⇒ unmigrated; they keep the element-NAME path. This is the sixth consumer in
this program to stand correctly unmigrated for want of a sabotage witness.

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
| ref-list ELEMENT structure re-derived by string surgery on the stored name (its inner slot / struct row / niche / `$fnsig`) | 22 sites | **16 migrated** (`rlElemTyIx` → `rlElemInnerSlot`/`rlElemStructRow`/`rlElemIsNulNiche`/`rlElemCloSigKey`); 3 `rlSlotsLayoutTwin` sites left on the name path, measured **unreachable** — see D5-final (a). The map-value / variant-index / name-producing readers are untouched |
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

The first three are the same underlying mistake: assuming an arena artifact answers the same
question the string did. Check which question the site is asking, first.

## Close-out measurement (master e1e2ad6, after 11 slices)

Measured, not asserted. The reproducible commands are in "How to verify" and the
"Counting caveat".

| check | result |
|---|---|
| structural decision from a **rendered** type | **0** |
| string surgery on a stored name column | 18 matches → **7 doc comments**, **5 ladder fall-throughs** (inside a migrated chokepoint, by design), **6 genuinely unmigrated** |
| name-keyed `table[i] == name` scans | 13 — nominal identity (`unNames`/`uVariants`), ABI identity (`cloSigKeys`), and the exact-match fast paths ahead of the structural keys |

### The 6 genuinely unmigrated, each with its measured reason

- `rlSlotsLayoutTwin` ×4 — a **reach** marker fired on 0/1265 corpus files and 0/25,200 fuzz
  programs. Unverifiable, so not migrated (#1096).
- `refListElemNameOfExpr` — a name **producer**; it retires with its consumers, not here.
- `compositionMapReadSlot` — the map-element map-value slot, deferred in #1096's enumeration.

### What "done" means here

The disease this program targeted — *deriving structure from a rendering* — is gone from
every layer that decides structure, representation, or ABI. Names persist for rendering,
for nominal identity, and as the fall-through of ladders whose arena leg decides first.
That was the stated terminal condition, and it holds.

**Seven consumers stand deliberately unmigrated** across the program because sabotage
measured them unverifiable (0 firings) — no test or fuzz program could prove a change
correct. That is the intended outcome of the method, not a shortfall.
