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

## D-ABIDEDUP + D-ATOMPAIR — the ABI tables get ONE home, and the `[]` suffix parse dies (#1111)

Two fully-measured pieces of #1110's hand-off list, plus a **refutation of #1110's own
filing** of what was blocking the rest, plus a measurement that **inverts D-ANNSLOT's
recorded diagnosis of the struct-twin rung**.

### D-ABIDEDUP — the three delegations #1110 handed off

`emit_classify` kept hand-copied twins of three things `emit_rep` owns. A drift between any
pair is a silent miscompile, and #1110 said so explicitly when it left them:

| was (emit_classify) | now | the one home |
|---|---|---|
| `scalarTagOf(atom)` = `uVariants.length + valueAtomKind(atom)` | `scalarTagOfKind(valueAtomKind(atom))` | `emit_rep:scalarTagOfKind` |
| `vbHeapIdxOfAtom(atom)` = a 5-arm kind→box switch | `vbHeapIdxOfKind(valueAtomKind(atom))` | `emit_rep:vbHeapIdxOfKind` |
| `msRowStart(u)` = 6 bounds lines | `unMemRowStart(u)` (now exported) | `emit_rep:unMemRowStart` |

A consequence worth recording, because it is the check that the table really MOVED rather
than merely gaining a caller: `emit_classify` no longer imports `vbI32Idx` / `vbI64Idx` /
`vbF64Idx` / `vbF32Idx` **at all**. The four value-box heap-index globals are now read in
exactly ONE place in the whole compiler (`vbHeapIdxOfKind`), and the self-lint's
unused-import warning is what proved it.

**This is a dedup, so its evidence is the opposite of a distinguishing test.** No test can
fail on master and pass here — master is correct and the two copies agree. The claim is "no
behaviour changed", and the proof is byte-identity plus a demonstration that the channel
carrying that identity has power. What the change buys is structural: a future edit to one
table can no longer desynchronise from the other, because there is no other.

### D-ATOMPAIR — `unMemHasAtom` stops taking a type string apart

`unMemHasAtom(name, atom)` answered "does this union have an arm spelled exactly `atom`",
and for a LIST atom it recovered the element by hand:

```
const an = atom.length
if an >= 3 {
  if atom[an - 2] == '[' && atom[an - 1] == ']' {
    want = atom.slice(0, an - 2)
    arr = true
  }
}
```

A suffix test and a slice over the structure encoded in a type string, in the emitter. By
the owner's rule that is a parse and it must die — and it dies rather than moving, because
**every caller already held both halves at its own source**. The 31 `unionHasAtomTy` call
sites pass string LITERALS (`"i32"`, `"f64[]"`, `"null"`, …) or a keyword ladder's variable
whose whole range is keyword literals; the single composite site built `elemAtom + "[]"`
*purely so this function could take it apart again*. The atom is now a
`(primitive, is-list)` PAIR:

```
export function unMemHasAtom(name: string, want: string, arr: boolean): i32
export function unionHasAtomTy(name: string, want: string, arr: boolean): boolean
```

Nothing renders a list spelling for this test and nothing peels one. The joined spelling is
built in exactly one place — inside `unionHasAtomTy`, on the legacy member-NAME
fall-through, which is a name-keyed scan by construction.

**And that fall-through is never reached.** An `emitFail` marker inside it fires **0** times
over 1,242 corpus files; the same marker in a build whose arena leg is forced to decline
fires **182** times, so the 0 is a measurement and not a broken probe. The arena leg of this
predicate is TOTAL on the corpus, which makes the fall-through — and with it the last join —
a deletion candidate for the next slice, once the fuzz leg is measured too.

### The counting method, and the two numbers reported separately

Local-aware, by resolver called: every textual `unionHasAtomTy` / `unMemHasAtom` call in the
four files that hold them, with its enclosing function and, for a bare-identifier second
argument, the `let`/assignment chain that bound it. **31 call sites**; 2 pass a variable
(`emitUnionConcreteEq`'s `atom` from `unionEqAtomOf`, `emitUnionListLitViaRefArm`'s
`elemAtom`), and both ladders' whole range is string literals — established by reading every
ASSIGNMENT to them, not just the binding.

- **Parses DELETED, with no fall-through: 1** — `unMemHasAtom`'s `[]` suffix-test + slice,
  together with the one type-string PRODUCER (`elemAtom + "[]"`) that existed only to feed it.
- **Consumers migrated to a ladder: 0.** Nothing here gained an arena leg with a name
  fall-through; the parse was removed by changing what the callers hand over.
- **Hand-kept table duplications removed: 3** (kind→tag, kind→box, member-slice bounds).

### A refutation: #1110's three "waiters" do not need the member→index export

#1110 filed `emitUnionConcreteEq`, `emitUnionLitIs` and `emitUnionCoerce`'s closure arm as
blocked on a member-atom → recorded-index resolution. Read against their producers, none of
them is a parse site at all:

- `unionEqAtomOf`'s **entire range** is the six string literals `"i32"` `"string"` `"f32"`
  `"f64"` `"i64"` `"boolean"` — `atom` is initialised to a literal and every one of its
  assignments is a literal. So `scalarTagOf(atom)` there is #1108's class (i) **keyword**
  case, exactly like the 13 `scalarTagOf("null")`, and never one of the 607.
- `emitUnionLitIs`'s literal ladder has range `"i32"` `"string"` `"f64"` `"i64"` — same
  verdict.
- `unionClosureArmName`'s name leg returns an atom selected BY the test
  `valueAtomKind(a) == 11`, so its kind is 11 by construction; its arena leg selects by
  `unMemIsFunc`. There is no member index to look up — there is a value already known.

Migrating any of the three would score **0** against the terminal condition. The honest
disposition is to reclassify them as class (i), not to build an export for them. (The
worthwhile change at those sites is the D-ATOMKIND *projection* shape — carry the kind the
ladder already picked instead of re-deriving it — which saves work but deletes no parse, so
it is not what this slice spent its budget on.)

**A second conflation to correct:** the "two `wasmEmit` producers" #1108 filed are
`emitMem`'s member-set dispatch and `emitCoalesce`'s `??` complement, and what they wait on
is **`currentNarrowSetIdOf`** — a narrowed-SET id — not a member→index resolution. Those are
two different hand-offs, named in two different bullets of #1110's "What did NOT move".
`currentNarrowSetIdOf` already exists, private, in `emit_classify`; exporting it is a
one-line change whose consumers are in `wasmEmit`. It is left for the next slice only
because it deletes a text→set RESOLUTION (`msSetOfText`, a whole-string scan), not a parse.

### The struct-twin rung: D-ANNSLOT's diagnosis is REFUTED, and the real blocker named

D-ANNSLOT recorded:

> The QUERY half migrates cleanly … The CANDIDATE half does not: `rlElemStructRow(j)` …
> differs from `structIndexOfTypeName(eBase)` at every witness. **The blocker is
> `rlElemStructRow`, not `rlSlotOfTy`.**

Measured at the site, it is the other way round. A probe compiler implementing the candidate
half structurally — `rlElemTwinStructRow(slot)` = the exact `structIndexOfTy` scan first,
then `repRowOfTyStruct(base, sScanLim())` — and reporting AT THE SITE inside
`sFieldRefSlot`'s decline (so no early reject can eat the evidence, method note 17)
reproduces D-ANNSLOT's population exactly: **6 of 1,241 corpus files**, `WSFRL-MISS` 6,
`WSFRL-WRONG` **0**. The per-call diagnostic then splits the rung:

- **The CANDIDATE half agrees 12/12.** At every candidate of every witness,
  `rlElemTwinStructRow(j)` equals the name path's `structIdxOfElemName(rlElemName[j])` —
  including the 6 candidates where `rlElemStructRow`'s exact `structIndexOfTy` leg declines
  (`exact=-1`) and `repRowOfTyStruct` supplies the row. D-ANNSLOT's blocker is not one.
- **The QUERY half disagrees 6/6**, and the reason is a resolution VOCABULARY difference,
  not a coverage hole. `structIndexOfTypeName(qBase)` is the **lenient FIELD-NAME-SET scan**
  (`shapeFieldParse` + `sFieldIndex` + `shapeFieldTypeCompat`). Every witness is the
  nested-alias twin pattern — an outer `{f: X}` beside its inner `X`, both carrying the
  one-field fieldset `{f}` — so the name scan matches the INNER spelling onto the OUTER row,
  while `repRowOfTyStruct` answers the inner row by canonical key. `repStructSlotsTwin` of
  the two is 0 at all six.

Witnesses (query `qBase` → name row vs canon-key row): `{f:f64}` → 1 vs 0 ·
`{a:boolean,f:{[string]:boolean},z:string}` → 1 vs 0 · `{f:i64|null}` → 1 vs 0 (×2) ·
`{f:f32|string|{q:i64}}` → 3 vs 1, and → 2 vs 1. Four of the six are the
`nested-{null-hole,union-softening}-list-{elem,return}-twin` pins that
`shapeFieldTypeCompat`'s own RETIRED-arm comments name as the witnesses for that leniency —
so the leniency is deliberate, documented, and load-bearing.

**The blocker, with its mechanism:** giving rung 3 an arena input needs an arena dual of the
FIELDSET scan — `repRowOfTyFieldset(ty, lim)`: match the `TyObj`'s field-NAME set against
each row's `sFieldNames`, tightened by the arena form of `shapeFieldTypeCompat` — and it must
reproduce all four of that function's RETIRED refutation arms (#978, #1041, #996, #935) or
the twin pins change answers. A canonical-key resolver cannot substitute: it is strictly
stricter, and the leniency is the point.

**Rung 3 is load-bearing** (measured, so nobody re-derives it): deleting it outright gives
**9** corpus byte-diffs, **243** message-diff lines and **51** run-tree diff lines over 1,241
files. And it is worth stating what this does NOT unblock: the 11-leg `nameIsRefArray`
family stays blocked, because `sFieldRefSlot`'s fall-through still answers 6 corpus cases the
arena cannot.

Nothing from this study shipped. A structural rung that is byte-identical and answers 0 of 6
is exactly what D-ANNSLOT already declined to land, and the reason has not changed.

### The pin

`tests/cases/unions/atom-scalar-beside-own-list-arm.vl` — a value union carrying BOTH a
primitive atom and the LIST over that same primitive (`i32 | i32[]`, `string | string[]`,
`f64 | f64[]`, `i64 | i64[]`). No shape in 1,241 corpus files carried a scalar beside its own
list, and the two arms take distinct box tags (kinds 0/7, 2/9, 4/8, 3/10) and distinct
payload reps, so it is a real coverage addition to the atom band.

**It is NOT this slice's distinguishing test, and is not claimed as one.** Measured: it is
inert under both perturbations of the (primitive, is-list) key — because a union holding BOTH
answers the same for `("i32", true)` and `("i32", false)`, which is precisely what makes it a
good tag-band pin and a bad key pin. The distinguishing evidence for D-ATOMPAIR is the
existing corpus, below.

### Gate

Corpus **byte-, message- AND run-identical**: 1,241 files, 1,054 of which emit wasm (187 are
rejects on both sides), **0** byte-diffs · **0** message-diff lines (full stdout+stderr per
build, each side's out-dir normalised out) · **0** run-tree diff lines (`vl run --batch
--out-dir`, whole trees via `diff -r`).

Fuzz A/B **50,400 programs/side** (seeds 1-14 × depths 4,5,6 × {plain, `--declared`} × 300;
batches generated once by a FIXED generator compiler so both sides see identical programs),
compared as whole `--out-dir` trees: **0** diffs.

**Comparator sanity, per channel, at full corpus volume** (before any 0 was believed):

| perturbation | what it breaks | corpus |
|---|---|---|
| `vbHeapIdxOfKind` i64 box ↔ f64 box (the DRIFT the dedup now makes impossible) | the `ref.cast` target + payload rep | **99** byte-diff, **719** run-tree lines, 0 msg |
| `unMemHasAtom`'s `arr` bit inverted | the (primitive, is-list) key | **57** byte-diff, **131** msg lines, **414** run-tree lines |
| `rlSlotByName` rung 3 deleted | the struct-twin fallback | **9** byte-diff, **243** msg lines, **51** run-tree lines |

The first row independently reproduces D-ATOMKIND's recorded 99 byte-diffs for the same
perturbation. The second is D-ATOMPAIR's entombment: 57 corpus files change under a
class-leaving perturbation of exactly the key this slice re-shaped.

The FUZZ comparator was proven at the SAME 50,400-program volume it reports 0 at (method
note 12, whose original failure was a fuzz A/B that compared 0 files and said 0): the
`arr`-inverted build against the migrated one gives **4,161 tree-diff lines, spread across
all 84** (seed, depth, mode) buckets. A 0 from this harness is a measurement.

Two harness bugs were caught and fixed before any number above was trusted, both instances of
method note 12: the message channel compared each side's own out-dir path (2,108 phantom
diff lines) and the byte channel counted a program REJECTED on both sides — no `.wasm` on
either — as a diff (187 phantom byte-diffs). A comparator that reports diffs where there are
none is as useless as one that reports none where there are diffs.

`refresh-compiler.sh` RC=0 · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined REJECT, 0 unsound,
0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4, 1,018,294 bytes) ·
`lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0 (**1,961 passed, 0
failed**, 8 ignored) — the shared-INSTANCE lifetime gate, run because it is the standing gate,
though this slice adds no sidecar column.

### Method notes earned

18. **A keyword LADDER's RANGE is part of its call site's classification** (D-ATOMPAIR) —
    three sites were filed as parse consumers on the shape of the call (`scalarTagOf(atom)`,
    a variable). Reading every ASSIGNMENT to that variable, not just its binding, shows the
    range is six string literals, which makes the site class (i). Method note 9 said to
    enumerate by resolver called and to follow locals; this is its other half: follow the
    local far enough to know its RANGE, or a keyword site reads as a parse site and a slice
    gets spent on a migration worth 0.
19. **A coverage pin and a distinguishing test are different artifacts, and a pin can be
    inert BY CONSTRUCTION** (D-ATOMPAIR) — the `i32 | i32[]` shape is the sharpest-looking
    pin for a (primitive, is-list) key and is provably insensitive to every perturbation of
    it, because a union holding BOTH members answers the same either way. Run the sabotage
    THROUGH the new pin before quoting it as evidence; when it is inert, say so and point at
    whatever actually carries the change.
20. **A ladder's fall-through can be measured to zero cheaply, and that number IS the next
    slice's brief** (D-ATOMPAIR) — one `emitFail` inside `unionHasAtomTy`'s name leg, one
    corpus sweep: 0 reaches, with a forced-decline build firing 182 to prove the marker
    works. That single number converts "the fall-through is untouched by design" into "the
    fall-through is a deletion candidate", which is what D-TOTALITY needed a whole slice to
    learn for its map.
21. **A behaviour-preserving change cannot have a fails-on-master test, and demanding one
    inverts the evidence** (D-ABIDEDUP) — a dedup's whole claim is "nothing changed", so its
    proof is byte-identity plus a sabotage showing the identity channel has power. The
    entombment rule exists to stop unproven behaviour CHANGES shipping; applied literally to
    a dedup it would force reverting correct work. State which kind of change is on the table
    before choosing the evidence.
## D-ANNCOUNT — the two ANNOTATION-SPELLING member counts are banked at their producers (#1112)

Two decisions in `emit_collect.vl` re-split a type name the compiler had just handed them,
to ask the same one-bit question: *did this spelling name a UNION?*

- `registerCollapsedUnionName` (#1055) — an annotation whose members are SAME-SHAPE
  declared structs (`A | B`, `type A = {v: i32}` / `type B = {v: i32}`) resolves through
  `nameToTy`'s union arm, where `sameVariantTy` DEDUPS the members and the union COLLAPSES
  to a plain `TyObj`. After the collapse the arena holds a struct, so the arena register
  walk cannot reach the union and the emitter drives the registration from the SPELLING —
  `splitUnionAtoms(tyNameOf(node)).length >= 2`.
- `registerInferRetNominalUnion` (#1057) — the anonymous-nominal inferred-return residual,
  `splitUnionAtoms(inferRetTyAt(iru)).length >= 2` over a name the compiler had just BUILT.

Both are now lookups. Neither has a name fall-through.

### Where the bank went, and why that place and not the other candidates

| # | the producer | what it banks | keyed by |
|---|---|---|---|
| 1055 | `canonEmitTypeNames` | `unionMemberCount(c)` of the name it just wrote to `n.tyName` | NODE (`annUnionAtoms`, `annUnionAtomsOf`) |
| 1057 | `recordInferRet` | `unionMemberCount(ty)` of the name it is recording | ROW (`inferRetAtomCount`, `inferRetAtomCountAt`) |

The brief for this slice named `resolveAnnot` (`typecheck.vl:8410`) as #1055's recording
site, "before `sameVariantTy` dedups". **That is the wrong site, and the reason is the D1
timing axis.** `resolveAnnot` sees the SOURCE spelling; the consumer reads
`tyNameOf(node)`, which is the spelling `canonEmitTypeNames` REWROTE at the end of
`checkProgram` — and that rewrite is not atom-count-preserving. Its union arm dedups
canon'd members (`"a" | "b"` both soften to `string` and collapse to ONE atom) and expands
union ALIASES (`AB | null` becomes `A|B|null`, THREE atoms from two). A pre-canon count and
a post-canon count are different numbers for the same node. The producer of the string the
consumer actually reads is `canonEmitTypeNames`, so that is where the count is banked.

`nameToTy`'s union arm — the one place a union annotation is ever SPLIT, and the obvious
"bank at the recorder" answer — is wrong for the same reason, and additionally has no node
in hand (resolution is name-keyed; only `annotDiagAt` carries a position, and only for the
positioned entry points).

The banked value is `unionMemberCount` on the very string the consumer would have split —
**exact, not a structural dual** (the #1110 discipline). `unionMemberCount` is
`splitUnionAtoms`'s counting dual: same grouper depth, same quoted-atom skip, same
top-level-`=>` stop.

### The refuted arena dual, re-measured — and its unsound direction now has a witness

`inferRetMemCount` shipped in D-UNION-SET as an arena-SPINE walk (`retMemCountOf`:
`TyUnion` -> `uMembers.length`, `TyNullable` -> inner + 1). #1057's own comment recorded it
as REFUTED on 4 corpus files. A probe carrying BOTH columns side by side reproduces that
and extends it:

| tag | what | corpus (1,272) | fuzz (50,400) |
|---|---|---|---|
| `SPR` | rows reaching the recorder->consumer pair | 444 | 8,948 |
| `SPDIS` | spine count != joined-atom count | **17** | **879** |
| `SPDIS2` | the same, past the `isUName` gate (the #1057 comment's number) | **4** | 46 |
| `SPHIGH` | spine >= 2 while the NAME has ONE atom | **13** | **833** |
| `SPLOW` | joined >= 2 while the spine is smaller | 0 | 0 |

The 4 `SPDIS2` files are exactly the `K0 | null` shape the comment predicted
(`closure-array-nullable-litunion-result`, `chained-closure-nullable-litunion-result`,
`nullable-map-closure-nullable-litunion-result`, `closure-nullable-litunion-result-arm`).
The 13 `SPHIGH` files are the direction the comment called unsound but had no witness for —
a recorded name of ONE atom whose arena spine counts >= 2, i.e. the walk voting to register
a union this compiler does not register. All 13 are absorbed by the `isUName` gate today
(`SPHIGH2` = 0), so the refuted column would have been byte-identical on the current
surface; the population exists anyway, and `retMemCountOf` is deleted rather than left as a
loaded gun.

### The totality argument (why the name legs are DELETED, not laddered)

- **#1057**: `row` indexes the very table `nm` was read from. `recordInferRet` pushes name
  and count in lock-step, so a recorded name always has a recorded count. -1 is
  unreachable.
- **#1055**: `canonEmitTypeNames` walks the WHOLE node arena and runs unconditionally at
  the end of every `checkProgram` (no early return precedes it; `compileSrc` refuses to
  emit when the checker raised a diagnostic). `registerCollapsedUnionName` runs inside
  `collectU`, the FIRST emit pass, and no pass between the two creates AST nodes — the
  three annotation SYNTHESES (`synthRetAnnots`, `synthParamAnnots`, `monomorphize`) all sit
  after it in the pass table. So no node handed to the consumer postdates the bank.
  Measured, not only argued: **0 uncovered reaches over 1,272 corpus files and 50,400 fuzz
  programs**. And the -1 arm is not a silent wrong answer if it were ever reached — it is
  the same answer the deleted `splitUnionAtoms(tyNameOf(node))` gave at a non-`TypeRef`
  node (`""` splits to one atom), and its failure mode is the LOUD reject the sabotage
  below produces, never invalid wasm.

### Probe

Additive, both answers computed, the OLD one kept, tags accumulated and reported ONCE at
the end of `collectU` (both sites live inside that pass, so the report needs no file this
slice does not own). Over **1,273 corpus files** and **50,400 fuzz programs** (seeds 1-14 x
depths 4,5,6 x {plain, `--declared`} x 300):

| tag | corpus | fuzz |
|---|---|---|
| `C55R` — reached with a `TyObj` | 237 | 10,306 |
| `C55POS` — the name says >= 2 atoms | 3 | 0 |
| `C55DIS` / `C55UNCOV` / `C55MISS` / `C55EXTRA` | **0** | **0** |
| `C57R` — reached | 445 | 8,948 |
| `C57R2` — past `isUName` | 392 | 7,259 |
| `C57POS` — the name says >= 2 atoms | 30 | 357 |
| `C57DIS` / `C57DIS2` / `C57UNCOV` / `C57MISS` / `C57EXTRA` | **0** | **0** |

**Comparator sanity, per channel, at full volume** (method note 12 — two separately built
perturbations, because one perturbation cannot light all four channels):

| perturbation | channels lit, corpus | channels lit, fuzz |
|---|---|---|
| bank + 1 | `C55DIS` 236, `C55EXTRA` 234, `C57DIS` 444, `C57DIS2` 391, `C57EXTRA` 365 | `C55DIS` 10,306, `C55EXTRA` 10,306, `C57DIS` 8,948, `C57DIS2` 7,259, `C57EXTRA` 6,939 |
| bank - 99 | `C55UNCOV` 236, `C55MISS` 2, `C57UNCOV` 444, `C57MISS` 30 | `C55UNCOV` 10,306, `C57UNCOV` 8,948, `C57MISS` 357 |

Every zero above is a measurement on a wire that has been shown to carry a planted signal
at exactly the site's full reach count.

### Gate-channel sabotage — and a note-4 asymmetry

| sabotage | corpus (1,273 files), vs the migrated compiler | fuzz (50,400) |
|---|---|---|
| `annUnionAtomsOf(node) >= 99` (never register) | **2 build-status + 2 message + 2 run** | 0 |
| `inferRetAtomCountAt(row) >= 99` (never register) | **6 files: 4 build-status, 6 message, 5 run** | 0 |
| both `>= 1` (always register) | **0** | **0** |

The over-registration direction is invisible — the note-4 case again: a spurious
`registerInlineUnion` is absorbed by the `isUName` self-gate and changes no output. These
sites are carried by the UNDER-registration direction, and the fuzz surface carries neither
(its generator never produces the same-shape-collapse or anonymous-nominal-residual shapes
in a consequential position, though it reaches them 10,306 and 8,948 times). The fuzz
comparator itself has power: the same harness reports 202,544 differing paths against a
build that fails every compile.

### The pin

`tests/cases/types/struct-union-same-shape-field-slot.vl` — the same-shape collapse at the
struct-FIELD annotation slot (`type W = { s: A | B }`) plus a same-shape union RETURN.
`types/struct-union-same-shape.vl` and `soundness/union-same-shape-discriminant-sound.vl`
already covered the PARAM slot (they are the two `C55POS` files at master); the field slot
had no pin, and it is the slot whose failure mode is loudest: with the decision suppressed
the field has no union rep and the program is a hard reject ("only i32 / boolean / string /
array struct fields are supported"). It is the third `C55POS` file.

**Honest note on entombment** (independently reached as method note 21 by the concurrent
D-ABIDEDUP slice, which is corroboration rather than coincidence). A migration that is
byte-, message- and run-identical over 1,273 corpus files and 50,400 fuzz programs cannot,
by construction, have a test that fails on master and passes here — that identity is the goal, and a behavioural difference would
be a bug report rather than a pin. What a byte-identical slice can have, and what this one
has, is: a pin that REDDENS when the migrated leg is broken (all three `C55POS` files under
the `>= 99` sabotage, six more for #1057), and a probe whose every zero sits on a
sabotage-verified wire.

### Sidecar lifetime — and a shape that makes the reset load-bearing

`annUnionAtoms` is a new arena-lifetime column, so method note 7 applies. The first draft
pre-pushed `-1` per node and then wrote `annUnionAtoms[i]`; with BOTH resets removed that
build was byte-identical on the corpus **and green on `SELFHOST_NATIVE_ALIGN=1 deno task
test` (1,961 passed)** — because the index write overwrites the stale prefix, so a missing
reset leaks memory without ever returning a wrong answer. Rewriting the loop to PUSH the
value (index == node index by construction) makes the reset carry correctness: the
guardless build of the shipped shape is still byte-, message- and run-IDENTICAL over the
1,273-file corpus (fresh instance per program) and **fails 2 cases** of the shared-instance
suite — `soundness/union-same-shape-discriminant-sound.vl` among them. That is note 16 in
miniature, and a new lesson beside it: *prefer the sidecar shape whose reset is
load-bearing*, so the lifetime gate has something to catch.

### The call arithmetic — reported as two numbers, because they are two numbers

Local-aware scan (by resolver called, comments and the parsers' own headers excluded) of
the SCORECARD CORRECTION's parser list, over the two files this slice owns:

| file | master (bba4b4c) | now | what moved |
|---|---|---|---|
| `emit_collect.vl` | **87** | **85** | `splitUnionAtoms` 7 -> 5 |
| `typecheck.vl` | **20** | **22** | `unionMemberCount` 1 -> 3 |
| combined | 107 | 107 | — |

**2 parses DELETED with no fall-through** (both class (ii) real consumers, in the emitter's
decision layer) and **2 parses ADDED** at class (iii) producers in the checker. The
program's currency is *which layer parses*, not the raw call count, and this slice moves two
decisions out of the emitter at the cost of two scans on the intern side — the same trade
#1110 made. Quoting only "-2" would be dishonest; so would quoting only "+/-0".

Deterministic work counts (method note 15 — two instrumented compilers, ONE fixed input:
the pinned master `compiler/` snapshot, counters reported once at the end of `collectU`):

| | per self-compile |
|---|---|
| `unionMemberCount` added — annotation bank | **5,379** |
| `unionMemberCount` added — inferred-return bank | **1,941** |
| `splitUnionAtoms` removed — `registerCollapsedUnionName` | **108** |
| `splitUnionAtoms` removed — `registerInferRetNominalUnion` | **1,940** |
| `retMemCountOf` arena walks removed (function deleted) | **1,941** |

So the annotation bank is computed ~50x more often than it is read. The wall clock cannot
resolve it: interleaved min-of-25 read 1,333 ms (master) / 1,356 ms (migrated) while a
repeat of the SAME master binary read 1,239 ms — a 94 ms swing on an unchanged compiler,
on a box a concurrent agent was loading to a 15-minute average of 41. Per D-NARROW's method
notes 14/15 the count is the measurement and the clock is not.

### What did NOT move, and why

- **`emit_collect`'s two `valueAtomKind` calls stay parser-domain — #1110's classification
  RE-EXAMINED and CONFIRMED.** `registerInlineUnion` is the intern site itself (annotation
  TEXT on its way into the union tables). `nulCloMixedUnionUnregistered` is a GATE on an
  intern (`cloSigKeys.push`), and its verdict is not a structural question: its four
  terminal tests (`isUName` / `isValueUnionName` / `nameIsLitUnionArmValueUnion` /
  `nameIsMapMemberUnion` on the closure RESULT spelling) ask INTERN STATE, so an arena leg
  answering only structure would disagree wherever interning declined — the D3' refutation
  exactly. It stays.
- **`collectFnValUse`'s `unionMemberCount(fvSb) > 1`** is node-keyed
  (`fvSb = nullablePartOf(tyNameOf(i))`) but asks the count of the NULLABLE-PEELED name,
  which the node bank does not hold; migrating it would be a ladder, not a deletion, and the
  site already carries a measured DESTRINGIFY-REFUTED verdict for its alias-blindness.
- **`registerInlineUnion`'s 30 parses and `collectA`'s 17** are the intern side, class (iii)
  — where this program has always said the parse belongs.

### Hand-offs

- **`emit_classify.vl` / `emit_base.vl`** (not owned by this slice): `annUnionAtomsOf` is
  exported and TOTAL for annotation nodes, so any consumer that currently spells
  `unionMemberCount(tyNameOf(n))` or `splitUnionAtoms(tyNameOf(n), ...).length` for a
  CARDINALITY test can take the bank directly. `emit_classify` has 4 `unionMemberCount` and
  `emit_base` 3; each needs the local-aware check that its argument is the WHOLE annotation
  spelling and not a peeled part.
- The bank holds a COUNT, not the member list. A consumer that needs the ATOMS still splits.
  If a second cardinality consumer appears, banking the member IDs (the `unMemAtomIds`
  vocabulary) on the node is the next step, and `canonEmitName`'s union arm already has the
  member list in hand (`kept`) — but note that `kept.length` is NOT the atom count when a
  union ALIAS member expands (`AB | null` -> `A|B|null`), which is why this slice counted
  the finished string rather than the join.

### Gate

Corpus **byte-, message- AND run-identical** (1,273 files: `tests/cases` + a PINNED snapshot
of master's `compiler/` + `std/` + `scripts/`, `vl build` bytes by sha1, the compiler's full
stdout/stderr, and `vl run` stdout for the 1,009 `@run` cases) - fuzz A/B **50,400
programs/side**, whole `vl run --batch --out-dir` TREES compared (`diff -r`, 52,648 output
files per side): **0** diffs - shared-MODULE `vl run --batch` **1,009 programs, 986
outputs** per side, rc 0, 0 traps, trees and transcripts identical - shared-INSTANCE
(`tests/cases_wasm_test.ts`, one `WebAssembly.Instance` for the whole corpus) **1,961
passed, 0 failed** - additive probe **0 disagreements** over 1,273 corpus files and 50,400
fuzz programs, all four disagreement channels sabotage-verified at full reach.

A note on the corpus harness: the `compiler/` inputs MUST be a pinned snapshot. A first run
compared the live tree and reported 15 byte-diffs + 1,082 message-diffs — every one of them
a compiler module, because this slice edits `compiler/*.vl` and the sweep compiles those
files AS INPUTS. The A/B fixes the compiler and varies the input, so the input has to be
the one thing that does not move.

`refresh-compiler.sh` (RC=0) / `rep-fuzz-check.sh` (exact, 0 new / 0 stale) /
`native-fixpoint.sh` (stage3 == stage4, 1,018,677 bytes) / `lint-self.sh` (RC=0) /
`SELFHOST_NATIVE_ALIGN=1 deno task test` (1,961 passed, 0 failed) / `fuzz-sweep.sh`
(gating leg clean) — all RC=0.

The whole net was re-run after rebasing onto D-ABIDEDUP + D-ATOMPAIR (#1111), which lands
in the same subsystem: corpus **1,274 files** byte-, message- and run-identical (both sides
built from the same seed, inputs re-pinned at 7b065ec), fuzz A/B 50,400 programs/side with
**0** tree diffs over 52,648 output files each, shared-module `--batch` 1,010 programs /
987 outputs 0 traps 0 diffs, shared-instance suite **1,962 passed, 0 failed**, and every
standing script RC=0 again (`native-fixpoint` stage3 == stage4 at 1,018,324 bytes). The
call-arithmetic and work counts above are measured against bba4b4c.

### Method note earned

22. **A bank taken at the RESOLVER can be the wrong bank when a later pass REWRITES the
    string** (D-ANNCOUNT) — the obvious "record it where the members are still in hand"
    site for #1055 was `nameToTy`'s union arm, and it is wrong: `canonEmitTypeNames` runs
    AFTER resolution and rewrites every annotation, deduping canon'd members and expanding
    union aliases, so a pre-rewrite count and the count of the string the consumer reads
    are different numbers. Method note 2 (index vs name, intern time vs query time) has a
    twin on the NAME side: when the string itself is rewritten between producer and
    consumer, bank at the LAST producer, not the first.

## D-CANONWIDTH — the canon pass hands over the width it just wrote (#1113)

#1112 banked the annotation-spelling atom count at its producers and retired 2 emitter
parses — but its NET was zero, because the bank itself was taken by running
`unionMemberCount` over the finished string. This slice removes that last scan: the
producer that JOINS the name reports the name's width, so nothing takes apart a string the
compiler has just assembled.

`canonEmitTypeNames`:

```
-      atoms = unionMemberCount(c)
+      atoms = canonAtoms
```

`canonAtoms` is set by `canonEmitName` on the way out of every return; `emitNameAtoms` is
its `tyToEmitName` sibling, because two of `canonEmitName`'s arms hand back a RENDER and
need the renderer's width.

### The invariant that makes the threading total

A canon'd or rendered name gains a TOP-LEVEL `|` at exactly **three** places: the union
arm's join, `nulLitUnionPreserve`'s `|null` suffix, and `tyToEmitName`'s nullable arm.
Every other arm either recurses (and inherits the recursive count) or builds a name whose
separators sit inside a grouper or behind a top-level `=>` — ONE atom, which is exactly
where `unionMemberCount` stops counting.

The load-bearing case is the `!nameNeedsCanon(name)` early-out, which returns the name
UNCHANGED and therefore has no join to count. It is exact anyway, and by that predicate's
own shape: `nameNeedsCanon` returns TRUE on any `|` ANYWHERE in the name, so a name that
reaches the early-out has no `|` at all and is one atom by construction. The arms that
recurse and then build a DIFFERENT name (`[]`, the `{…}` shape, the function-type
re-render) reset the count to 1 rather than inheriting the sub-name's width.

### A refutation of this slice's own brief: `kept.length` is NOT the atom count

The brief named `kept.length` in `canonEmitName`'s top-level-union arm as a free, verified
count. It is not the count, and the program doc already said so in #1112's own hand-off
note — the union-ALIAS expansion substitutes a whole rendered member SET for one member:

```
type AB = A | B
const u: AB | null       // parts = [AB, null] -> kept = ["A|B", "null"] -> "A|B|null"
                         // kept.length = 2, top-level atoms = 3
```

Measured, not argued. An additive probe carrying BOTH candidate counts beside
`unionMemberCount(c)`:

| tag | corpus (1,274 files) | fuzz (50,400) |
|---|---|---|
| `R` — annotation nodes reaching the bank | **57,846** | **103,402** |
| `POS` — the name says >= 2 atoms | 1,127 | 18,018 |
| `EXP` — the union-alias expansion fired | 29 | 1,383 |
| `DIS` — THREADED count != `unionMemberCount` | **0** | **0** |
| `KDIS` — `kept.length` != `unionMemberCount` | **2** | 0 |
| `KPOSDIS` — the two disagree on the `>= 2` projection | 0 | 0 |

The two `KDIS` nodes are both in `tests/cases/types/nullable-union-alias.vl` — the shipped
pin for the very flattening (`AB | null` -> `A|B|null`) that breaks the shortcut.

`KPOSDIS = 0` is the honest other half: the ONE consumer today projects the count to
`>= 2`, and on that projection `kept.length` is currently invisible. A build shipping it is
byte-, message- and run-IDENTICAL over the 1,274-file corpus. It is still the wrong number:
the `>= 2` projection flips wherever an expansion is the SOLE kept entry (`(A | B) | AB`,
`AB | AB` — both dedup to one entry whose join is 2 atoms), and #1112's hand-off asks the
bank to serve CARDINALITY consumers, for which a wrong count is a wrong answer rather than
a harmless one. Those two shapes are rejected by this emitter for unrelated reasons
(`ref valtype with no interned shape`), so the shortcut is a loaded gun rather than a live
bug — the same verdict #1112 reached about `retMemCountOf`, and the same disposition:
do not ship it.

### A refutation of #1112's 7-site hand-off: **0 of the 7 can read the bank**

#1112 filed `emit_classify`'s 4 and `emit_base`'s 3 `unionMemberCount` sites as consumers
that "can take the bank directly". Enumerated by argument provenance, none of them can:
every one is a STRING-keyed helper whose argument is a peeled, derived or recursively
rebuilt name, not a whole annotation spelling read off a node.

| site | argument | why the node bank cannot serve it |
|---|---|---|
| `emit_base:1327` `parenUnionArrElemName` | the helper's `name` param | callers pass `leaf`, `ctx`, `"(" + elemName + ")[]"` — synthesized names with no node |
| `emit_base:1351` same helper | `name.slice(1, n-3)` | a PEELED element, not the spelling |
| `emit_base:1656` `isVariantBoxUnion` | the helper's `name` param | callers pass `ncRes` / peeled arm names |
| `emit_classify:2649` | `unionMemberSetOf(valName)` | a DERIVED alias-expanded member set |
| `emit_classify:2713` `mvCanonValName` | a map-VALUE name | a component of a spelling, not the spelling |
| `emit_classify:9676` `rlCanonLitUnionAtoms` | `rlCanonLitUnionAtoms(name.slice(...))` | a recursive peel |
| `emit_classify:9731` same helper | the recursion's `name` | same |

**Hand-off withdrawn.** Migrating any of them means giving the helper a node-keyed twin,
which is a different (and larger) piece of work than "read the bank".

### And a third: the count-then-split pairs are not redundant double-parses

Four sites in the owned files spell `if unionMemberCount(x) > 1 { splitUnionAtoms(x, out) }`
(and `isVariantBoxUnion` spells the `< 2` early-out before an unconditional split). Deleting
the count and reading `out.length` is exactly equivalent — `unionMemberCount` is
`splitUnionAtoms`'s counting dual, separator for separator — and it would score a clean
`-4` on the parse count.

It is the wrong change. `unionMemberCount` is the ALLOCATION-FREE dual: it exists so the
common single-atom name does not allocate an array and a slice. Converting the gate makes
every non-union call allocate, and this compiler is WasmGC-allocation-bound, not scan-bound.
A `-4` bought that way makes the compiler slower while moving no decision out of the
emitter — metric-gaming, so the sites stay and the reason is recorded here.

The same discipline caught a regression in this slice's own first draft: `tyToEmitName`'s
union arm carried the per-member counts in a parallel `i32[]` pushed beside `parts` — one
extra array per union render. Accumulating a running `psum` instead is the same number with
no allocation, and the shipped build is 319 bytes smaller than that draft.

### The call arithmetic

Local-aware scan (by resolver called, comments and the parsers' own definition headers
excluded) of the SCORECARD CORRECTION's parser list, over the three files this slice owns:

| file | master (6f5422c) | now | what moved |
|---|---|---|---|
| `compiler/typecheck.vl` | **22** | **21** | `unionMemberCount` 3 -> 2 |
| `compiler/emit_collect.vl` | 85 | 85 | — |
| `compiler/emit_base.vl` | 65 | 65 | — |
| combined | **172** | **171** | |

**1 parse DELETED with no fall-through · 0 parses ADDED · 0 consumers laddered · 0
resolutions deleted · NET −1.** One is a small number, and it is the whole point: #1112
moved two decisions for a net of zero, and this slice closes that zero by deleting the
scan #1112 opened rather than by opening another one somewhere else.

Deterministic work removed: **53,228** `unionMemberCount` scans over the pinned 31-file
`compiler/` + `std/` snapshot (swept file-by-file), **57,846** over the whole corpus — one
full pass over every annotation name in the program, replaced by an integer already in a
register. Added: the `emitNameAtoms` / `canonAtoms` assignments, no allocation.

### Entombment (method note 21) — and the one leg no pin can reach

Byte-, message- and run-identical over 1,274 corpus files and 50,400 fuzz programs, so by
construction there is no test that fails on master and passes here. What carries the slice:

- the additive probe's exact equality at **57,846 + 103,402** annotation nodes, with its
  disagreement channel verified at FULL reach by two separately built perturbations
  (bank + 1 and bank − 99 both light `DIS` at exactly `R`: 57,846 on the corpus, 15,232 on
  a 7,200-program fuzz leg);
- the gate channel: suppressing the bank (`atoms = 1`, i.e. never register) reddens exactly
  **3** corpus files on build status, message AND run —
  `types/struct-union-same-shape.vl`, `types/struct-union-same-shape-field-slot.vl`,
  `soundness/union-same-shape-discriminant-sound.vl`. (The same sabotage is invisible on
  7,200 fuzz programs — #1112 measured the same thing: the generator never produces the
  same-shape collapse in a consequential position.)

**No new pin ships, and here is why rather than a pin I know to be inert.** The bank has
exactly one consumer and it asks `>= 2`. Every leg this slice adds is therefore only
observable through that projection, and in the OVER-registration direction a wrong answer
is absorbed by `registerInlineUnion`'s self-gate — note 4 again. Measured: a build with the
`[]`-arm reset REMOVED (so `(A|B)[]` banks 2 instead of 1) is byte-, message- and
run-identical over the whole corpus. Three attempts at a distinguishing fixture
(`A | B | null` with same-shape members, in the param, binding and `is`-discriminant
positions) all hit pre-existing emitter gaps on MASTER, so none of them is a pin for this
change. The probe's answer-equality is the evidence carrying the per-leg correctness here,
and the corpus A/B is not — knowing which is which is the whole of note 4.

### Sidecar lifetime

No new arena-lifetime column: `emitNameAtoms`, `canonAtoms` and `nluAtoms` are scalars
written on the way out of a call and read by the immediate caller. `annUnionAtoms` keeps
#1112's push-per-node shape, and method note 24's property is preserved and RE-VERIFIED
rather than assumed: with BOTH resets removed the shared-instance suite
(`SELFHOST_NATIVE_ALIGN=1 deno task test`) goes **1,954 passed / 2 failed**
(`soundness/union-same-shape-discriminant-sound.vl`,
`types/struct-union-same-shape-field-slot.vl`) while the shipped build is 1,956 / 0.

### A harness correction: a compiler TRAP's backtrace is not a divergence

A first fuzz A/B reported **2 differing paths**. Both were `.err` files from cases where
the COMPILER ITSELF traps (`wasm trap: out of bounds array access`) on A and on B, in the
same six wasm functions — the only difference was the hex ADDRESSES in the backtrace, which
move because the two compiler binaries have different layouts. The harness now normalises
`0x…` in `.err` before the tree compare, and the function indices (which do carry
information) survive. This is the #1111 phantom-diff lesson in a new costume: a fresh
harness's first red is more likely the harness.

### Gate

Corpus **byte-, message- AND run-identical** (1,274 files: `tests/cases` + a PINNED
snapshot of master's `compiler/` + `std/` + two `scripts/*.vl`; `vl build` bytes by `cmp`,
the compiler's full stdout/stderr with the per-side out-path normalised, and `vl run`
stdout/status) · a SEPARATE full `@run` sweep over all **1,011** `@run` cases: identical ·
fuzz A/B **50,400 programs/side**, whole `vl run --batch --out-dir` TREES compared
(`diff -r`, **52,830** output files per side): **0** differing paths · the same harness
reports **4,663** differing paths over 2,400 programs against a build that rejects every
program, so the 0 is a measurement and not a dark wire · additive probe **0** disagreements
over 1,274 corpus files and 50,400 fuzz programs, both channels perturbation-verified at
full reach.

`refresh-compiler.sh` (RC=0, 1,018,523 bytes) · `rep-fuzz-check.sh` (exact, 0 new / 0
stale) · `native-fixpoint.sh` (stage3 == stage4, 1,018,523 bytes) · `lint-self.sh` (RC=0) ·
`SELFHOST_NATIVE_ALIGN=1 deno task test` (**1,956 passed, 0 failed**) — all RC=0.

### What did NOT move, and why

- **`recordInferRet`'s `unionMemberCount(ty)`** (the other count #1112 added) stays. Its
  producers are five separate name builders — `tyToStr` behind the `isClassifiableRetName`
  gate, `valueUnionRetName`, `structUnionRetName`, `variantBoxUnionRetName`, and the two
  literal `"boolean|null"` / `"string|null"` spellings — plus the anonymous-lambda site.
  Retiring it means threading a width out of `tyToStr` and three more join loops; the
  mechanism is identical to this slice's and the work is a slice of its own. **Named, not
  waved at**: the funnel is `recordInferRet`, the producers are the five above, and each
  one's `|` join is where its width is free.
- **The four count-then-split gates** — see above: the count is the allocation guard, not a
  redundant parse.
- **The 7 hand-off sites** — see above: string-keyed, no node.

### Method note earned

23. **A "free" count read off a container's LENGTH is only free when the container's
    entries are atoms** (D-CANONWIDTH) — `canonEmitName`'s union arm holds its members in
    `kept` and joins them with `|`, which makes `kept.length` look like the atom count of
    the result; it is not, because one arm substitutes a whole rendered member SET for one
    entry. The general form: when a producer's loop can replace one unit with many, the
    loop's iteration count and the result's unit count are different numbers, and only the
    accumulated sum is the second one. The corollary that made this cheap to settle: a probe
    should carry BOTH candidate answers beside the authority, not just the one you intend to
    ship — the shipped answer's 0 and the rejected answer's 2 came out of the same sweep.

## D-UHATOTAL + D-SETID + D-TWINROW — a dead fall-through DELETED, the set ids exported, and the struct-twin rung finally gets an arena input (#1114)

Three pieces, in ascending order of how much they overturned.

### The harness, and its power (established before any 0 was believed)

Corpus = **all 1,242** `tests/cases/**/*.vl`, three channels: per-file `vl build` **byte**
compare, full stdout+stderr **message** compare (each side's out-dir path normalised out —
method note 12's phantom-diff trap), and `vl run --batch --out-dir` **whole-tree** `diff -r`.
A program rejected on BOTH sides is not a byte diff (#1111's other phantom).

Fuzz = **100,800 programs/side** — seeds 1-14 × depths 4,5,6 × {plain, `--branching
--multiobs --declared`} × 600-count batches, generated ONCE by a FIXED generator compiler
(master) so both sides see identical programs, compared as whole `--out-dir` trees.

Self-test: A-vs-A is 0 on every channel; the D-UHATOTAL sabotage below is **156 byte-diffs,
98 message-diff files, 1,315 run-tree lines**. The channels have power — except at one site,
where they provably do not (method note 27).

### D-UHATOTAL — `unionHasAtomTy`'s legacy member-NAME fall-through is DELETED

#1111 measured this leg at 0 reaches over 1,242 corpus files and teed it up. The 0 is
confirmed and extended, and — the part a 0 alone cannot supply — the **mechanism** is now on
record.

| probe | corpus | fuzz |
|---|---|---|
| ENTRY to `unionHasAtomTy` (is the 0 vacuous?) | **182** files | **8,420** programs |
| the name fall-through actually reached | **0** | **0** |
| same marker, arena leg FORCED to decline | **182** | **8,420** |
| a registered member whose spelling does not resolve to an arena type (`unMemAtomTyIx` -1) | **0** | **0** |

The forced-decline population is **identical** to the entry population, at both volumes: every
program that asks this predicate would reach the fall-through if the arena leg declined, and
none does. The arena leg answers at **100%** of 8,602 asking programs.

**Why it is total** — `unMemHasAtom` declines for exactly three reasons, each closed:

1. *A row minted without its members recorded.* Structurally impossible: a union row is
   minted at exactly THREE sites (`registerInlineUnion`, `registerValueUnionName`,
   `collectU`'s `UnionDecl` arm) and each pushes `unNames` / `unMemberSet`, calls
   `recordUnMemTys`, and pushes the value box's `unVarStart` slice in ONE uninterrupted
   statement sequence. Row identity, member arena columns and box slice are minted
   ATOMICALLY. (`recordUnMemTys`' padding loop exists for a mint site that does not record;
   there is none.)
2. *A member spelling that does not resolve.* Measured 0 at the recorder, above.
3. *A name that is not a registered row.* Every one of the 31 call sites is lowering a VALUE
   BOX — coerce, `==`, literal `is`, the `??` and map-get residuals, a boxed list-literal
   arm, the boxed map-value and struct-field null tests — and a box exists only because the
   registration that minted its tag slice also recorded its members, by (1).

So the fall-through is deleted rather than laddered, and with it the last `want + "[]"` join
in the predicate. An uncovered row now says so LOUDLY (`emitFail`) instead of silently
answering "no such arm": a false `false` here picks a box tag or an `==` arm no producer
interned, which is a silent miscompile, and the assert makes the totality claim
self-enforcing.

`unionHasAtom` non-comment call sites in `emit_classify`: **5 → 4**.

### D-SETID — the narrowed-SET ids exported, and the hand-off's stated benefit REFUTED

#1109 filed `currentNarrowSetIdOf` as an export; #1110 added a second caller; #1111 confirmed
the filing and measured it as one line. Exported (with its struct dual
`currentStructNarrowSetIdOf`, which is what `emitMem`'s member-set dispatch actually needs —
a third conflation in that hand-off chain), plus two id-taking accessors:
`msMemberAtomsOfSet` and `unionResidualSoloKindOfSet`. Three consumers now take a banked
(row, mask) id instead of resolving a rendering:

| site | was | now |
|---|---|---|
| `emitCoalesce`, ident LHS | `unionResidualSoloKind(currentNarrowSetOf(…))` | `unionResidualSoloKindOfSet(currentNarrowSetIdOf(…))` |
| `emitMem`, member-set dispatch | `msMemberAtomsOf(currentStructNarrowSetOf(…))` | `msMemberAtomsOfSet(currentStructNarrowSetIdOf(…))` |
| `emitUnionUnionEq` | `msMemberAtomsOf(lname)` **and** `msMemberValKindsOf(msSetOfText(lname))` | one `lsid`, both readers |

**The refutation.** Three slices filed this as deleting a text→set RESOLUTION
(`msSetOfText` — a map probe plus, on a miss, a linear scan of every registered
`unMemberSet` row). It does — **on the narrowed leg**. On the un-narrowed leg
`currentNarrowSetIdOf` *is* `msSetOfText(unionNameOfIdent(…))`, i.e. literally the resolution
the old code performed. And the narrowed leg is never taken at either consumer: a marker on
`narrowVariantFor(recv) != ""` at both sites fires **0** times over 1,242 corpus files (the
fuzz grammar reaches neither site at all), against site reaches of **12** (`??` ident) and
**4** (`emitMem`). So:

- **resolutions genuinely deleted on the measured population: 1** — `emitUnionUnionEq`'s
  DUPLICATE (`msMemberAtomsOf`'s internal resolution of `lname` plus the explicit one that
  fed `msMemberValKindsOf`; the spellings and the kinds are two columns of the same (row,
  mask), not two questions). Reached 4 corpus files.
- the other two are **structural**, not a saving: the path from narrowing table to ABI code
  is now id-native, and it will stop rendering the moment a narrowed binding reaches it.

Banked-id vs resolved-id agreement was measured before shipping (both the set ids and the
resulting ABI kind / atom lists): **0** disagreements at both sites over corpus and fuzz.

That the narrowed leg is unexercised also means the migration is byte-identical *by
construction* on everything the corpus runs — and that its narrowed leg is entombed by
nothing. Stated plainly rather than claimed.

### D-TWINROW — the struct-twin rung gets an arena input, and BOTH prior diagnoses are wrong

D-ANNSLOT: *"The blocker is `rlElemStructRow`, not `rlSlotOfTy`"* — the CANDIDATE half.
#1111: *"the CANDIDATE half agrees 12/12 … the QUERY half disagrees 6/6 … the blocker is an
arena dual of the FIELDSET scan reproducing all four of `shapeFieldTypeCompat`'s RETIRED
refutation arms."*

Measured at the site, with the RECORDED arena input (`sFieldElemTyIxAt(si, fi)` — which every
witness has: `isObj=1` at all 6, no nullable hop needed), on the same 6-of-1,241 population:

- **The QUERY half agrees 6/6** — by the fieldset dual AND by `repRowOfTyStruct`'s canonical
  key. #1111's 6/6 disagreement does not reproduce from the recorded type.
- **The CANDIDATE half is where it splits**, and it splits by CANDIDATE KIND. Every witness
  has exactly two kind-1 candidates: a DECLARED alias (`T0`) and an INLINE shape.

| candidate | `structIndexOfTypeName` (name) | `structIndexOfTy` (identity) | canon key | field-name-set scan |
|---|---|---|---|---|
| declared alias `T0` (×6) | 1,3,1,1,1,2 | **same 6/6** | **same 6/6** | wrong 6/6 |
| inline shape (×6) | 0,1,0,0,0,1 | -1 (declines) | **wrong 6/6** | **same 6/6** |

**The real mechanism: `structIndexOfTypeName` is a TWO-RUNG resolver** — `structIndexByName`
(nominal identity) first, the lenient field-name-set scan second — and every attempt across
three slices implemented exactly ONE rung. The arena composite that reproduces it is

```
structIndexOfTy(ty)            // identity, via the D0 sidecar sTyIx
  ?? <field-NAME-set scan>     // leniency, over the TyObj's objFieldNames
```

which matches the name resolver at **12/12 candidates and 6/6 queries**, and the full arena
rung built on it (`rlSlotOfTyTwin`, with the `| null` parity as a `TyNullable` test) returns
exactly the slot the rendered rung returns at **6/6** witnesses.

**And `shapeFieldTypeCompat` is not the blocker at all.** The field-code TIGHTENING is not
reproduced here, deliberately: the field-code vocabulary has exactly two producers, both
string-driven — `nameFieldCode(t: string)` over a rendered type and `fieldTypeCode(tyIx)`
over an AST `TypeRef` node's `tyName` — and NO `Ty`-arena classifier, so an arena tightening
would mean a THIRD hand-copied copy of a 34-arm table, which is the exact drift hazard
D-ABIDEDUP had just removed. It is also unnecessary: the row this scan produces feeds
`repStructSlotsTwin` at the only call site, a canonical-key AND field-code-LAYOUT equality
over the two rows, so a row matched more leniently than the name scan cannot yield a slot
unless it is a layout twin anyway. (The four RETIRED arms #1111 named are retired — that
branch of `shapeFieldTypeCompat` returns `true` unconditionally apart from the code-15
nested-struct key tightening.)

**Shipped:** `rlSlotByNameTy(name, ty)` — rungs 1 and 2 untouched and still first (a hint
must never preempt the exact-name or rep-key match), then the arena rung. `sFieldRefSlot`
passes its recorded element type; the other **23** `rlSlotByName` call sites pass -1 and keep
the rendered rung unchanged. **On the hinted path the rendered rung is DELETED**, on this
evidence:

| probe (hinted calls only) | corpus | fuzz |
|---|---|---|
| arena rung REACHED (answers) | **6** files | **38** programs |
| … and the rendered rung agrees | 6/6 | 22/22 |
| … and the rendered rung DECLINES (arena extends coverage) | 0 | 16 |
| … and they CONTRADICT | **0** | **0** |
| arena rung declines AND the rendered rung would have answered | **0** | **0** |
| same marker, arena rung FORCED to decline | **6** | **22** |

### A refutation of this slice's own brief: rung 3 is NOT load-bearing at `sFieldRefSlot`

The brief (from #1111) says deleting `rlSlotByName`'s rung 3 costs **9** corpus byte-diffs
and **51** run-tree lines, "so it cannot simply be removed". That is true across all 24
callers. At `sFieldRefSlot` — the site the whole `WSFRL` story is about — it is not:

- forcing the arena rung to -1 **with the rendered rung already deleted for hinted calls**
  (so `sFieldRefSlot` gets -1 at all 6 reaches) is **byte-, message- AND run-identical** over
  1,242 corpus files and **0 tree diffs** over 100,800 fuzz programs.

So the rung is **reached 6 times and consequential 0 times** here, and D-TOTALITY's
"`sFieldRefSlot`'s fall-through is consequential 18 times in 49,422 programs" is carried by
rungs **1 and 2** (the exact-NAME match and `repElemKeyOfName`), not by the struct-twin rung.
**That reassigns the target**: what gates deleting `sFieldRefSlot`'s name fall-through is the
exact-name rung and `repElemKeyOfName`'s coverage gap against `repElemKey` — not the fieldset
dual three slices have been chasing.

### The pins, and the one that cannot exist

No new test case. Per method note 21 all three pieces are behaviour-preserving refactors, so
none can have a fails-on-master test; the entombment is byte-identity plus a sabotage with
power:

| sabotage | what it breaks | corpus |
|---|---|---|
| `unionHasAtomTy`'s arena answer inverted (`a == 0`) | the union-box atom test | **156** byte-diff, **98** msg files, **1,315** run-tree lines |
| `msMemberAtomsOfSet` member order REVERSED + `unionResidualSoloKindOfSet` loses its `msSubNull` | the box-tag ABI order and the residual's identity | **32** byte-diff, **19** msg files, **356** run-tree lines |
| `rlSlotOfTyTwin` loses its `repStructSlotsTwin` guard | which twin slot is returned | **0** |
| `rlSlotOfTyTwin` loses its IDENTITY rung (the variant that answers 0 where the name rung answers 1, ×3) | the query/candidate row | **0** |
| `rlSlotOfTyTwin` forced to -1, rendered rung already deleted for hinted calls | the rung's whole answer | **0** (and 0 on 100,800 fuzz programs) |

The last three are one finding, and it is method note 27: **a rung whose contract is
"return a LAYOUT TWIN of the query" cannot be entombed by an output channel**, because layout
twins emit the same heap type. D-TWINROW is carried by its answer-equality probe and by
nothing else, and this doc says so rather than quoting the corpus at it.

A first sabotage attempt for D-SETID — swapping `lname`/`rname` at `emitUnionUnionEq` and
swapping the value/struct set duals at the other two sites — produced **0 diffs** and was
discarded: at all 4 `emitUnionUnionEq` reaches both operands are the same union, and the two
duals differ only by an alias EXPANSION no reaching binding uses. Method note 8, again.

### The three numbers, reported separately

- **Parses DELETED, with no fall-through: 1** — `unionHasAtomTy`'s legacy member-NAME scan
  (`unionHasAtom`, whose body is `splitUnionAtoms`) together with the `want + "[]"` join that
  fed it. All 31 call sites of the predicate are now arena-only.
- **Name fall-throughs DELETED on a path: 1** — `rlSlotByNameTy`'s rendered struct-twin rung
  for a hinted caller. No `nullablePartOf`, no `structIndexOfTypeName`, no `shapeFieldParse`
  on `sFieldRefSlot`'s path any more. The rendered rung's SOURCE stays: 23 unhinted callers
  still need it.
- **Consumers migrated to a ladder: 0.** Nothing gained an arena leg with a live name
  fall-through; the two arena legs added are total on their paths and the fall-throughs went.
- **Text→set RESOLUTIONS deleted: 1** (measured population) — `emitUnionUnionEq`'s duplicate.
  Two further sites became id-native with a measured saving of **0**, because their consumers
  only ever take the un-narrowed leg.

### Gate

Corpus **byte-, message- AND run-identical**: 1,242 files, 1,055 emitting wasm (187 rejects
on both sides) — **0** byte-diffs, **0** message-diff files, **0** run-tree diff lines.
Fuzz A/B **100,800 programs/side**, whole `--out-dir` trees: **0** diffs.

`refresh-compiler.sh` RC=0 · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined failure — 0
unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4, 1,019,498
bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0 (**1,955
passed, 0 failed**, 14 ignored) — the shared-INSTANCE lifetime gate (this slice adds no
sidecar column, but it is the standing gate).

**Re-run in full after rebasing onto D-ANNCOUNT (#1112) and D-CANONWIDTH (#1113)**, both of
which land in `typecheck.vl` / `emit_collect.vl`: corpus **1,243 files, 1,056 emitting** —
0 byte-diffs, 0 message-diff files, 0 run-tree diff lines; fuzz A/B **100,800
programs/side** re-generated by the rebased master compiler — **0** tree diffs;
`refresh-compiler.sh` / `rep-fuzz-check.sh` / `native-fixpoint.sh` (stage3 == stage4,
1,019,727 bytes) / `lint-self.sh` all RC=0; `SELFHOST_NATIVE_ALIGN=1 deno task test`
**1,956 passed, 0 failed**, 14 ignored.

### What did NOT move, and the blocking mechanism

- **`repRowOfTyFieldset` as a faithful dual of the TIGHTENED fieldset scan.** Blocked on an
  arena→field-CODE projection: `nameFieldCode` (a rendered type) and `fieldTypeCode` (an AST
  `TypeRef`'s `tyName`) are the only two producers of the 34-code field vocabulary, and both
  are string-driven. The honest fix is not a third copy but ONE arena-keyed home
  (`tyFieldCode(ty)`) that both become projections of — the D-ABIDEDUP shape applied to the
  field-code table. Until then the shipped rung uses the UNTIGHTENED name-set scan, guarded
  downstream by `repStructSlotsTwin`, and that is stated at the function.
- **The 11-leg `nameIsRefArray` family** stays. Not for the reason on record: with rung 3
  arena-fed and measured non-consequential at `sFieldRefSlot`, the remaining gate at that
  site is rung 1 (the exact-NAME match) and rung 2's `repElemKeyOfName` coverage against
  `repElemKey`. `nodeTyIx` coverage is the other, and is outside this partition.
- **`emitUnionUnionEq`'s `rname` side** still resolves through `msMemberAtomsOf(rname, …)`.
  It has no second reader, so there is no duplicate to remove.

### Hand-offs

- **`typecheck.vl` / `emit_collect.vl`** (concurrently owned): `nameFieldCode` and
  `fieldTypeCode` should both become projections of a single `tyFieldCode(ty)` over the `Ty`
  arena. That one function is what unblocks a faithful `repRowOfTyFieldset`, and it removes
  a two-copy table at the same time.
- **`rlSlotByNameTy`'s hint is available at more callers than one.** `variantFieldRefSlot`
  has `uFieldElemTyIxAt`; `mvValInnerRlSlot` and the `rlElemInnerSlot` family have
  `rlElemTyIx`. Each is a one-line hint plus the same reach/agreement/decline probe triple.
- **`emit_state.vl`**: nothing new; `rlElemTyIx` and `sTyIx` both proved load-bearing for
  this slice and neither needs a reset change.

### Method notes earned

24. **Comparator sanity must be proven against a deliberately WRONG build, not an older
    correct one** (the owner's, this cycle) — a 1,009-of-1,009 SAME reading between master
    and a compiler 20 PRs older is the CORRECT answer when the whole arc is
    behaviour-preserving, and reads as a broken harness. Prove power with a sabotage.
25. **A hand-off's stated BENEFIT can be real on a leg the corpus never takes** (D-SETID) —
    three slices filed `currentNarrowSetIdOf` as deleting a text→set resolution. It does, on
    the NARROWED leg; the UN-narrowed leg is literally that resolution. Measured: the
    narrowed leg is reached 0 of 12 and 0 of 4 times at the two consumers. Measure which LEG
    of an accessor the consumer takes before quoting the accessor's saving.
26. **A resolver with two rungs needs BOTH, and a dual implementing one looks byte-identical
    and is wrong** (D-TWINROW) — `structIndexOfTypeName` is nominal identity THEN a lenient
    field-name-set scan. `structIndexOfTy` / the canon key reproduce rung 1 (6/6 on declared
    inputs, wrong 6/6 on inline ones); the fieldset scan reproduces rung 2 (the mirror
    image). Three attempts over two slices each built one rung and each was written up as
    "byte-identical, answers 0 of 6" — which is what a half-resolver always looks like.
    Before building a dual, count the resolver's rungs.
27. **A rung whose contract is "return a LAYOUT TWIN" cannot be entombed by any output
    channel** (D-TWINROW) — three class-leaving sabotages of the struct-twin rung (drop the
    twin guard, drop the identity rung, force the whole rung to -1) are ALL 0-diff on 1,242
    corpus files and 100,800 fuzz programs, because every answer the rung can give emits the
    same heap type. Note 4's "conservative wrong answer is invisible" in its strongest form:
    such a site is carried by answer-equality alone, and a slice quoting byte-identity as its
    evidence there is quoting nothing.
28. **"Reached" and "consequential" must be re-measured PER CALLER, not per function**
    (D-TWINROW) — `rlSlotByName`'s rung 3 costs 9 corpus byte-diffs when deleted for all 24
    callers and **0** when deleted for the one caller the whole investigation was about. A
    function-level load-bearing verdict pointed three slices at the wrong half of a resolver.
## D-INFERRETWIDTH — the inferred-return producers hand over the width they joined (#1115)

#1112 banked the inferred-return name's top-level atom count at `recordInferRet`, the one
funnel every producer's name lands in, and took the number by **splitting a string its
producers had joined moments earlier**. #1113 removed the sibling scan the same way the
canon pass does: the producer that JOINS the name reports the name's width. This slice does
the last one — `recordInferRet` takes an `atoms` parameter and `unionMemberCount` leaves the
recorder.

```
-function recordInferRet(name: string, ty: string, tyIx: i32) {
-  inferRetAtomCount.push(unionMemberCount(ty))
+function recordInferRet(name: string, ty: string, tyIx: i32, atoms: i32) {
+  inferRetAtomCount.push(atoms)
```

### The producers: 28, not 5 — a correction to this slice's brief

The brief named "five producers plus the anonymous-lambda site". The five are real (they are
`elaborateInferRets`' arms: `tyToStr` behind `isClassifiableRetName`, `valueUnionRetName`,
`structUnionRetName`, `variantBoxUnionRetName`, and the two literal `"boolean|null"` /
`"string|null"` spellings). But **the anonymous-lambda site is not a sixth producer — it is a
24-rung ladder**, plus the three struct-canon recorders (`structFieldBoxRetName` /
`structMapFieldRetName` / `structPlainRetName`) computed ahead of it. Enumerated by what can
reach `recordInferRet`'s `ty` argument, the producer set is **28 functions**:

| width | producers |
|---|---|
| the renderer's own (`emitNameAtoms`, #1113) | `structFieldBoxRetName`, `structMapFieldRetName`, `structFieldBoxElemListRetName`, `structPlainRetName`, `structElemListRetName`, `nulStructElemListRetName`, `nulMapElemListRetName`, `nulListElemListRetName`, `mapElemListRetName`, `elemValueUnionListRetName`, `elemRefArmValueUnionListRetName`, `nestedElemUnionListRetName`, `nestedLeafListRetName`, `mapUnionRetName` (17 return sites) |
| 1, by construction (`X[]` / `(X)[]` / an alias identifier) | `nulElemListRetName`, `nulClosureElemListRetName`, `litUnionElemListRetName`, `elemVariantBoxListRetName`, `elemMapUnionListRetName`, and `litUnionAliasNameOfTy` at its rung |
| the JOIN width | `valueUnionRetName` (leaf count), `structUnionRetName` / `refArmUnionRetName` / `cloArmValueUnionRetName` (member count), `litUnionArrayValueUnionRetName` (**summed** member widths), `variantBoxUnionRetName` (**appended-atom count**) |
| 2, spelled literally | `nullableRetName`'s five arms, `nulLitUnionRetName`, the two `…|null` sites in `elaborateInferRets` |

### The threading contract, and why it is total without an entry reset

One module scalar, `inferRetNameAtoms`, written **immediately before each NON-EMPTY return**
(`irAtoms(nm, w)` / `irRendered(nm)` do it in one expression; `irRendered` is a call so the
render is evaluated before `emitNameAtoms` is read, with no dependence on argument
evaluation order).

The subtle part is that writing on *every* return — the `tyToEmitName` discipline — is
**not** what makes this total, and neither is an entry reset. A rung that returns `""` can
still have churned the scalar through its own nested producer calls
(`elemRefArmValueUnionListRetName` calls `variantBoxUnionRetName` and may then decline). What
makes it total is that **the ladder short-circuits**: `if unm == "" { unm = f(…) }` stops
calling producers the moment one answers, so the last producer to return non-empty is
exactly the one whose name is recorded, and it is the last writer of the scalar. Every
earlier rung's churn is overwritten by the winner. Reading the scalar once after the ladder
is therefore exact — measured at every one of the 30,252 recorded rows below.

The `recordable` path skips the ladder entirely and records `anm = tyToStr(inferred)`; its
width is 1 and the gate proves it, not the source: `isClassifiableRetName` is six scalar
spellings plus `i32[]`/`string[]`, `isScalarListRetName` is three list names, and
`isObjShapeName` explicitly rejects a top-level `|` (and a `{…}` render has `pdepth >= 1`
from index 0, where `unionMemberCount` counts nothing).

### Two traps, and the measurement that separated them

The brief predicted "at least one producer has an expansion/flattening trap". There are two,
and they run in **opposite** directions:

- `litUnionArrayValueUnionRetName` **expands**: it joins `tyToEmitName(members[i])`, and that
  render can be wider than one atom (its nullable arm spells `X|null`). Shipped as a running
  sum of the renderer's reported widths, not `members.length`.
- `variantBoxUnionRetName` **contracts**: a litunion ALIAS member's literals flatten into
  sibling `TyLit` members, and the loop regroups them into ONE alias atom with a `continue`,
  so the iteration count over-counts. Shipped as an appended-atom counter.

Per method note 23 the probe carried **both** rejected candidates beside the authority in one
sweep (`ALT` = the `members.length` answer, `VBC`/`LAC` = how often each trap fired):

| tag | corpus (1,274) | fuzz (50,400) |
|---|---|---|
| `R` — recorded rows | **20,248** | **10,004** |
| `POS` — the name is >= 2 atoms | 204 | 1,383 |
| `DIS` — THREADED width != `unionMemberCount` | **0** | **0** |
| `POSDIS` — the two disagree on the `>= 2` projection | **0** | **0** |
| `VBC` — the variant-box CONTRACTION fired | 27 | 1,055 |
| `LAC` — the litunion-array EXPANSION fired | **0** | **0** |
| `ALT` — the `members.length` answer != `unionMemberCount` | **24** | **883** |
| `ALTPOS` — and it flips the `>= 2` projection | **24** | **883** |

So the two traps are not symmetric as evidence. The **expansion** one has no witness on
either surface (`LAC` = 0) — a loaded gun, shipped correct on reasoning alone. The
**contraction** one fires 27 times on the corpus and 1,055 in fuzz, and the naive answer is
wrong at 24 recorded rows in **13 corpus files** — every one of which flips the bit the
single consumer reads. That is a stronger witness than #1113's `KDIS = 2`.

**And it is still invisible.** A build shipping `irAtoms(name, members.length)` is byte-,
message- and run-IDENTICAL over the whole 1,274-file corpus. The reason is #1112's note-4
asymmetry, re-measured here: all 24 disagreements are in the OVER-registration direction
(`psum` = 1, `members.length` >= 2 — a pure litunion alias like `K` recorded as one atom
while its flattened members count three), and a spurious `registerInlineUnion` is absorbed by
`registerInferRetNominalUnion`'s `isUName` self-gate. The 13 files:
`closures/{closure-result-map-union, field-closure-chain-same-fieldset, lambda-litunion-result,
nested-closure-result-union-arm-sig, twin-fieldset-closure-field-sig-split,
closure-result-closure-composite-result, closure-nullable-closure-union-valuecall,
closure-result-nullable-closure-array, twin-fieldset-deep-composite-narrowed-call}`,
`maps/closure-litunion-result-value`, `unions/{variant-closure-field,
union-box-field-arm-closure-array-index-call, variant-closure-array-field}`.

**Which half of the evidence carries which half of the change** (method note 4, stated
plainly): the corpus A/B carries the *under*-count direction and nothing else — forcing every
threaded width to 1 reddens 6 files. The *over*-count direction has no gate-channel witness at
all (`inferRetAtomCount.push(99)`, "always register", is byte-, message- and run-identical over
1,274 files), so it is carried **only** by the probe's exact equality at 30,252 rows.

**Comparator sanity, both channels, at full volume** (two separately built perturbations of
the threaded value):

| perturbation | corpus | fuzz |
|---|---|---|
| `atoms + 1` | `DIS` 20,248 (= `R`), `POSDIS` 20,044 (= `R` − `POS`) | `DIS` 10,004 (= `R`), `POSDIS` 8,621 (= `R` − `POS`) |
| `atoms − 99` | `DIS` 20,248 (= `R`), `POSDIS` 204 (= `POS`) | `DIS` 10,004 (= `R`), `POSDIS` 1,383 (= `POS`) |

Every zero above sits on a wire shown to carry a planted signal at exactly the site's full
reach count. (A first probe reported at the end of `collectU`, method note 17's shape, and
lost 14 rows in the 30 corpus files whose checker rejects before emit; the shipped probe
reports as a checker diagnostic at the end of `checkProgram`, which every checked program
reaches.)

### Entombment (method note 21) — REACHED vs CONSEQUENTIAL, quantified

Byte-, message- and run-identical over 1,274 corpus files and 50,400 fuzz programs, so by
construction there is no test that fails on master and passes here. What carries it:

- the probe's exact equality at **20,248 + 10,004** recorded rows, both channels
  perturbation-verified at full reach;
- the gate channel: **6 corpus files** redden (4 on build status, 6 on bytes, 5 on run) under
  either `inferRetAtomCount.push(1)` (bank suppressed) **or** an `irAtoms`/`irRendered` that
  reports 1 regardless of its argument (every *threaded* width suppressed, the checker's two
  literal-2 sites left intact) — the same 6 either way:
  `closures/closure-alias-union-return-hof`, `closures/inferred-variant-box-lambda-result`,
  `closures/union-returning-map`, `functions/inferred-struct-union-common-field`,
  `functions/inferred-struct-union-return`, `functions/inferred-variant-box-union-return`.

The two sabotages agreeing is itself the measurement worth writing down: **98 corpus files
record a `>= 2`-atom inferred-return name (204 rows), and forcing every one of those widths to
1 changes the output of 6.** Reached is not consequential (method note 10), and the ratio here
is 16:1.

**No new pin ships, and the reason is the note-4 asymmetry above, not laziness.** The one
consumer projects the bank to `>= 2`; the over-registration direction is provably absorbed;
so the only pinnable direction is under-registration, and the six files above already pin it.
The `nullableRetName` / list-element legs (width 2 and width 1) are **coverage-only** on this
surface: they are reached (98 files) and answer identically, but no fixture distinguishes a
correct answer there from a wrong one — say it plainly rather than ship an inert pin.

### The call arithmetic

Local-aware scan (by resolver called, comments and the parsers' own definition headers
excluded) of the SCORECARD CORRECTION's parser list, over the three files this slice owns:

| file | master (0adb59d) | now | what moved |
|---|---|---|---|
| `compiler/typecheck.vl` | **21** | **20** | `unionMemberCount` **2 -> 1** |
| `compiler/emit_collect.vl` | 85 | 85 | — (untouched: the file has no diff) |
| `compiler/emit_base.vl` | 65 | 65 | — (untouched) |
| combined | **171** | **170** | |

**1 parse DELETED with no fall-through · 0 parses ADDED · 0 consumers laddered · 0
resolutions deleted · NET −1.** With #1112's two deletions and #1113's, the D-ANNCOUNT
family now nets **−3** across three slices: two emitter decisions moved onto banks and both
banks are taken at their producers, so neither opened a new scan.

Deterministic work (method note 15 — instrumented compiler, counters on the pinned inputs):

| | pinned 31-file `compiler/` + `std/` snapshot | whole 1,274-file corpus |
|---|---|---|
| `unionMemberCount` calls removed | **19,136** | **20,248** |
| characters those scans walked | **89,243** | **99,624** |
| `irAtoms` / `irRendered` calls added | **20** | **928** |

The ratio is the point: nearly every recorded row comes through
`isClassifiableRetName`'s literal-1 path, which adds no call at all, so ~19 K whole-string
scans are traded for ~20 integer stores. No allocation on either side — the #1113 discipline
(do not buy a parse-count point with an allocation) is respected, and here the trade is
lopsided in the good direction. The shipped binary is 1,018,822 bytes vs master's 1,018,523
(+299, the 28 producers' width reporting).

### Sidecar lifetime

No new arena-lifetime column, so method note 7's reset question does not arise:
`inferRetNameAtoms` is a scalar written on the way out of a call and read by the immediate
caller. It cannot leak across programs either — the `recordable` path sets its own 1 and the
ladder path always has a winning producer that has just written it. `inferRetAtomCount`
keeps #1112's per-program reset (`checkProgram`'s table clear) and its push-per-row shape, so
method note 24's property is unchanged.

### What did NOT move, and why

- **`emit_collect`'s and `emit_base`'s `unionMemberCount` sites** — #1113 enumerated all 7 by
  argument provenance and withdrew the hand-off; re-checked here, nothing changed. This slice
  does not touch either file (the diff is `compiler/typecheck.vl` only).
- **The four count-then-split gates** — #1113's third refutation stands: `unionMemberCount` is
  `splitUnionAtoms`'s ALLOCATION-FREE dual and replacing the gates with `atoms.length` would
  buy `-4` with an allocation per non-union call.
- **`typecheck.vl`'s ONE remaining `unionMemberCount` call** is `isVariantBoxUnion`'s
  `< 2` early-out — the same allocation-guard shape, ahead of an unconditional
  `splitUnionAtoms`. (The counts above exclude each parser's own definition header;
  `typecheck.vl` declares four of the SCORECARD parsers — `isTopLevelFuncTypeName`,
  `nameIsLitUnionType`, `splitUnionAtoms`, `unionMemberCount` — so the raw grep sees one
  more occurrence than the table's number for each.)
- **The secondary target — "anything else in these three files retirable by banking at the
  LAST producer" — is EMPTY for `typecheck.vl`, and the enumeration says why.** All 20
  remaining parses, attributed to their enclosing function:

  | site | count | why a bank cannot serve it |
  |---|---|---|
  | `canonEmitName` (7 `isTopLevelFuncTypeName`) + `nulLitUnionPreserve` (1 `nameIsLitUnionType`) | 8 | **This is the last producer.** They parse the pass's INPUT — the annotation text the user wrote — on its way into the emitter's vocabulary. There is no earlier producer to bank at; note 22's rule bottoms out here. Class (iii), where this program has always said the parse belongs. |
  | `nameToTy` (2 `isTopLevelFuncTypeName`) | 2 | The RESOLVER, parsing a source spelling. Same argument. |
  | `nameIsInlineLitUnion`, `nulElemListAtomKind`, `nameIsLitUnionArmValueUnion`, `litUnionArrayElemOf`, `isValueUnionName` | 9 | #1113's withdrawn-hand-off shape exactly: string-keyed helpers whose argument is a peeled element, a derived member set or a recursive re-entry — no node, so no bank to read. |
  | `retAtomKindOf` (1 `nameIsLitUnionType`) | 1 | Not a structural decision from a rendering at all: it asks whether a PRIM's own `primName` is a REGISTERED litunion alias. That is nominal identity wearing a predicate's name — the owner's rule explicitly permits it. |

  So the family that remains in `typecheck.vl` is the canon pass's own machinery plus the
  atom-kind helpers, and neither is reachable by this slice's technique. A different slice,
  and — for the first two rows — probably no slice at all.
- **`litUnionAliasNameOfTy` does not report a width.** It is a general-purpose reverse-map
  helper called from `tyToEmitName`, `vbUnionMemberName`, `nullableRetName` and a dozen other
  places; making it write the inferred-return scalar would give it a side effect its other
  callers do not want. Its one recorder rung reports the 1 instead.

### Gate

Corpus **byte-, message- AND run-identical** (1,274 files: `tests/cases` + a PINNED snapshot
of master's `compiler/` + `std/` + the two `scripts/*.vl`; `vl build` bytes by sha1 — 1,084
files emit bytes — the compiler's full stdout/stderr with the out-path normalised, and
`vl run` stdout/stderr + status for all **1,011** `@run` cases): **0** differing paths on
every channel · the same harness reports **6 files** differing against the never-register
sabotage, so it is not a dark wire · fuzz A/B **50,400 programs/side**, whole
`vl run --batch --out-dir` TREES compared (`diff -r`, **52,648** output files per side, `.err`
hex addresses normalised per #1113): **0** differing paths · the same fuzz harness reports
**98,552** differing paths against a build that rejects every program · the never-register
sabotage is **0** on the fuzz leg, which is #1112's and #1113's finding again (the generator
never produces the anonymous-nominal residual in a consequential position) · additive probe
**0** disagreements over 1,274 corpus files and 50,400 fuzz programs, both channels
perturbation-verified at full reach.

`refresh-compiler.sh` (RC=0, 1,018,822 bytes) · `rep-fuzz-check.sh` (exact, 1 baselined
reject, 0 new / 0 stale) · `native-fixpoint.sh` (stage3 == stage4, 1,018,822 bytes) ·
`lint-self.sh` (RC=0) · `SELFHOST_NATIVE_ALIGN=1 deno task test` (**1,962 passed, 0 failed,
8 ignored**) — all RC=0.

The whole net was re-run after rebasing onto D-UHATOTAL + D-SETID + D-TWINROW (#1114),
which lands in the same subsystem: both sides re-built from ONE seed and the corpus inputs
re-pinned at 66dd2db, corpus **1,274 files** (1,084 emitting bytes, 1,011 `@run`) byte-,
message- and run-identical; fuzz cases re-generated with the rebased master seed and the
A/B re-run at **50,400 programs/side**, 52,648 output files each, **0** tree diffs; every
standing script RC=0 again (`native-fixpoint` stage3 == stage4 at 1,020,026 bytes,
`rep-fuzz-check` exact, suite **1,962 passed / 0 failed**). The call arithmetic is
unchanged on the new base (`typecheck.vl` 21 -> 20, the other two files untouched at 85 and
65), and the binary delta is the same +299 bytes (1,019,727 -> 1,020,026).

### Method note earned

29. **A short-circuiting LADDER makes a "last writer wins" scalar total, where "write on
    every return" does not** (D-INFERRETWIDTH) — the obvious contract for a
    second-return-value scalar is `tyToEmitName`'s: set it at entry and at every return. That
    is neither necessary nor sufficient here. Not sufficient, because a rung that returns `""`
    can still have churned the scalar through nested producer calls after its own entry
    write; not necessary, because the ladder stops calling producers once one answers, so the
    winner is always the last writer. Identify the control-flow property that makes the read
    correct and state it — "every function writes it" is a habit, not an argument.

## D-ELEMROW + D-UARMSLOT — the ref-list element ROW ladder, and the union ref-array ARM scanners (#1116)

Two pieces, both aimed by #1114's transferable lesson (**a resolver is a LADDER; a dual of
one rung is not a dual of the resolver**) and both settled by carrying every candidate
beside the authority in ONE sweep.

### The brief this slice was given is stale, and that is the first finding

The brief's priority-1 target was *"the eleven-leg `nameIsRefArray` consumer family (ASLOT,
AKIND, DLETN, DRETN, CRET, CPAR, ELETRA, FSTR, FF32, FI64, FF64) — the strongest deletion
case this program has produced"*, carried forward from #1114's "What did NOT move". **All
eleven were deleted in D-ANNSLOT (#1107)** — they are the first eleven of that slice's
"What was deleted (13 legs)" list, and the current tree confirms it: `tyAnnRefListSlot`,
`tyAnnRefListKind`, `retRefArrFlag`, `retNulRefArrFlag`, `paramRefArray`,
`letIsNulRefArray`, `letIsRefArray` and the four `letIs*Array` ref-array rejects each read
`annRefArrSlot` / `annBareRefArrSlot` / `annNulRefArrSlot` and have no name leg at all.
What survives under that heading is a DIFFERENT population — the 24 residual
`nameIsRefArray` call sites, of which the intern side owns most and the **union member-ATOM
scanners** own the rest. Those are D-UARMSLOT below, and they were never annotation-node
consumers. A stale line in a "what did NOT move" section outlived the work that moved it.

### Harness

Corpus = all **1,243** `tests/cases/**/*.vl`, three channels: per-file `vl build` **byte**
compare, full stdout+stderr **message** compare (out-dir paths normalised), and
`vl run --batch --out-dir` over the whole corpus as a **tree** `diff -r` plus transcript.
Fuzz = **100,800 programs/side** (seeds 1-14 × depths 4,5,6 × {plain, `--branching
--multiobs --declared`} × 1,200 per bucket, 84 buckets), generated ONCE by the master compiler so both sides see
identical programs, compared as whole `--out-dir` trees. Probe builds report an accumulated
tag table once at the end of `emitProgram` through `emitFail` (note 7), with `emitFailed`
cleared first so a program that already rejected still reports.

### D-ELEMROW — `rlElemStructRow` resolves its row in the arena's vocabulary, and the fieldset PARSE leaves the path

`structIdxOfElemName` is a **four-rung** resolver: peel `nullablePartOf`, then
`structIndexByName` (nominal), then `repRowOfName` (`renderFaithful` + `resolveAnnot` +
the canon key), then `structIndexOfTypeName` (nominal again, then `nameIsWholeSpanShape` +
`shapeFieldParse` + the `shapeFieldTypeCompat`-TIGHTENED field-name-set scan).
`rlElemStructRow`'s arena leg reproduced rung 2 only — which is exactly why D-TOTALITY
measured its fall-through (`RLSR`) **consequential 28 corpus / 246 fuzz**, the
second-most load-bearing name leg on the whole map.

One sweep, every candidate beside the authority, at the site:

| at `rlElemStructRow` | corpus (1,243 files) | fuzz (100,800 programs) |
|---|---|---|
| calls reached | **697** (221 files) | **18,873** (9,939 programs) |
| arena identity answers, name agrees | 530 | 14,060 |
| … and DISAGREES | **0** | **0** |
| arena declines, name answers (**consequential**) | **64** | **1,092** |
| … answering rung = `structIndexByName` (nominal) | 48 | 468 |
| … answering rung = `repRowOfName` (canon key) | 16 | 624 |
| … answering rung = the TIGHTENED fieldset scan | **0** | **0** |
| … `repRowOfTyStruct` off the RECORDED type reproduces it | 38 eq / 26 decline / **0 wrong** | 1,052 eq / 40 decline / **0 wrong** |
| … the LENIENT (untightened) scan reproduces it | 22 eq / 24 decline / **18 WRONG** | 908 eq / 36 decline / **148 WRONG** |
| both legs decline (answer unchanged at -1) | 103 | 3,721 |

So the shipped ladder is **arena identity → NOMINAL identity → the canon-key row off the
recorded type**, and the whole `structIdxOfElemName` call — with `repRowOfName`'s
`resolveAnnot` and `structIndexOfTypeName`'s `shapeFieldParse` inside it — is **deleted from
this path**. Candidate answers vs today's answer: **697/697 and 18,873/18,873 equal, 0
disagreements**, in both rung orders tested.

Three things this measurement decided that reading the code would not have:

- **The `| null` peel stays.** The no-peel variant is equal on the whole corpus and
  declines **4** calls in **2** fuzz programs. A parse kept because a witness says so.
- **The lenient field-name-set scan is not admissible here.** #1114 shipped it inside
  `rlSlotOfTyTwin` because `repStructSlotsTwin` re-gates a lenient match; this row is a
  store/push struct index, and the same scan is WRONG on 18 corpus + 148 fuzz calls. Method
  note 27's asymmetry, run backwards: a site whose answer IS byte-observable cannot take a
  rung whose errors a twin guard would have absorbed.
- **`rlElemLitStructRow` must NOT get the new rung.** Its comment always claimed that
  ("widening the name leg would change which arm answers"); measured, the canon-key rung —
  in either order — changes **7** corpus calls and **311** fuzz programs, every one a
  both-decline today, i.e. exactly the -1 the concrete-VARIANT route depends on.

### D-UARMSLOT — the four union ref-array ARM scanners, and D-UNION's standing refutation answered

Four scanners (`unionHasRefArrayArmSlot`, `unionRefArrayArmSlotForElemAtom`,
`unionRefArrayArmSlotForMapElem`, `unionNestedArrayArmSlot`) each walked
`splitUnionAtoms(name)` and ran the same per-atom step:

```
a != "null" && valueAtomKind(a) < 0 && nameIsRefArray(a)  →  rlSlotByName(refArrElemName(a))
```

Three of them carry a D-UNION comment saying the arena is **not** interchangeable here,
and that comment is right about the predicate it names: `unMemIsRefElemArray` is a SHAPE
test (a `TyArray` over a non-scalar) and `nameIsRefArray` folds INTERN STATE into its
answer, so substituting the shape test over-accepts an element the reflist layer never
named. The migration does not substitute it. It asks the **intern-state question
directly** — *does the ref-list table hold a ROW for this member's element type* —
`unMemRefArrArmSlot(m) = rlSlotOfTy(tyRefArrElemOf(m))`, which is the same question
`rlSlotByName(refArrElemName(a))` asks, one vocabulary down. An element the layer never
named has no row and declines exactly as `rlSlotByName("")` does. This is D-ANNSLOT's
unlock (*ask for the ROW, not for the shape*) applied to union MEMBERS.

| per-member, name step vs arena composite | corpus | fuzz |
|---|---|---|
| comparisons (U1 / U2 / U3 / U4) | 63 / 113 / 5,542 / 9 | 796 / 1,473 / 308,130 / 68 |
| **disagreements** | **0** | **0** |
| arena answers where the name declines (the refuted over-accept) | **0** | **0** |
| name answers where the arena declines | **0** | **0** |
| member columns UNCOVERED at a reach | **0** | **0** |

**Why the arena leg is total here (mechanism, not a 0).** Coverage is `unionMemberTysOf`,
which needs a registered row with every member type recorded. All four scanners are reached
only from `emitUnionCoerce`'s box-building path, where `unionName` is the coercion TARGET
union — the same population D-UHATOTAL closed for `unionHasAtomTy` (union rows are minted
atomically with their member arena columns at exactly three sites; a box exists only
because that registration happened), and the same `unionName` reaches `unionHasAtomTy`
in the same lowering, which now `emitFail`s loudly for an unregistered row (on the
literal-arm path that call is AHEAD of the arm scanner; on the carrier path it is
below it, so it is corroboration, not a precondition). A
scanner that nevertheless declined would answer "no arm", which at all four sites degrades
into an existing LOUD reject, never a silent mis-tag — the failure direction that made this
deletion cheaper to justify than #1114's.

Two faithfulness guards the equality probe could not sample, both added deliberately:

- **`unionArmMemberTys` declines an ALIAS spelling.** `unionRowOf` matches `unNames`
  first, so `unionMemberTysOf("N")` would EXPAND an alias into its members — where the
  name loops split `"N"` into one atom that no arm test accepts. Declining reproduces the
  old answer. (Measured: no alias ever reaches these sites — the probe's coverage tag
  required `mems.length == atoms.length` and never once failed.)
- **`unionHasRefArrayArmSlot` returns false for `slot < 0`.** The old loop could match a
  carrier slot of -1 against an arm whose element named no row (`-1 == -1`) — the very
  mis-tag its D-UNION comment warns about. Inert in practice: the only caller floors its
  slot at 0 (`refListSlotOfExpr`).

`unionRefArrayArmSlotForElemAtom` still reads a member-set SPELLING for its element-atom
test, and now reads the ARM ROW's stored one; `rlElemName[slot] == refArrElemName(a)` at
**31** corpus and **151** fuzz calls, 0 disagreements. `unionRefArrayArmSlotForMapElem`'s
`mvSlotOfMapValNameOrMono(mapValNameOf(en))` became the ref-list layer's own chokepoint
`rlElemMapValMvSlot(slot)` — a dedup, since that chokepoint's name fall-through IS the
expression it replaced, tri-state discipline included.

### Entombment (method note 21) — four sabotages, all with power

Both pieces are behaviour-preserving refactors, so neither can have a fails-on-master test.
The evidence is equivalence plus sabotages that leave the equivalence class:

| sabotage | corpus byte | msg files | run-tree lines | files that stop emitting |
|---|---|---|---|---|
| `rlElemStructRow`'s whole fall-through forced to -1 | **19** | 17 | **86** | 1 |
| ONLY the new canon-key rung forced to -1 (nominal rung intact) | **8** | 8 | **39** | 0 |
| `unMemRefArrArmSlot` forced to -1 | **7** | 30 | **204** | 23 |
| `unMemRefArrArmSlot` returns a same-KIND twin row (still an interned slot) | **3** | 5 | **52** | 3 |

The second row is the one that matters most: it says the rung this slice ADDED is
load-bearing on its own, so "the arena canon key reproduces `repRowOfName`" is not an
untested claim riding a byte-identical A/B. Unlike #1114's D-TWINROW, no piece of this
slice is invisible to every output channel.

Corpus witnesses per migrated arm site (from the probe's per-file hits): U1 19 files
(e.g. `closures/closure-array-union-arm-field-call.vl`), U2 10, U3 8, U4 4
(`unions/nested-array-union-arm.vl`, `unions/nested-box-array-arm-element-union.vl`,
`maps/nested-map-array-union-arm-read.vl`,
`closures/nested-closure-array-union-arm-call.vl`).

### The call arithmetic (non-comment call sites, the five owned files)

| resolver | master | now | delta |
|---|---|---|---|
| `refArrElemName` | 39 | 34 | **−5** |
| `nameIsRefArray` | 28 | 24 | **−4** |
| `rlSlotByName` | 22 | 18 | **−4** |
| `splitUnionAtoms` | 34 | 30 | **−4** |
| `valueAtomKind` | 36 | 32 | **−4** |
| `mapValNameOf` | 32 | 31 | **−1** |
| `mvSlotOfMapValNameOrMono` | 16 | 15 | **−1** |
| `nameIsMap` / `nameIsMapMemberUnion` | 27 / 18 | 26 / 17 | **−1 / −1** |
| `structIdxOfElemName` | 3 | 2 | **−1** |
| `nullablePartOf` | 56 | 57 | **+1** |
| `unionMemberSetOf` | 23 | 24 | **+1** |

**NET −24 call sites.** Reported honestly by class:

- **Type-string PARSES deleted: 17** — `refArrElemName` ×5, `nameIsRefArray` ×4,
  `splitUnionAtoms` ×4, `mapValNameOf` ×1, `nameIsMap` ×1, `nameIsMapMemberUnion` ×1, and
  the `nullablePartOf` inside the deleted `structIdxOfElemName` call ×1.
- **Name-keyed RESOLVERS deleted: 6** — `rlSlotByName` ×4, `mvSlotOfMapValNameOrMono` ×1,
  `structIdxOfElemName` ×1 (the four-rung one).
- **Deleted from a PATH, not from the source: 2** — `repRowOfName`'s
  `renderFaithful` + `resolveAnnot`, and `structIndexOfTypeName`'s `shapeFieldParse` +
  tightened fieldset scan, both of which keep other callers.
- **Keyword-ladder sites deleted: 4** (`valueAtomKind`) — method note 18 says these score
  **0** as parses; counted separately, not in the parse total.
- **Parses ADDED: 0.** The two additions are the `| null` peel that moved from inside
  `structIdxOfElemName` to the call site (a wash) and one NOMINAL `unionMemberSetOf`
  alias guard.
- **Consumers migrated to a ladder with a live name fall-through: 0.** Both pieces are
  deletions on their paths.

### Gate

Corpus **byte-, message- AND run-identical**: 1,243 files, 1,056 emitting wasm — **0**
byte-diffs, **0** message-diff files, **0** run-tree diff lines, transcripts identical.
Fuzz A/B **100,800 programs/side**, 105,434 output files/side, whole `--out-dir` trees:
**0** diffs.

`refresh-compiler.sh` RC=0 (1,020,008 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1
baselined failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0
(stage3 == stage4, 1,020,008 bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno
task test` RC=0 (**1,956 passed, 0 failed**, 14 ignored — this worktree's number; the
brief quotes 1,962/8 for `/workspace` and the delta is still unexplained). Binary delta
vs master: **−18 bytes** (1,020,026 → 1,020,008).

### What did NOT move, and the blocking mechanism

- **`structIdxOfElemName` itself survives**, for its one remaining caller
  (`structIdxOfElemName(refListElemNameOfExpr(iterIx, fnIx))`). That caller consumes a
  name PRODUCER — the close-out list's terminal item — so it cannot take a recorded type
  until `refListElemNameOfExpr` does. Its rung 3 (the tightened fieldset scan) is
  therefore still live source; what this slice proves is that the scan answers **0** times
  on the ref-list ROW population.
- **`rlElemTyIx` coverage.** 24 corpus / 36 fuzz consequential calls have no recorded
  element type at all, and are answered by the NOMINAL rung. The mechanism is visible:
  `rlInternName` records `fieldElemTyIxOfName(stored)` — it RESOLVES the name it just
  stored instead of receiving a type from the producer. The uncovered population is
  EXACTLY the synthetic-`#anonN` population, and that is a CROSS-TAB, not two totals that
  happen to match: over the calls where the new ladder's rungs 2-3 answer, corpus is
  {uncovered ∧ `#`: **24**, uncovered ∧ not-`#`: **0**, covered ∧ `#`: **0**, covered ∧
  plain: 40} and fuzz is {**36**, **0**, **0**, 1,056}. Uncovered ⟺ `#`-spelled, both
  directions, 102,043 programs. The fix is the bank-at-the-producer play (`rlInternName(name, kind, tyIx)`),
  and it is what would let the nominal rung retire too. Not attempted here: 5 of the 9
  intern call sites are in `emit_collect.vl` (concurrently owned).
- **`rlElemLitStructRow`** stays nominal-only, on the 7/311 measurement above.
- **`unionRefArrayArmSlotForElemAtom`'s element-union atom test** still compares rendered
  atom spellings (`eAtoms[j] == elemAtom`). `elemAtom` is produced by `emitUnionCoerce`'s
  literal probe as a keyword or a variant name, so it is a name-identity compare, not a
  parse — but the SET it is compared against is still reached through a member-set
  spelling.

### Hand-offs

- **`emit_collect.vl` / whoever owns the intern sites**: `rlInternName` should take the
  element's arena type from its callers rather than re-resolving the stored spelling.
  Nine call sites (`emit_collect.vl` ×5, `emit_classify.vl` ×4 — `mvRlSlot` ×3 and
  `ensureRefElem`); each already holds either a node type or a struct/variant row. That
  single change is what makes `rlElemStructRow`'s nominal rung retirable, and it also
  feeds every other `rlElemTyIxAt` consumer.
- **The other three `unMemRefArrArmSlot` shapes**: `unionHasClosureArrayArm`,
  `unionHasMapArrayArm` and `unionArmPathIsCloArray` run the same atom loop over a
  member set; the first two already have `unMem*` shape predicates and need only the
  ROW composite plus the same reach/agreement/decline probe triple.

### Method notes earned

30. **A "what did NOT move" entry outlives the work that moved it** (this slice) — the
    eleven-leg `nameIsRefArray` family was carried forward as the top target through two
    briefs after D-ANNSLOT deleted every one of the eleven. Sections that record a
    BLOCKER are written once and never re-checked, unlike the sections that record work.
    Re-derive a target from the tree before spending a slice on it; the cheapest possible
    check (grep the named functions for the named fall-through) refutes it in a minute.
31. **A candidate rung must be measured at the SITE that will consume it, not at the
    layer** (D-ELEMROW) — the untightened field-name-set scan is correct inside
    `rlSlotOfTyTwin` (#1114) and WRONG at `rlElemStructRow` (18 corpus + 148 fuzz calls),
    because the first re-gates a lenient match through `repStructSlotsTwin` and the second
    returns the row straight to a `struct.new`. A rung's admissibility is a property of
    the consumer's error tolerance, not of the rung.
32. **Ask for the ROW, not for the shape** (D-UARMSLOT) — D-UNION refuted the structural
    predicate `unMemIsRefElemArray` as a substitute for `nameIsRefArray` and three
    comments recorded the site as unmigratable. The refutation is sound and the conclusion
    was too broad: `nameIsRefArray`'s extra content is INTERN STATE, so the faithful dual
    is not a shape test but the intern-state lookup `rlSlotOfTy(tyRefArrElemOf(m))` — 0
    disagreements in 316,194 member comparisons (5,727 corpus + 310,467 fuzz) where the
    shape test disagreed twice in 50,400 programs. When a name predicate folds in intern state, the arena dual is a
    TABLE lookup keyed by the arena, not a structural classifier.

## D-PARSETY — the parser stops throwing the type's STRUCTURE away (phase 0, #1117)

Every sidecar this program has shipped — `sTyIx`, `annRlSlot`, `unMemTys`, `annUnionAtoms`,
`inferRetAtomCount` — reconstructs structure the PARSER already had. `parseTypeName`
(`compiler/parser.vl`) is a recursive-descent parser that returns a string built by
concatenation (`inner + "," + parseTypeName()`, `name + "<" + parseTypeName()`, `name + "[]"`),
and `nameToTy` (`typecheck.vl:4811`) is a second recursive-descent parser that takes the same
string back apart. This slice makes the first one KEEP what it parsed. It consumes nothing.

### The framing, checked — and where it does NOT hold

**Verified at the mechanism, with two reproductions.** The parser's structural decisions are
not merely discarded, they are re-decided DIFFERENTLY downstream, and both divergences are
reachable from source today:

1. **`(i32) => i32 | null`.** The parser read the arrow's return as a single ATOM and let the
   caller's union loop close over the result — `((i32)=>i32) | null`, a nullable function, as
   its own comment claimed. `nameToTy` takes a top-level `=>` as binding LOOSER than `|`
   (`isTopLevelFuncTypeName` guards the union split), so the same characters denote
   `(i32) => (i32|null)`. `const g: (i32) => i32 | null = id; const r = g(1); print(r + 1)`
   errors with `operator '+' is not defined for i32? and i32` — the checker's grouping wins,
   because the parser's was thrown away.
2. **`Box<i32 | null>`.** `nameHasSep` tracks `{`/`[`/`(` depth and NOT `<`/`>`, so the
   union split shreds a generic application: `type Box<T> = { v: T }` + `const b: Box<i32 | null>`
   is rejected with **`unknown type 'Box<i32|null>'`**. The parser had the argument list's
   boundaries exactly.

**NOT verified as an account of the program's 607 parse calls.** A local-aware provenance scan
of all 557 non-comment call sites of the SCORECARD parser list, classifying each argument
within its enclosing function:

| provenance of the parsed string | sites | share |
|---|---|---|
| the enclosing function's own `name: string` PARAMETER (provenance is the caller's) | 136 | 24.4% |
| a local this single-function scan could not attribute | 123 | 22.1% |
| DERIVED — a peel/slice/join, or another parser's output | 110 | 19.7% |
| an expression this scan could not attribute | 96 | 17.2% |
| **`TypeRef.tyName` — the PARSER's own synthetic name** | **71** | **12.7%** |
| a stored emitter name COLUMN (`rlElemName`, `mvValName`, …) | 18 | 3.2% |
| a RENDERER's output (`tyToEmitName` / `tyToStr` / `tyToNominalName`) | 3 | 0.5% |

So "the strings originate at the parser, which is why the terminal condition cannot be reached
by migrating consumers one at a time" is **an over-claim as stated**. 71 sites are reachable
from a parser-side spelling; 21 provably are not; 465 need an interprocedural trace this scan
does not do. The doc's own SCORECARD CORRECTION points the other way — five of the six
producers it names to work backwards from (`tyToEmitName`, `sNames[]`, `rlElemName[]`,
`mvValName[]`, `sFieldElemName[]`) are RENDERERS, not the parser. The honest statement is that
the parser is **one** of at least two sources, it is the one no slice had touched, and the
loop `arena → tyToEmitName → parse` is a separate arc that a parser-side tree does not reach.

### What the parser now records

A flat SPELLING arena in `compiler/ast.vl`, built as `parseTypeName` recurses — four parallel
columns (`tsKind`, `tsText`, `tsKidStart`, `tsKidCount`) plus a flat `tsKids` child column, and
15 node kinds (`TS_NAME`, `TS_APP`, `TS_ARR`, `TS_UNION`, `TS_ISECT`, `TS_NEG`, `TS_PAREN`,
`TS_FUNC`, `TS_MAP`, `TS_OBJ`, `TS_FIELD`, `TS_LITSTR`, `TS_LITNUM`, `TS_NULL`, `TS_ERR`).

**It is a SPELLING tree, not a type, and that is forced.** `Box<i32>` is recorded as an
APPLICATION of the identifier `Box`, because resolving it needs `cUserTypes` and the live `<T>`
bindings — a type may be declared after its use or in another module, so no `Ty` arena index
can exist at parse time. The parser records what it SAW; interning stays the checker's.

Children ride a shared STACK, not a per-node array: each producer pushes its finished node and
`tsMk` moves the region above a caller-taken mark into `tsKids`. Depth-first parsing makes that
region contiguous and exclusively the caller's, so a spelling node costs four column pushes and
**no per-annotation allocation**. The error arm pushes `TS_ERR`, so every producer leaves
exactly one root and the discipline is total on malformed input (190 of the 1,274 corpus files
do not build).

### The sidecar shape — measured, not assumed (method note 24)

The first shipped shape was `declNameTok`'s: an `i32` column parallel to `P.nodes`, grown
lazily to the last annotation's node index. Measured with the probe, that column reaches
**2,176,954 entries over the corpus** and **225,619 on the compiler's own self-compile** —
against **5,398 annotations** in that compile. One `i32` per AST NODE, **37.7x** the storage
of the information it holds.

Shipped instead: two PUSHED columns, `annTsNode` (the `TypeRef` node index) and `annTsRoot`
(its spelling root) — **57,815 rows over the corpus**, exactly the annotation count.
`annTsNode` is strictly increasing by construction (a row is pushed immediately after the
`mkTypeRef` it describes; the node arena only appends), so `annTsOf` is a binary search, not a
scan. Every other probe number is identical between the two shapes.

### Prove the structure is right — the probe

Two comparisons, both reported as a checker diagnostic at the end of `checkProgram` (method
note 17: a probe reporting at end-of-EMIT cannot see a program that never gets there; the 75
of 1,274 corpus files that do not report here are LEX/PARSE rejects, which never reach
`checkProgram` at all):

- **RT** — round-trip: does `tsToName(root)` reproduce the string the parser built? Swept over
  every `TypeRef` in the arena, BEFORE `canonEmitTypeNames` rewrites the names (note 22).
- **RES** — resolution: `tsToTy(root)` (a structural dual of `nameToTy`, arm for arm) against
  the answer the checker actually used. Hooked at BOTH positioned funnels — `nameToTyAt` and
  the three `nameToTy` legs plus the memo inside `resolveAnnot` — so the live `<T>` environment
  is the same for both resolvers.

**`tyToStr` is not the comparator.** It renders `Nullable(TyFunc)` and `TyFunc(-> Nullable)`
to the same text, which is precisely the collision the arrow divergence lives in. The authority
is a structural `tyDeepEq` over the arena; the rendered comparison rides beside it as the
rejected candidate (method note 23).

| tag | corpus (1,274 files, 1,199 checked) | fuzz (50,400) |
|---|---|---|
| `rows` — annotations recorded | **57,815** | **103,402** |
| `nots` — a `TypeRef` with NO spelling | **0** | **0** |
| `rtdis` — round-trip disagreement | **0** | **0** |
| `rtmang` — round-trip vs a MERGE-renamed name | 2,908 | 0 |
| `res` — resolution comparisons | **138,955** | **180,990** |
| `resmang` — of those, on a merge-renamed name | 6,580 | 0 |
| `bothneg` — both resolvers declined | 10 | 0 |
| `oneneg` — exactly one declined (non-mangled) | **0** | **0** |
| `dis` — STRUCTURAL disagreement, before the fix below | **451** (87 files) | **5,081** |
| `disstr` — the same rows under a RENDERED comparison | **0** | **0** |
| `dis` — as shipped | **0** | **0** |
| `app` — generic applications interned by the probe | 32 | 0 |

### The disagreements, classified — and the one the parser could prevent

Every one of the 451 corpus rows and 5,081 fuzz rows was the SAME class: **the arrow/pipe
precedence divergence**. Not a checker transformation to leave alone, and not a structural loss
the checker inflicted — **the parser's own tree was the wrong one**. `nameToTy`'s grouping is
the language's (and TypeScript's): the return extends as far right as it can.

Shipped fix, one token: `parseTypeAtom`'s arrow arm parses its return with `parseTypeName()`
instead of `parseTypeAtom()`. **The emitted NAME is identical either way** — the same
characters are concatenated in the same order, `"(i32)=>" + "i32|null"` vs
`"(i32)=>i32" + "|" + "null"` — which is why the corpus stays byte-identical and why the bug
could sit there. It changes token consumption only where `parseTypeAtom` is called DIRECTLY:
`parseAsType` (`x as (i32) => i32 | y`) and the `type AB = {…} & …` operand chain. Both are
already type errors for a function-typed operand, and both are 0 across corpus and fuzz.

The other two classes are accounted, not fixed:

- **`rtmang` / `resmang` (2,908 / 6,580 rows, corpus only)** — the module MERGE rewrites every
  `TypeRef.tyName` IN PLACE (`driver.vl:2380`, `t.tyName = modTypeRenamed(t.tyName)`:
  `Point` -> `Point$m1`), so after it the spelling tree describes the PRE-merge name. This is
  method note 22 with a second instance: the string is rewritten between producer and consumer,
  by a pass the note did not know about. It is also a **type-string parser the SCORECARD does
  not count** — `modTypeRenamed` is a hand-rolled identifier-segment scanner over a rendered
  type name.
- **`bothneg` (10)** — both resolvers decline. Vacuous agreement, counted apart from the 132,365
  rows where both answered.

### Comparator sanity, at intended volume, against deliberately WRONG builds

| build | `rtdis` | `dis` | `disstr` |
|---|---|---|---|
| shipped | **0** | **0** | **0** |
| RT wire forced | **54,686** (= 57,815 rows − 2,908 mangled − 221 names of length <= 2) | 0 | 0 |
| RES wire forced | 0 | **132,249** (= the 132,365 both-answered rows − 116 renders of length <= 2) | 0 |
| VALUE: the parser stops recording the `[]` suffix | **14,224** | **31,250** | **31,250** |

The value sabotage is the load-bearing one: it perturbs the recorded STRUCTURE, not the
comparison, and both channels light at five figures. (It is also visible to the rendered
comparison — unlike the arrow class, which is why that class survived.)

### Sidecar lifetime — and a THIRD shared-instance channel

With zero consumers the reset cannot be load-bearing, and it is not: a build with all seven
`tsReset()` calls DELETED is clean on `SELFHOST_NATIVE_ALIGN=1 deno task test` (**1,962
passed, 0 failed**), the shared-INSTANCE gate. Stated plainly rather than dressed up.

What the shape buys is that the reset becomes load-bearing the moment anything reads it. The
guardless PROBE build — where the probe IS the consumer — is wrong from the SECOND program of a
shared instance and then dies:

```
guarded    rows=10 nots=0 rtdis=0 | rows=15 nots=0 rtdis=0 | rows=19 nots=0 rtdis=0 …
guardless  rows=10 nots=0 rtdis=0 | rows=11 nots=4 rtdis=1 | rows=13 nots=6 rtdis=2 …
                                          ^ stale rows in front of the current program's
… and over the whole tests/cases tree: wasm trap: out of bounds array access
```

**`vl check <dir>` is a shared-INSTANCE channel** — one `Store`, one instance, a command loop
over every file (`main.rs`'s `CMD_LIST_DIR`/`CMD_READ_FILE` loop) — and it costs seconds, not
the whole suite. Method note 16 established that `vl run --batch` is NOT one; this is the cheap
one that is.

### Allocation cost, measured

Over the whole 1,274-file corpus: **119,105** spelling nodes (4 column pushes each), **26,585**
child slots, **57,815** annotation rows (2 columns). On the largest single compile (the
compiler itself, 226,408 AST nodes): **9,996** spelling nodes, **1,436** child slots, **5,398**
annotation rows — the spelling arena is 4.4% of the node arena, and nothing is allocated per
annotation (the child stack is reused). The rejected node-parallel shape cost 225,619 `i32` on
that same compile.

Binary: **1,020,026 -> 1,022,333 bytes (+2,307)**.

### The call arithmetic

**0 parses added · 0 parses deleted · 0 consumers laddered · NET 0.** By construction: this
slice consumes nothing. Local-aware scan by resolver called, over every file this slice touches
plus the three the partition owns:

| file | master (40455c4) | now |
|---|---|---|
| `compiler/ast.vl` | 0 | 0 |
| `compiler/parser.vl` | 0 | 0 |
| `compiler/driver.vl` | 0 | 0 |
| `compiler/typecheck.vl` | 20 | 20 (untouched) |
| `compiler/emit_collect.vl` | 89 | 89 (untouched) |
| `compiler/emit_base.vl` | 63 | 63 (untouched) |

(The `emit_collect` / `emit_base` numbers are 89/63 against #1115's 85/65 because this scan's
parser list adds `refArrElemKind` / `nameIsI32ListArray` / `nameIsMapArray` /
`nullClosureArrElem`. Before == after either way.)

### Entombment (method note 21)

Phase 0 consumes nothing, so it is byte-identical BY CONSTRUCTION and no test can fail on
master and pass here. The arrow-grouping fix is byte-identical for a sharper reason — the
string it produces is character-identical — so the corpus channel carries nothing for it
either. What carries this slice:

- the probe's exact equality at **57,815 + 103,402** round-trip rows and **138,955 + 180,990**
  resolution comparisons, both channels perturbation-verified at full reach;
- the sabotage table above, at five figures on both channels.

**No pin ships, and the reason is that nothing observable moved.** Both reproductions behave
exactly as they did on master — `Box<i32|null>` is still rejected with `unknown type`, and
`(i32) => i32 | null` still means "returns `i32?`" — so a fixture for either would be a pin on
MASTER's behaviour, not on this slice's. They are written down here as witnesses of the
mechanism and as the P1/P3 targets, which is what they are (note 19: say when a pin would be
inert instead of shipping one).

### Gate

Corpus **byte-, message- AND run-identical** (1,274 files: `tests/cases` + a pinned snapshot of
master's `compiler/` + `std/` + `scripts/*.vl`; **1,084** emit bytes, **1,012** `@run` cases;
compiler stdout/stderr with the out-path normalised): **0** byte-diffs, **0** message-diff
files, **0** run-diffs. Fuzz A/B **50,400 programs/side**, whole `--out-dir` TREES (`diff -r`,
**52,830** output files/side): **0** differing paths — 2 paths differ only in the COMPILER's own
`<wasm function N>` indices inside an identical pre-existing trap backtrace, which shift by
exactly the 7 functions this slice adds (#1113's harness correction, second instance). The same
fuzz harness reports **98,370** differing paths against the probe seed.

`refresh-compiler.sh` RC=0 (1,022,333 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined
failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4,
1,022,333 bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0
(**1,962 passed, 0 failed, 8 ignored**).

### What did NOT get recorded, and why

- **`is` / `as` / `UnionDecl` member spellings.** `parseIsType`, `parseAsType`,
  `parseVariantName`, `parseVariantAtom` build a string that lands on an `IsExpr` / `CastExpr` /
  `UnionDecl` as a `string` field — there is no annotation NODE to key a root to. Their trees
  are built and dropped (the child stack stays balanced; the nodes stay unreferenced in the
  arena). Each needs its own node-keyed column, which is phase 2.
- **Emitter-SYNTHESIZED annotations** (`synthTypeRef`, `emit_classify.vl:8225`) are minted from
  a name the emitter computed and never passed through the parser. `annTsOf` answers -1 for
  them by construction; at CHECK time there are none (`nots = 0` on both surfaces).

### The phased plan, and the first consumer named

- **P1 — `modTypeRenamed` (driver.vl:2310) reads the tree.** The module merge's rename is a
  hand-rolled identifier-segment scanner over a rendered type name; with the tree it is
  `tsText[node] = renamed` on the `TS_NAME`/`TS_APP` nodes plus one render. It deletes a
  type-string parser the scorecard never counted AND retires this slice's own 2,908-row
  staleness, which every later phase would otherwise inherit. **Blocker: none measured.** It
  needs `tsToName`, which the probe has already run over 161,217 rows.
- **P2 — record the string-only spellings** (`is` / `as` / `UnionDecl`). Blocker: three new
  node-keyed columns; no structural obstacle.
- **P3 — `nameToTy` resolves from the tree** at the positioned entry points, with the string
  route as the fall-through. The dual already exists and agrees on 132,365 corpus and 180,990
  fuzz resolutions. **Blocker: the emitter's re-resolutions**, which call `nameToTy` on names
  with no spelling (`synthTypeRef`, computed names) — so this is a laddered migration, not a
  deletion, until `nodeTyIx` coverage (the C1 endgame) closes.
- **P4 — the canon pass rewrites the tree**, and #1115's eight "this pass IS the last producer"
  parses in `canonEmitName` / `nulLitUnionPreserve` become tree walks. Blocker: its OUTPUT is
  the string the whole emitter reads, so the tree and the string must be rewritten in lockstep
  (note 22 again).
- **P5 is a DIFFERENT arc.** The renderer loop (`tyToEmitName` -> a name column -> a parse) is
  not reachable from a parser-side tree, and the provenance table above says it is the larger
  share. Two sources, two arcs.

### Method notes earned

30. **A structure the parser records can be WRONG, and only recording it can show that**
    (D-PARSETY) — the phase-0 discipline is "dual-write, consume nothing, prove equivalence",
    and the equivalence probe found 451 corpus rows where the parser's tree and the checker's
    resolution are different TYPES from the same characters. The brief expected the
    disagreements to be either a loss the parser prevents or a transformation to leave alone;
    the actual class was neither — the parser's grouping of `=>` against `|` contradicted its
    own comment and the language. A dual-write phase is not bookkeeping; it is the first time
    the producer's answer is checkable at all.
31. **A RENDERED comparison cannot see a regrouping** (D-PARSETY) — `tyToStr` prints
    `Nullable(TyFunc(i32 -> i32))` and `TyFunc(i32 -> Nullable(i32))` as the same text
    `(i32) -> i32?`, so the rendered comparison read **0** on all 451 corpus and 5,081 fuzz
    disagreements the structural comparator found. Method note 8's sabotage lesson has a
    measurement twin: when the thing under test is a type's SHAPE, the comparator must walk the
    arena. This program's own founding rule — never decide from a rendering — applies to its
    probes.
32. **`vl check <dir>` is a shared-INSTANCE channel** (D-PARSETY) — one `Store`, one instance,
    a host command loop over every file. Note 16 ruled out `vl run --batch` and left
    `SELFHOST_NATIVE_ALIGN=1 deno task test` as the only sidecar-lifetime gate; this one costs
    seconds, reports per program, and caught the guardless build's staleness on the SECOND
    program and its trap on the tree.
