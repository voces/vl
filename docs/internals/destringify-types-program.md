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

## D-GENBRACKET + D-PARSETY P1 — the generic-application BRACKETS, and the merge rewrites the TREE (#1118)

Two things, in that order of importance. The first is a user-visible bug #1117 surfaced and
this slice fixes; the second is D-PARSETY's phase 1, whose first consumer #1117 named.

### The bug, reproduced and diagnosed at the mechanism

```vl
type Box<T> = { v: T }
const b: Box<i32 | null> = { v: 3 }
print(b.v)
```
→ `unknown type 'Box<i32|null>'`. `Box<i32>` works. A **union argument to a generic breaks
the annotation.**

Verified cause, at the code: `nameHasSep` (`typecheck.vl`) tracks `{`/`[`/`(` depth and NOT
`<`/`>`, so `nameHasPipe("Box<i32|null>")` is true, `splitTypeName` cuts the name into the
garbage atoms `Box<i32` and `null>`, the first resolves to -1, and `nameToTy` returns -1
before the generic-application arm 200 lines below ever runs. The parser had the argument
list's boundaries exactly (`parseTypeAtom`'s `expectTypeGt`) and threw them away.

**It is not one scanner.** Nine more in the two owned emit files and eight more in
`typecheck.vl` carry the identical defect, each reachable from a different source shape —
enumerated in the pin table below. Fixing only `nameHasSep` moved the failure from the
checker to the emitter (`ref valtype with no interned shape`, on `Pair<(i32)=>i32,i32>`),
which is how the emit-side siblings were found: by building the checker-only fix and
re-running the battery, not by reading.

**A second witness, worse than a rejection.** `const m: {[string]: Box<i32 | null>} = Map()`
is accepted by master's `vl check` with **no diagnostic at all** — `nameToTy`'s map arm does
not guard its VALUE against -1, so the hole is interned as the map's value type — and then
`vl build` **traps the compiler**: `wasm trap: out of bounds array access` (a `T.tys[-1]`).
With the fix it is a clean `emitProgram: unsupported map value type`. It ships no pin: the
program still does not lower (a generic-alias struct as a map value is unsupported with or
without a union argument — `Box<i32>` fails identically on master), so a fixture would pin an
emit gap, not this fix.

### Where `<`/`>` is a bracket — the rule, and the MEASUREMENT that refuted the first one

The first shipped rule was "`<` opens, `>` closes unless it is the arrow's tail (`=>`)",
justified from the producers: the only `<` any of these scanners can see comes from
`parseTypeAtom`'s application arm, whose own comment records that "in TYPE position the `<` is
unambiguous (no comparison can appear here)" — a type name never contains an expression, so
the RELATIONAL `<`/`>` cannot reach them.

That justification is sound for `<` and **wrong for `>`**. An audit probe — a counter hooked
into all eleven repaired `typecheck.vl` scanners, re-walking each input with the proposed
depth rule and reporting as a checker diagnostic — over the 1,274-file corpus:

| build | scanner calls | inputs with `<`/`>` | `<` | bare `>` | depth NEGATIVE | depth ends != 0 |
|---|---|---|---|---|---|---|
| `=`-exemption only (first rule) | 3,180,609 | 890 | 657 | **927** | **263** | **263** |
| `angOpen`-gated (shipped) | 3,180,601 | 627 | **657** | **657** | **0** | **0** |

The 263 came with their strings attached (the probe banks the first offender). Two other
string languages ride these same scanners and both spell a `>` that closes nothing:

- **`tyToStr`'s diagnostic render spells the arrow `->`** — `()->f64`, `{f: () -> i64 | f64}`,
  `(i32,i32,i32)->string`. Not a parser-built name at all.
- **the `$fnsig` closure-signature KEY** spells its param/return split with a bare `>` —
  `"=>ii>i"` (`emit_base.annArrowAt`, `emit_mono`).

So the shipped predicate gates on an OPEN `<`:

```vl
export function tyGtIsClose(name: string, i: i32, angOpen: i32) {
  if angOpen <= 0 { return false }        // no `<` open — this `>` closes nothing
  if i > 0 { return name[i - 1] != '=' }  // the arrow's tail, inside a generic argument
  true
}
```

Each repaired loop carries its own `angOpen` counter beside its existing depth. The `=`
exemption survives INSIDE the gate for the one case where both hold: an arrow nested in a
generic argument, `Box<(i32)=>i32>`.

**The gate is load-bearing, and the corpus cannot see it.** A build with `angOpen <= -999`
(the refuted rule, everything else identical) is corpus byte-, message- AND run-identical to
the shipped one on all 1,275 pre-existing files. On the FUZZ channel — 8,400 programs/side,
shipped vs sabotage — it produces **16 differing paths and 13 non-baselined INVALID-WASM
findings** that do not exist with the gate (`p1r {[string]: () => {[string]: (i32) => K0}} |
string`, `p2r () => {[string]: ((i32) => K0)[] | i32}`). Note 33's "byte-identity does not
confirm a derived value is correct" with a soundness consequence: the naive rule is a live
miscompile that the entire corpus is blind to.

### The scanners repaired, and the pin each one carries

Every pin FAILS on master (5eb115d) and passes here — this is a behaviour change, so note
21's byte-identity exemption does not apply.

| pin | shape | scanners it needs |
|---|---|---|
| `generics/type-arg-union.vl` | `Box<i32 \| null>`, `Box<i32 \| string>`, `Box<Box<i32 \| null>>` | `nameHasSep`, `splitTypeName` |
| `generics/type-arg-intersection.vl` | `Box<A & B>` | `nameHasSep('&')`, `splitTopAmp` |
| `generics/type-arg-closure.vl` | `Pair<(i32) => i32, string>` + the same as a RETURN | `splitGenArgs`, `topLevelArrowIndex`, **`emit_base.gaeSplitArgs`** |
| `generics/type-arg-inline-object-field.vl` | `{ v: Pair<i32, string> }` | `nameToTy`'s field + colon splitters |
| `generics/type-arg-list-element.vl` | `Pair<i32 \| null, string>[]` | the union split above the `[]` peel |
| `generics/type-arg-nullable.vl` | `Box<i32 \| null> \| null` | **`emit_base.nullablePartOf`** |
| `modules/field-name-shadows-type/` | P1 — see below | `driver.modRwType` |

Repaired but with **no pin that reaches them alone today** (coverage-only, stated per note
19): `splitUnionAtoms` / `unionMemberCount` / `nameIsFuncTypeAtom` / `parenEnclosesWhole` /
`canonShapeName` in `typecheck.vl`; `annArrowAt` / `annSplitParams` / `annSplitPipe` /
`nameIsStructWithUnionField` / `nameIsStructWithLitUnionField` in `emit_base.vl`; three field
scans in `emit_collect.vl`. They are on the same names by construction (the audit counts 657
`<` reaching the typecheck set over the corpus), and the sabotage above shows the family is
observable — but no single program in this slice's 18-shape battery pins one alone.

### The frontier this OPENS, reported rather than hidden

Programs master rejected at the annotation now reach the emitter, and three shapes land on
pre-existing coverage gaps. Each has a NON-generic control that fails identically on master,
so none is caused by this fix:

| shape | now | control (no generic) |
|---|---|---|
| `{[string]: Box<i32 \| null>}` | `unsupported map value type` (was a compiler TRAP) | `{[string]: Box<i32>}` — same error on master |
| `Box<i32 \| null> \| Tag` | `ref valtype with no interned shape` | `Box<i32> \| Tag` — same error on master |
| `type Holder = { h: Box<i32 \| string> }` | `only i32 / boolean / string / array struct fields` | `{ h: Box<i32> }` — same error on master |

One shape is NEW: the three pin shapes `{v: Pair<i32,string>}` + `Pair<i32|null,string>[]` +
`Box<i32|null>|null` in ONE program emit-fail with `field access receiver is not a struct`,
while their non-generic analogue compiles and runs. Any TWO of the three compose fine. That
is a rep-composition gap, not a scanner one — which is why the pins ship split.

### D-PARSETY P1 — `modRwType` reads the spelling tree

#1117 named the P1 consumer: the module merge rewrites `TypeRef.tyName` IN PLACE
(`driver.vl:2380`) through `modTypeRenamed`, a hand-rolled identifier-segment scanner over a
rendered type name that the SCORECARD never counted, and that leaves the parser's spelling
tree describing the PRE-merge name (#1117's 2,908 `rtmang` rows).

**The tree survives the rewrite.** Modules parse into the SHARED arena with no `tsReset`
between them (`modCompile` step 2), so `annTsNode`/`annTsRoot` cover every module and stay
strictly increasing. Shipped:

- `ast.tsToName(root)` — the tree's WRITE-BACK, arm for arm the concatenations of
  `parseTypeName` / `parseTypeIsect` / `parseTypeAtom`.
- `driver.modRwTsName(root)` — renames only genuine TYPE positions: a `TS_NAME`, a `TS_APP`'s
  HEAD, a `TS_MAP`'s key. Then `t.tyName = tsToName(root)`.

**P1 is not a refactor — it fixes a second user-visible bug, and the string scanner could not
have.** `modTypeRenamed` sees "an identifier run" and cannot tell a type reference from a
FIELD name. A module that declares `type v = i32` and also spells an annotation `{v: i32}`
had its FIELD renamed to `v$m1`, so the annotation described a struct with a field no literal
has:

```
cannot assign {v: i32} to 'h' of type {v: i32}
no field 'v' on {v: i32}
```

— two types that RENDER identically, because the diagnostic demangler strips the `$m1` the
field name grew. Note 31 again, in the user's face this time. The tree knows
`TS_FIELD.tsText` is a field name and `TS_LITSTR`/`TS_LITNUM` are lexemes, so none of them is
a rename candidate. Pin: `tests/cases/modules/field-name-shadows-type/`.

**The fall-through is measured DEAD.** `modRwType` keeps `modTypeRenamed` for a `TypeRef` with
no recorded spelling, so the pass is total. A sabotage build that prefixes `@@POISON@@` onto
every fall-through result is corpus byte-, message- and run-identical to the shipped build
(1,282 files, including the compiler's own 16-module build): **every `TypeRef` at merge time
has a recorded spelling, 0 fall-throughs taken.** Not a totality proof — a measurement on this
corpus.

`modTypeRenamed` itself STAYS, for the four string-only spellings P2 has not recorded yet
(`tdName`, `udName`, `udVariants`, `isVariant`).

### The call arithmetic

**0 parses added · 0 parses deleted · 1 consumer laddered · NET 0.** Local-aware scan by
resolver called (the SCORECARD CORRECTION's parser list plus every type-name scanner this
slice touches — the same list on both sides; the absolutes are NOT comparable to #1117's,
which used a shorter list):

| file | master (5eb115d) | now |
|---|---|---|
| `compiler/ast.vl` | 0 | 0 |
| `compiler/parser.vl` | 0 | 0 |
| `compiler/driver.vl` | 5 | 5 |
| `compiler/typecheck.vl` | 85 | 85 |
| `compiler/emit_collect.vl` | 96 | 96 |
| `compiler/emit_base.vl` | 61 | 61 |
| **total** | **247** | **247** |

The `modTypeRenamed` site at `modRwType` is a LADDER, not a deletion — the call is still
there, behind an arena leg whose fall-through measured 0. Counted honestly as one consumer
migrated, zero parses removed. **21 scanners were REPAIRED**, which the scorecard has no
column for and which was the point of the slice.

### Gate

Corpus **byte-, message- AND run-diff**, 1,282 files (`tests/cases` + a pinned snapshot of
master's `compiler/` + `std/` + `scripts/*.vl`; **1,085 -> 1,092** emit bytes, **1,018**
`@run` cases): **7 byte-diffs, 7 message-diff files, 7 run-diffs — all 7 are the new pins**,
which master rejects and this build compiles. **0 diffs on all 1,275 pre-existing files.**

The shared-INSTANCE channel (note 32) agrees and classifies the message delta: `vl check
tests/cases` goes from `Found 217 errors` to `Found 204 errors`, the 13 removed errors are
exactly the pins' `unknown type` / `no field` rejections, and the 3 lines added are
`redundant type annotation` HINTS on the newly-compiling pin files. Every message change is a
fix; none is a regression. `vl check compiler` and `vl check std` are byte-identical.

Fuzz A/B **25,200 programs/side** (126 fixed seeds x 200, depths 4/5/6 cycled), whole
`--out-dir` TREES (`diff -r`, **1,439** output files/side, the harness's mktemp path
normalised): **0 differing paths**. The same harness reports **16** differing paths against
the `angOpen` sabotage at 8,400 programs/side — the comparator's power, at volume, against a
known-WRONG build.

`refresh-compiler.sh` RC=0 (1,025,610 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined
failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4,
1,025,610 bytes) · `lint-self.sh` RC=0 · `deno check compiler/*.ts` RC=0 · `deno lint` RC=0 ·
`SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0 (**1,969 passed, 0 failed, 8 ignored** — 1,962
+ the 7 new pins, measured in this worktree).

### What did NOT move, and the hand-off

**Nine `<>`-blind depth scanners remain in `emit_classify.vl`**, which a concurrent agent owns
this cycle — untouched by construction, listed here with the exact repair (`tyGtIsClose` is
exported and takes the caller's `angOpen`):

`nameIsWholeSpanShape` (7423) · `shapeFieldParse` (7521) · `splitUnionArmsAllDepth` (10400) ·
`funcTypeShapeLowerable` (10652) · `variantNestedShapeOk` (10736) ·
`internNonLowerableFieldShapes` (10858) · `internShapeFieldElems` (10915) ·
`internInlineShape` (10972) · `internShapeAs` (11154).

No program in this slice's 18-shape battery reaches one of them consequentially — the three
that still fail have non-generic controls failing identically on master. The place to look is
the frontier table above.

Also not moved: `canonShapeName`'s map-KEY scan terminates at the key's `]`, which precedes
any `<` in the VALUE, so it cannot see one — left alone deliberately, not overlooked.

### Method notes earned

33. **A depth rule justified from its PRODUCER can still be wrong at its CONSUMER**
    (D-GENBRACKET) — "`<` is only ever the generic bracket" is true of every producer, and the
    matching claim for `>` is false, because two OTHER string languages share the same
    scanners: `tyToStr`'s `->` render and the `$fnsig` key's `ii>i`. The producer argument
    licensed a rule the audit then refuted at **263 corpus inputs**, and the refuted rule is a
    live INVALID-WASM miscompile on the fuzz channel. The gate that makes it total
    (`angOpen > 0`) is not derivable from the producer at all — only from what the consumers
    actually receive.
34. **A pre-existing gap and a new one look identical; the CONTROL is what separates them**
    (D-GENBRACKET) — unblocking an annotation moves the failure downstream, and three of the
    freshly-reachable shapes fail at emit. Each was classified only by writing the same
    program with a non-generic type and running it on MASTER. Two of the three were
    pre-existing; the third (three shapes composed in one program) is genuinely new and is
    reported as such rather than folded into the fix.
## D-ARROWTY + D-ANNRLREC — the SECOND arc: the emitter renders a type and then takes the render apart (#1119)

#1117 refuted the framing that the parser is *the* source of the parsed strings: of 557
non-comment parse sites, only 71 (12.7%) take `TypeRef.tyName` within one function's reach,
and its own closing note named a **second arc** — `arena → tyToEmitName → parse` — as the
larger share and as unreachable from a parser-side tree. That arc lives in the emitter. This
slice maps it in the five emit files and kills the part it can prove.

### The enumeration, and the counting method

A **local-aware** scan over `emit_classify.vl` / `emit_rep.vl` / `emit_state.vl` /
`wasmEmit.vl` / `emit_rewrite.vl`: every non-comment call of the SCORECARD parser list
(plus `refArrElemKind` / `nameIsI32ListArray` / `nameIsMapArray` / `nullClosureArrElem`),
with the argument expression traced back through the enclosing function's `const`/`let`
bindings and params, and then **ONE HOP** into the callee for a call-shaped argument — the
step #1117's scan deliberately did not take, and the reason its renderer share reads 0.5%.
A function is classified RENDER if it (transitively, by name) reaches `tyToEmitName` /
`tyToStr` / `tyToNominalName` / `renderFaithful`; COLUMN if it indexes a stored emitter name
column; PARSERSTR if it reads `.tyName`.

**354 parse call sites** in the five files on master (emit_classify 331 · wasmEmit 12 ·
emit_rewrite 9 · emit_rep 2) — the same 354 on #1117's base and on #1118's, so the
arithmetic below is base-independent.

| provenance of the parsed string | sites |
|---|---|
| an expression this scan could not attribute | 152 |
| the enclosing function's own `string` parameter | 130 |
| **a stored emitter name COLUMN** (`rlElemName`, `mvValName`, `narrowVariants`, …) | **27** |
| **a RENDERER's output** (one hop) | **18** |
| a string literal | 11 |
| `TypeRef.tyName` | 10 |
| the `inferRetNameByNode` table (a STORED render) | 6 |

Hand-verified, the RENDER column resolves to exactly **TWO producers** — and one of them is
not a renderer the emitter calls at all, it is a renderer's output the CHECKER stored:

- **`nodeTyName(ix)`** — `tyToStr` / `tyToEmitName` of `nodeTyIxOf(ix)`. **6 producer calls**
  in these files, feeding **6 consumers**:

  | producer call | consumer | SCORECARD parses | name-keyed resolutions |
  |---|---|---|---|
  | `exprIsClosure` | `annArrowAt(tn) >= 0` | 1 | 0 |
  | `identFnTypeAnnName` (Call init) | `annArrowAt` | 1 | 0 |
  | `identFnTypeAnnName` (`??` init) | `annArrowAt` | 1 | 0 |
  | `synthParamAnnots` | `nullablePartOf`, `nameIsRefArray` ×2, `refArrElemName` | 4 | 3 (`resolveShapeToNominal` ×2, `rlSlotByName`) |
  | `structIndexOfExpr` (+ its `nodeTyCanonObjName` rung) | `structIndexOfTypeName` | 0 | 2 |
  | `structIndexOfObjCtxGo` (+ its canonical-render retry) | `structIndexOfTypeName` | 0 | 2 |
  | **total** | | **7** | **7** |

- **`inferRetNameByNode(nodeIx)`** — a STORED `tyToEmitName` render (`irRendered`,
  typecheck.vl:1103). ONE producer call, ONE consumer — `synthRetAnnots` — which takes the
  string apart at **19** sites (16 named classifiers, 2 `resolveShapeToNominal`, 2 inline
  `[`/`]`-suffix slices; 5 of the 19 are on the SCORECARD list).
- the remaining 12 RENDER rows are one-hop false positives of the transitive classifier
  (a callee that reaches a renderer on some *other* path); each was read and rejected.

So the second arc, in this partition, is **two producers, 7 consumers and 33 sites** — not a
diffuse condition. That is the finding the enumeration was for. (A first draft of this
section said "three producers and 31 sites", counting `structIndexOfExpr` as a producer when
it is a `nodeTyName` CONSUMER, and missing `structIndexOfObjCtxGo`'s two rungs entirely. The
correction is recorded rather than silently applied: the enumeration is the deliverable, so
its arithmetic has to be auditable.)

### D-ARROWTY — three consumers stop asking a render whether it has an arrow

`annArrowAt(nodeTyName(ix)) >= 0` asks "did the checker type this node as a FUNCTION". The
renderer had the type. The arena dual is `nodeTyIsFuncTy(ix)` = `T.tys[nodeTyIxOf(ix)] is
TyFunc`, and it is **exact by construction**, which the site comment records: `tyToStr`
spells a function with `->` and never `=>` and wraps an object in `{…}`; `tyToEmitName`'s
`TyArray` arm PARENTHESIZES a `TyFunc` element (`(()=>i32)[]`) precisely so the trailing
`[]` cannot bind into a closure result; `tyToEmitName`'s `TyFunc` arm always emits its `=>`
at depth 0. So for a NON-EMPTY render the two agree, always. The single residual is a
`TyFunc` whose render FAILS (`""`) — where the name test says no and the arena says yes —
and every call site already carried the `!= ""` guard that closes it, so the substitution is
byte-exact rather than merely measured.

Measured anyway, candidate beside authority in one sweep:

| site | corpus reaches | fuzz reaches | auth YES | cand YES | **disagreements** |
|---|---|---|---|---|---|
| `exprIsClosure` (chained value call) | 447 | 270 | 11 / 236 | 11 / 236 | **0 / 0** |
| `identFnTypeAnnName` (Call init) | 542 | 473 | 402 / 0 | 402 / 0 | **0 / 0** |
| `identFnTypeAnnName` (`??` init) | 454 | 9,660 | 439 / 9,593 | 439 / 9,593 | **0 / 0** |

**11,846 comparisons, 0 disagreements, in both directions** (of 1,274 corpus files, 1,058
reach `emitProgram` and report — the rest are lex/parse/check rejects that never get there;
of 50,400 fuzz programs, 50,047 report). The probe measurement was taken on #1117's base;
the sites and the arithmetic are unchanged on #1118's.

### D-ANNRLREC — `synthParamAnnots`'s ref-list ROW record is DEAD, and half of it provably

The block below `recordNodeTyFrom` re-derived, from the render, the ref-list row the
annotation node names:

```
const nnName = resolveShapeToNominal(tn)        // a SECOND call, byte-identical to line 610's
const nnNp = nullablePartOf(nnName)
if nnNp != "" && nameIsRefArray(nnNp) { nnBase = nnNp; nnNul = 1 }
if nameIsRefArray(nnBase) { recordAnnRlSlot(nn, rlSlotByName(refArrElemName(nnBase)), nnNul) }
```

`recordAnnRlSlot`'s two columns have exactly **one reader each**: `annRlNulAt` inside
`annTyNulFlag`, and `annRlSlotAt` inside `annRefArrSlot` — and both consult the node's
recorded arena type FIRST.

- **The nullable half is dead BY CONSTRUCTION.** The `recordNodeTyFrom(nn, ps[pi])` on the
  line above guarantees `nodeTyIxOf(nn) >= 0` (the arm is entered only when
  `tn = nodeTyName(ps[pi]) != ""`, which means the param HAS a recorded type), so
  `annTyNulFlag(nn)` returns from the arena and can never reach `annRlNulAt`.
- **The slot half is dead by measurement.** Over **15,760 reaches** (466 corpus + 15,294
  fuzz) the `nameIsRefArray` gate opened **2** times, both corpus; on both,
  `annRefArrSlot`'s own arena rung (`rlSlotOfTy(tyRefArrElemOf(...))` over the SAME type)
  already resolved the SAME row, and the name leg never once answered where the arena
  declined. Rows only ever append, so a row the arena resolves at synth time it still
  resolves at the consumer.
- The duplicated `resolveShapeToNominal(tn)` went with it: 0 divergence between the two
  calls over all 15,760 reaches (the function is pure — `structIndexOfTypeName` +
  `variantIndexOfTypeName` are lookups), so the deleted call was one whole
  `nameIsArray` + `nameIsWholeSpanShape` + `shapeFieldParse` + fieldset scan per reach.

### The REFUTED one: `structIndexOfExpr`'s render→fieldset rungs stay

`structIndexOfExpr`'s Call fallback renders the node type twice (`nodeTyCanonObjName`, then
`nodeTyName`) and feeds each to `structIndexOfTypeName` — the loudest render→parse in the
file. The obvious dual is `structIndexOfTy(nodeTyIxOf(exprIx))`. **It is not a dual**, and
only measuring showed it:

| at `structIndexOfExpr`'s node-type fallback | corpus | fuzz |
|---|---|---|
| reaches | 200 | 3,804 |
| the name ladder answers | 196 | 3,287 |
| `structIndexOfTy` answers | 17 | 265 |
| … and **DISAGREES** | 0 | **172** (3 programs) |
| `structIndexOfTy` DECLINES where the name answers | **179** | **3,023** |

The mechanism: `structIndexOfTy` scans the D0 `sTyIx` sidecar for arena-index **identity**,
and the `Ty` arena is not hash-consed — the checker's per-node type for `{a,f,z}` is a
different index from the one recorded when the struct ROW was minted, so identity declines
(92% of the time); and where identity does hit, it can hit a row the field-set scan would
not have picked, which is the 172. Witness: fuzz `s5_d5_plain_00837` (37 reaches, 37
disagreements) — `((i32) => {a: boolean, f: string | null, z: i32})[] | null`, the closure-
array element call `t0[0](1).f`. This is method note 26 again with a new face: the name
resolver is a LADDER (nominal, then a TIGHTENED field-set scan) and an arena-IDENTITY lookup
is not a dual of either rung. Filed with the mechanism, not with a verdict.

### Entombment (method note 21) — one piece reddens, one cannot

Both pieces are behaviour-preserving, so neither can have a fails-on-master test.

| sabotage | corpus byte | msg files | run-tree lines | files that stop emitting |
|---|---|---|---|---|
| S1 `nodeTyIsFuncTy` always FALSE | **10** | 10 | **70** | 10 |
| S2 `nodeTyIsFuncTy` always TRUE (over-accept) | **28** | 19 | **129** | 25 |
| S3 master records a WRONG ref-list row + flipped nul at `synthParamAnnots` | **0** | 0 | **0** | 0 |

(Each row re-measured on the rebase base; S1/S2 identical to the #1117-base run.)

S1/S2 say D-ARROWTY's migrated leg is load-bearing in both directions (witnesses:
`closures/closure-result-closure-valuecall.vl`, `closures/curried-contextual-typing.vl`,
`maps/map-struct-closure-closure-map-value.vl`, …). S1 also carries the FUZZ channel:
**731** tree-diff lines and 146 extra output files over 50,400 programs — the comparator
sanity at intended volume against a deliberately wrong build. (S2 is **0** on fuzz: the
generator emits no chained value call or `??`-defaulted closure binding, so that channel is
blind to two of the three sites. A 0 does not transfer between channels.)

**S3 is inert, and that is the honest report for D-ANNRLREC.** Recording a neighbouring row
and the flipped nullable flag ON MASTER changes nothing across 1,282 corpus files and 50,400
fuzz programs (0 byte, 0 message, 0 run-tree lines on both channels). So the deleted leg is invisible to every output channel, **no pin can exist
for it**, and its evidence is the construction argument above plus the 15,760-reach
measurement — the #1114 case, stated rather than dressed up.

### The call arithmetic

Local-aware, by resolver actually called, non-comment, over the five owned files:

| resolver | master | now | delta |
|---|---|---|---|
| `annArrowAt` | 30 | 27 | **−3** |
| `nameIsRefArray` | 23 | 21 | **−2** |
| `nullablePartOf` | 57 | 56 | **−1** |
| `refArrElemName` | 33 | 32 | **−1** |
| **TOTAL** | **354** | **347** | **NET −7** |

- **Type-string PARSES deleted: 7.** All of them; there is no laddering in this slice.
- **Name-keyed RESOLVERS deleted: 2** — `rlSlotByName` ×1, `recordAnnRlSlot` ×1.
- **Deleted from a PATH, not from the source: 1** — the duplicated `resolveShapeToNominal`,
  which carries `nameIsArray` + `structIndexOfTypeName`'s `nameIsWholeSpanShape` +
  `shapeFieldParse` + tightened fieldset scan, all still live for other callers.
- **Parses ADDED: 0. Consumers laddered: 0. Sidecars added: 0** (this slice adds no state).
- Cross-file: `emit_collect` / `emit_base` / `typecheck` / `emit_sections` unchanged.

Binary: 1,025,610 → **1,025,661** bytes (+51). (All numbers in this section are measured on
the rebase base `9df6029`/#1118; the call arithmetic is identical on #1117's base.)

### A correction to the brief's numbers

- **`nameIsRefArray` does not have 35 call sites.** 35 is the RAW TEXTUAL MATCH count over
  `compiler/*.vl`; 6 of those are inside comments and 1 is the definition header, so master
  has **30 real call sites** and this slice leaves **28**. #1105 warned about exactly this
  ("116 as a *match* count, 99 as a *call* count — say which is being reported, or the
  scorecard drifts again"); the drift happened anyway, one slice later.
- **#1117's 0.5% renderer share is an artefact of its scan depth, not a measurement of the
  arc.** Its provenance scan attributed within one function only, so `nodeTyName(ix)` — a
  renderer wrapper — counted as an unattributable call. One hop deeper, the `nodeTyName`
  consumers alone are 6 sites in this partition, twice the 3 that scan attributed to
  renderers tree-wide, and the stored-render `inferRetNameByNode` adds 19 more in one
  function. The renderer arc is real and the 0.5% understates it; the 12.7% `TypeRef.tyName`
  figure is unaffected and reproduces.
- **The suite count**: this worktree measures **1,962 / 0 / 8** on #1117's base and
  **1,969 / 0 / 8** on #1118's — the `/workspace` shape (8 ignored), not the 1,956/14 the
  brief predicted for worktrees. The 6-test worktree gap the last two slices reported does
  not reproduce here.

### Gate

Corpus **byte-, message- AND run-identical** (1,282 files = `tests/cases` + `compiler/` +
`std/` + `scripts/*.vl`; 1,092 emitting wasm; compiler stdout/stderr with the out-path
normalised, exit codes compared): **0** byte-diffs, **0** message-diff files, **0**
run-tree diff lines over 1,414 output files/side, transcripts identical. Fuzz A/B **50,400
programs/side** (7 seeds × depths 4/5/6 × {plain, `--branching --multiobs --declared`},
generated ONCE by the master compiler so both sides see identical programs), whole
`--out-dir` TREES via `diff -r`, **52,745** output files/side: **0** differing paths, **0**
transcript lines.

`refresh-compiler.sh` RC=0 (1,025,661 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined
failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 ==
stage4, 1,025,661 bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test`
RC=0 (**1,969 passed, 0 failed, 8 ignored**).

### What did NOT move, and the blocking mechanism

- **`synthRetAnnots`'s 19-site ladder over `inferRetNameByNode` — the single richest
  render→parse round trip in this partition — is blocked on ONE accessor in a file this
  partition does not own.** `ctx` is a stored `tyToEmitName` render, taken apart by 16 named
  classifiers (`nameIsLitUnionType`, `nullablePartOf`, `nameIsMapMemberUnion`,
  `parenUnionArrElemName`, `nameIsNestedUnionElemArray`, `nameIsNestedScalarLeafArray`,
  `nameIsLitUnionArray`, `nameIsMapArray`, `nameIsStructWithLitUnionField`,
  `nameIsStructWithUnionField`, `nameIsStructWithMapField`, `nameIsWholeSpanShape`, …), two
  `resolveShapeToNominal` calls and two inline `[`/`]`-suffix slices. The arena column it
  needs **already exists and is already populated**: `inferRetTyIx` (typecheck.vl:1115,
  pushed by `recordInferRet` beside the name), added for `collectU`'s structural walks. What
  is missing is a node-keyed accessor — `inferRetTyIxAt(i)` is exported but the `"#<node>" →
  i` index is not. **Measured, not assumed**: a probe exporting
  `inferRetTyIxByNode` finds the column covers **788 of 788** corpus and **13,374 of
  13,374** fuzz reaches where `ctx != ""` — **100%, 0 uncovered**, over 1,307 + 25,303
  anonymous lambdas.
- **`structIndexOfExpr`'s two render→fieldset rungs** — REFUTED above, with the disagreement
  count, the decline rate, the mechanism (`sTyIx` is arena-IDENTITY over a non-hash-consed
  arena) and a witness.
- **`structIndexOfObjCtxGo`'s two rungs** are the same shape and were NOT probed. Stated as a
  non-measurement, not as a claim: the site already opens with a node route
  (`repRowOfTyStruct(nodeRepTyIxOf(objIx))`) that `structIndexOfExpr` reaches only lower
  down, so its residual population is a different one and the 172-disagreement result above
  does not transfer to it in either direction.
- **The 27 stored-COLUMN parse sites.** The `rlElemName[slot]` family is already a laddered
  arena-first chokepoint set (D5-final); every residual name leg there is gated on
  `rlElemTyIx` COVERAGE, which is #1116's open hand-off (`rlInternName` re-RESOLVES the name
  it just stored via `fieldElemTyIxOfName`; 5 of its 9 call sites are in `emit_collect.vl`).
  Not attemptable from this partition, and re-banking only the 4 in-partition sites would
  change which ladder rung answers — a behaviour change, not a refactor.

### Hand-offs (exact diffs)

**1. `typecheck.vl` — export the node-keyed inferred-return type index.** Nine lines beside
`inferRetTyIxAt`, no new state:

```
export function inferRetTyIxByNode(nodeIx: i32) {
  const k = "#" + i32ToStr(nodeIx)
  if inferRetIdx.has(k) {
    const i = inferRetIdx[k] ?? -1
    if i >= 0 { return inferRetTyIx[i] }
  }
  0 - 1
}
```

That unblocks up to 19 consumer sites in `synthRetAnnots` (`emit_rewrite.vl`), on a column
measured 100%-covering. The migration is per-arm and each arm needs its own
candidate-beside-authority sweep (method note 31: admissibility is the CONSUMER's, and this
consumer PINS `fn.fnRet`, so a wrong arm is a wrong functype, not an absorbed guess).

**2. Whoever owns `emit_collect.vl`**: #1116's `rlInternName(name, kind, tyIx)` hand-off is
still the gate on the whole `rlElemName[slot]` parse family, and is now the gate on 27 sites
by this slice's count.

### Method notes earned

35. **A renderer WRAPPER hides the arc from a one-function provenance scan** (D-ARROWTY) —
    #1117 measured a 0.5% renderer share and concluded the arc was small; the scan attributed
    within one function, so `nodeTyName(ix)` (which is `tyToStr`/`tyToEmitName` of
    `nodeTyIxOf(ix)`) counted as an unattributable call, as did `inferRetNameByNode` (a
    stored render). One hop into the callee turns 3 renderer-attributed sites tree-wide into
    31 in five files. When a scan's answer is "the arc is small", check whether the arc's
    producers are named by wrappers before believing it.
36. **The exactness of an arena dual can come from the RENDERER's disambiguation rules**
    (D-ARROWTY) — `annArrowAt(nodeTyName(ix)) >= 0` ⟺ `is TyFunc` is not a lucky
    coincidence measured to 0: it holds because `tyToEmitName`'s array arm parenthesizes a
    closure element and `tyToStr` spells arrows `->`. The renderer's own
    ambiguity-avoidance is what makes the round trip information-preserving, and therefore
    what makes it deletable. Read the renderer, not just the parser, before deciding a
    round trip is lossy.
37. **A leg can be dead by CONSTRUCTION on one column and dead by MEASUREMENT on its twin**
    (D-ANNRLREC) — `recordAnnRlSlot` writes two columns from one call site; the nullable
    column is unreachable because a line above guarantees the arena covers the node, while
    the slot column needed 15,760 reaches to show the name leg never answers where the arena
    declines. Reporting them as one "0" would have hidden that half the deletion rests on a
    sweep and could regress, and half cannot.

## D-CLASSANG + D-INFERRETTY — the emitter's last `<>`-blind scanners, and the inferred-return arena column measured NOT a dual (#1120)

Two things. The first finishes #1118's hand-off; the second answers #1119's — with a
refutation, which is the more useful of the two results.

### D-INFERRETTY — REFUTED: the coverage figure reproduces exactly, and the column is still not a dual

#1119 filed `synthRetAnnots`'s 19-site ladder as blocked on ONE unexported accessor, over a
column "measured **788 of 788** corpus and **13,374 of 13,374** fuzz reaches — **100%, 0
uncovered**". **That figure reproduces.** It is also not the question the migration turns on.

The probe is candidate-beside-authority AT THE CONSUMER, with the consumer's own tolerance as
the comparator (method note 31): for every lambda `synthRetAnnots` reaches with
`fn.fnRet < 0`, take the stored name `ctx = inferRetNameByNode(lamIx)` and the arena column
`ix = inferRetTyIxByNode(lamIx)`, then run the SAME 15-arm ladder over `ctx` and over
`tyToEmitName(ix)` and compare (a) the ARM selected and (b) the name that arm would PIN onto
`fn.fnRet`. Not a render-vs-render diff (method note 32): the authority *is* a render, and
what is compared is the DECISION each one drives.

| at `synthRetAnnots` | corpus (1,092 emitting programs) | fuzz (16,017 of 16,800) | total |
|---|---|---|---|
| reaches (`fn.fnRet < 0`) | 1,283 | 8,494 | 9,777 |
| the ladder runs (`ctx != ""`) | 778 | 4,637 | 5,415 |
| **arena column COVERS** | 778 | 4,637 | **5,415 — 100%, 0 uncovered** |
| `tyToEmitName(ix) == ctx` | 585 | 3,648 | 4,233 (78.2%) |
| **ladder selects a DIFFERENT ARM** | 99 | 661 | **760** |
| same arm, **DIFFERENT PIN** | 11 | 12 | **23** |
| **`fn.fnRet` decisions CHANGED** | **110** | **673** | **783 / 5,415 = 14.5%** |

Three families, each with witnesses and a consequence:

| family | n | witnesses | consequence |
|---|---|---|---|
| arm 1 → **no arm** | 393 | `K0` vs arena `string`; `C\|S` vs `{c:i32}\|{s:i32}`; `Cat\|Dog` vs `{meow:i32}\|{bark:i32}`; `T[]\|{w:i32}` vs `{f:boolean}[]\|{w:i32}` | the union / litunion pin is **LOST** — the lambda's `$fnsig` result stops matching the value call, the exact miscompile the arm exists to prevent |
| **no arm** → arm 15 | 346 | `{x: i32}` vs `{x:i32}`; `{a: i32, f: i64, z: f64}` vs `{a:i32,f:i64,z:f64}` | master declines through arm 15's deliberate `!strContains(ctx, " ")` SPACE guard ("a legacy SPACED record must keep its established un-pinned route"); the arena's canonical render has no spaces, so **346 pins are ADDED** |
| **no arm** → arm 13 | 21 | `{f: i64[]?}` vs `{f:i64[]\|null}`; `{f: () -> i64?}` vs `{f:(()=>i64)\|null}` | the stored name is a **`tyToStr`** render whose `?` no classifier knows; the arena's `\|null` render is `nameIsStructWithUnionField` — pins ADDED |
| same arm, different pin | 23 | arm 2 ×9 `P\|null` vs `{x:i32}\|null`; arm 7 ×12 `(K0)[]` vs `K0[]`; arm 1 ×1 | a different pinned TypeRef |

Two of the witnesses are worth naming separately, because they are not spelling noise:
`{f: () -> i32[]}` vs arena `{f:(()=>i32)[]}` and `{[string]: i32 | {w: i32} | string[]}` vs
arena `{[string]:(i32|{w:i32}|string)[]}` — the stored `tyToStr` render is genuinely
AMBIGUOUS between "a closure returning a list" and "a list of closures", and the arena reads
it the other way. Method note 32's hazard, met head-on rather than in a comparator.

**The mechanism, at the producer, in one line.** `recordInferRet(name, ty, tyIx, atoms)` is
called `recordInferRet(nodeKey, rty, inferred, rAtoms)`: `rty` is the SPELLING the checker's
adoption ladder settled on (a declared union alias, a litunion alias via
`litUnionAliasNameOfTy`, or the `recordable` render) and `inferred` is the raw arena type the
ladder was deciding ABOUT. The parallel-array shape makes them look like two views of one
thing. They are the DECISION and its INPUT. `inferRetTyIx` exists (its own comment says so)
for `collectU`'s structural walks, precisely BECAUSE the rendered name does not surface
everything the type reaches; nothing ever claimed it renders back to the name, and it does
not. The identical non-duality is already written down one column over, about the WIDTH: "a
litunion member renders as one atom while its spine counts several. The width must be the
producer's JOIN width, never a walk."

So the 19 sites stay, and no amount of extra coverage can move them: a structural classifier
over `T.tys[ix]` cannot recover `K0` from `string`, because the litunion alias is not in the
type. **`inferRetTyIxByNode` is therefore NOT shipped** — an exported accessor with no caller
is dead code, and the finding is that it should not acquire one until the PRODUCER changes.

**A latent hazard found on the way, measured and NOT live.** `recordInferRet` pushes FOUR
parallel columns (`inferRetFn`, `inferRetTy`, `inferRetAtomCount`, `inferRetTyIx`) plus a map
entry. The two speculative-inference windows (`monoInferListElem` and its scalar twin)
snapshot `inferRetFn.length` and on rollback pop **only `inferRetFn` and `inferRetTy`** —
`inferRetAtomCount`, `inferRetTyIx` and the `inferRetIdx` entries survive. One row recorded
inside a speculative window would desync row `i` of the name columns from row `i` of the
arena/width columns permanently — exactly what a consumer reading `inferRetTyIxAt(i)` beside
`inferRetTyAt(i)` would suffer. A probe reporting `inferRetTyIx.length - inferRetFn.length`
at the end of every emit reads **0 over 1,092 corpus and 16,017 fuzz programs**: the windows
record nothing today. Reported with its measurement, not fixed — a guard whose absence
nothing can catch is method note 24's wrong shape, so the fix belongs with the first consumer
that would notice.

### D-CLASSANG — the last nine `<>`-blind scanners: eight repaired, one rejected

#1118 repaired 21 scanners and handed off nine in `emit_classify.vl`. Two audit probes
(#1118's shape) over the 1,092-program corpus and 16,800 fuzz programs. Probe A re-walks each
input under BOTH depth rules and compares the depth-0 `,`/`|`/`:` seams (run on MASTER
source). Probe B counts the two `>` populations separately (run on the SHIPPED source):
`arrowGt`, a `>` preceded by `=`, which the `=`-exemption already neutralises under either
rule; and **HAZ**, a `>` NOT preceded by `=` reached with no `<` open — the only population
the `angOpen` gate exists for.

| scanner | calls (corpus / fuzz) | inputs with `<` | **seams MOVE** | `arrowGt` inputs | **HAZ inputs (occurrences)** |
|---|---|---|---|---|---|
| S1 `nameIsWholeSpanShape` | 75,682 / 39,176 | 1 / 0 | — | 749 / 2,435 | 27 (30) / 129 (140) |
| S2 `shapeFieldParse` | 3,556 / 24,396 | 0 / 0 | 0 / 0 | 194 / 2,073 | **172 (188) / 786 (839)** |
| S3 `splitUnionArmsAllDepth` | 4,054 / 27,835 | 4 / 0 | **4** / 0 | 3,447 / 25,670 | 0 / 0 |
| S4 `funcTypeShapeLowerable` | 524 / 3,229 | 0 / 0 | 0 / 0 | 62 / 330 | 0 / 0 |
| S5 `variantNestedShapeOk` | 33 / 128 | 0 / 0 | 0 / 0 | 1 / 6 | 0 / 0 |
| S6 `internNonLowerableFieldShapes` | 45 / 201 | 0 / 0 | 0 / 0 | 20 / 155 | 0 / 0 |
| S7 `internShapeFieldElems` | 255 / 1,721 | 0 / 0 | 0 / 0 | 18 / 60 | 0 / 0 |
| S8 `internInlineShape` | 120,081 / 107,667 | 62 / 0 | **24** / 0 | 433 / 3,476 | 3 (6) / 0 |
| S9 `internShapeAs` | 2 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| **total** | **204,232 / 204,353** | **67 / 0** | **28 / 0** | **4,924 / 32,105** | **202 (224) / 915 (979)** |

Three things fall out before any code changes.

- **The `>` hazard is real but far smaller than the raw `>` count**, and an earlier draft of
  this section got that wrong. 36,120 fuzz inputs carry a `>` with no `<` — but 32,105 of
  them are the arrow `=>`, which the `=`-exemption already covers under BOTH rules. The
  population that only the `angOpen` gate can save is **915 fuzz and 202 corpus inputs**, and
  every witness is a **`tyToStr` `->` render**: `f: () -> i32`, `f: () -> i64?`,
  `a: () -> i64 | f64, f: i32, z: () -> i32[]`. The refuted rule's own string language,
  reproduced at this file's call sites.
- **The `<` bug is rare here**: 67 corpus inputs, **0 fuzz** — `scripts/fuzzgen.vl` declares
  no generic at all. Channel separation, stated: the corpus and the pin gate the `<` half,
  fuzz gates the `>` half. Neither channel can substitute for the other.
- The hazard concentrates in **S2**, which is the one scanner fed CHECKER renders
  (`structIndexOfTypeName` / `variantIndexOfTypeName` resolve a rendered shape name); the
  interners (S4–S9) are fed `tyToEmitName` output, which spells arrows `=>`.

**Eight repaired.** S2–S9 each gained an `angOpen` counter beside its existing depth; `<`
opens both, `>` closes both only through `tyGtIsClose(name, i, angOpen)`.

**S1 `nameIsWholeSpanShape` is NOT repaired, and repairing it blindly would have been wrong.**
Its depth alphabet is BRACES ONLY — it never counted `[` or `(` either — because it asks one
question: at which index does brace depth return to 0. A `<`/`>` pair cannot change brace
balance, so adding it to that counter cannot move `closeAt`. Inert **by construction**, not
merely unmeasured. Its 27 corpus / 129 fuzz HAZ inputs show the hazard class reaches it; it
simply cannot act there.

### Why the `<` half is CONSERVATIVE everywhere but one program

The repair is corpus byte-, message- and run-identical and fuzz tree-identical. That is not
"unreachable" — 67 corpus inputs carry a `<` and 28 of them MOVE a seam. It is that in this
file a moved seam can only ever LOSE an intern, never mint a wrong one:

- `internInlineShape` / `internShapeAs`: the mis-split's trailing fragment (`string>`,
  `i32>`) has no `:` at all → `ci <= 0` → `ok = false`; where it does have one, its type text
  (`i32}>`) fails `nameFieldCode` → `ok = false`. Both abandon the WHOLE shape
  (`if !ok … return -1`). No fragment of a generic argument list reads as a valid field.
- `funcTypeShapeLowerable` / `variantNestedShapeOk`: the same fragment sets `okAll = false`.
- `internNonLowerableFieldShapes` / `internShapeFieldElems`: guarded by `ci > 0`; skipped.
- `shapeFieldParse`: a mis-split yields a field-NAME set containing `string>`, and both
  consumers match by field-name SET — a set with a non-identifier member matches no row.
- `splitUnionArmsAllDepth`: a `|` inside `<…>` always leaves the closing `>` attached to the
  LAST fragment (`{b:i32}>`), and `internShapeDeep` requires a `}`-terminated `{…}` — so the
  bogus arm is a no-op. This is the ONE path that could in principle intern an EXTRA shape
  and perturb struct-table ORDER; the grammar keeps it shut.

Every wrong answer is absorbed by a downstream reject (method note 4's shape), which is why a
25-program hand-written battery of generic-argument shapes produced exactly ONE behaviour
change.

### The pin (fails on master)

`tests/cases/generics/type-arg-list-field.vl` — `{ v: Pair<i32, string>[] }`:

| build | result |
|---|---|
| master `faf7de6` | `emitProgram: ref valtype with no interned shape` |
| here | `emitProgram: ref-list field element type is not interned` |

The shape interns now (one code-5 ref-list field) and the reject moves to the gap actually
left: the element is a generic APPLICATION and `internShapeFieldElems` descends only a `{…}`
leaf. `deno test tests/cases_wasm_test.ts` under the MASTER seed: **1,223 passed, 1 failed** —
this fixture; under the shipped seed it passes. Its non-generic control
(`type PairIS = { a: i32, b: string }; const o: { v: PairIS[] } = …`) compiles and RUNS on
master, which is what separates the residual gap from the scanner defect above it (note 34).

### Entombment (method note 21)

The `<` half has a fails-on-master pin. The `>` gate is a behaviour change no corpus program
can see, so it is entombed by SABOTAGE — **S-ANG**: the eight repaired scanners drop the
`angOpen` gate and use the REFUTED rule ("a `>` closes unless it is the arrow's tail"),
everything else identical.

| build pair | corpus byte / msg / run (1,282 files) | fuzz tree-diff lines |
|---|---|---|
| shipped vs master | 0 / 0 / 0 | **0** (50,400 programs/side, 52,745 output files/side) |
| shipped vs **S-ANG** | **0 / 0 / 0** | **10** (21,600 programs/side, 22,594 files/side) |

The corpus is byte-, message- AND run-identical to the refuted rule on all 1,282 files —
#1118's finding reproduced at a different set of call sites — and only fuzz sees it. Witness,
`seed=3 depth=5 multi case_00203`:

```vl
type K0 = "028" | "jbn" | "dd"
type T0 = {f: () => {f: () => {a: f32, f: K0, z: i64}}}
type T1 = {f: () => {f: () => {a: f32, f: K0, z: i64}}}
function useTwin(p: T1) { print(p.f().f().f) … }
```

shipped: `jbn / 3.5 / 6000000000`; S-ANG: `emitProgram: function-value call arity has no
interned signature`. The mechanism is exactly the probe's most frequent S2 hazard witness —
`f: () -> {a: f32, f: "028" | "jbn" | "dd", z: i64}`, the `tyToStr` render of that very field,
42 hits on the fuzz sweep: the `->`'s `>` runs `shapeFieldParse`'s depth negative, the field
seams move, the layout-TWIN resolves to the wrong row and the value call finds no signature.
HAZ reach and sabotage consequence are the same program family, which is what makes the
0 in the row above mean something (method note 8).

### The call arithmetic

Local-aware, by resolver actually CALLED, over `compiler/*.vl`. **Counting method, stated:**
`//` line comments are stripped (quote-aware, so a `//` inside a string literal does not
truncate code); the definition header (`function NAME(`) is excluded; an occurrence counts
only when followed by `(`, so an `import {}` / `export {}` mention is NOT a call; several
calls on one line all count.

| | master `faf7de6` | now |
|---|---|---|
| all 25 SCORECARD resolvers (`nameIsRefArray`, `refArrElemName`, `nullablePartOf`, `annArrowAt`, `nameIsArray`, `splitUnionAtoms`, `unionMemberCount`, `mapValNameOf`, `nameFieldCode`, `isUName`, `isValueUnionName`, `nameIsLitUnionType`, `nameIsMapMemberUnion`, `parenUnionArrElemName`, `nameIsLitUnionArray`, `nameIsMapArray`, `resolveShapeToNominal`, `nameIsWholeSpanShape`, `shapeFieldParse`, `splitUnionArmsAllDepth`, `nameIsNestedUnionElemArray`, `nameIsNestedScalarLeafArray`, `nameIsStructWithUnionField`, `nameIsStructWithLitUnionField`, `nameIsStructWithMapField`) | — | **every one IDENTICAL** |
| `tyGtIsClose` | 25 | **33** (+8) |

- **Type-string PARSES deleted: 0 · added: 0 · consumers laddered: 0 · name-keyed resolutions
  deleted: 0 — NET 0.** This slice REPAIRS eight scanners, which the scorecard has no column
  for; that was #1118's note too.
- `tyGtIsClose` is the depth rule's character predicate ("is this `>` a closer"), not a
  type-name parse, so the +8 does not enter the parse count.
- New state: **none**. New sidecars: **none**. Binary 1,025,661 → **1,026,243** (+582).

### Target-3 enumeration, and a correction to the brief's `nameIsRefArray` figure

The brief quotes **30** real `nameIsRefArray` call sites on master. On `faf7de6` — which IS
#1119's result, and #1119 deleted two — there are **28**, which #1119 itself predicted ("this
slice leaves 28"). Both numbers are right about different commits; the current one is 28.
Under the filter above:

| resolver | calls on `faf7de6` | raw textual matches | of those, in comments | definition headers |
|---|---|---|---|---|
| `nullablePartOf` | 78 | 105 | 22 | 1 |
| `annArrowAt` | 56 | 73 | 13 | 1 |
| `splitUnionAtoms` | 48 | 83 | 29 | 1 |
| `isValueUnionName` | 44 | | | 1 |
| `mapValNameOf` | 39 | 58 | 15 | 1 |
| `nameIsLitUnionType` | 37 | | | 1 |
| `refArrElemName` | 35 | 74 | 36 | 1 |
| `nameIsArray` | 32 | 45 | 9 | 1 |
| `isUName` | 32 | | | 1 |
| **`nameIsRefArray`** | **28** | **63** | **32** | **1** |
| `nameIsMapMemberUnion` | 25 | | | 1 |
| `nameIsLitUnionArray` | 13 | | | 1 |
| `unionMemberCount` / `parenUnionArrElemName` | 11 / 11 | | | 1 |
| `nameFieldCode` | 8 | 22 | 12 | 1 |
| `resolveShapeToNominal` | 6 | | | 1 |
| `nameIsMapArray` | 5 | | | 1 |
| `nameIsWholeSpanShape` / `splitUnionArmsAllDepth` | 4 / 4 | | | 1 |
| `shapeFieldParse` / `nameIsNestedScalarLeafArray` / `nameIsStructWithUnionField` | 3 each | | | 1 |
| `nameIsStructWithLitUnionField` | 2 | | | 1 |
| `nameIsNestedUnionElemArray` / `nameIsStructWithMapField` | 1 each | | | 1 |

`nameIsRefArray`'s 28 sit in `emit_classify` (19), `emit_collect` (7), `wasmEmit` (2). The 19
in this partition are not attemptable from here for the reason #1119 filed: they are the
laddered `rlElemName[slot]` chokepoint family, gated on `rlElemTyIx` COVERAGE, whose producer
(`rlInternName`) lives in `emit_collect.vl`.

### What did NOT move, and the mechanism

- **`synthRetAnnots`'s 19 sites** — refuted above, 5,415 comparisons on both channels, 783
  changed pins, three families, and the producer line that makes the two columns non-dual.
  Not "needs more coverage": more coverage cannot help.
- **`structIndexOfExpr` / `structIndexOfObjCtxGo`'s render→fieldset rungs** — unchanged;
  #1119's refutation (`sTyIx` is arena-INDEX identity over a non-hash-consed arena) stands
  and was not re-probed.
- **The residual gap the pin opens onto** is `internShapeFieldElems`' element descent, which
  peels `[]` and interns only a `{…}` leaf. A generic APPLICATION element needs
  `emit_base.gaeApplyFieldTy`'s expansion ahead of that peel — not in this partition.
- **A parser bug the battery found, filed not fixed**: `union U { A: { v: Pair<i32, string> },
  B: { n: i32 } }` is a **parse error** — ``expected `}` but found `>` `` — a generic
  application inside a union VARIANT's inline shape; the non-generic control parses.
  `parser.vl`, not in this partition.

### Gate

Corpus **byte-, message- AND run-diff** over 1,282 files (`tests/cases` + `compiler/` +
`std/` + `scripts/*.vl`; build stdout/stderr with the out-path normalised, exit codes
compared, `vl run` status + stdout compared): **0 byte-diffs, 0 message-diffs, 0 run-diffs.**
Fuzz A/B **50,400 programs/side** (7 seeds × depths 4/5/6 × {plain, `--branching --multiobs
--declared`}, generated ONCE by the master compiler so both sides see identical programs),
whole `--out-dir` TREES via `diff -r`, **52,745** output files/side: **0 differing lines**.

`refresh-compiler.sh` RC=**0** (1,026,243 bytes) · `rep-fuzz-check.sh` RC=**0** (exact; 1
baselined failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=**0**
(stage3 == stage4, 1,026,243 bytes) · `lint-self.sh` RC=**0** ·
`SELFHOST_NATIVE_ALIGN=1 deno task test` RC=**0** (**1,971 passed, 0 failed, 8 ignored** —
1,969 + the new pin, which two suites each run).

A harness correction worth recording: the FIRST corpus A/B reported **190 BYTEDIFFs**. They
were an artefact — `m=$(vl build … 2>&1 | sed …); rc=$?` takes **sed's** exit code, so every
REJECT fixture read as a successful build and `cmp` on two absent artefacts reported a
difference. Fixed (capture, then normalise) and re-run: 0/0/0.

### Hand-offs (exact)

1. **Do NOT export `inferRetTyIxByNode` for `synthRetAnnots`.** The measurement is above. If
   the 19 sites are to move, the change is at the PRODUCER: `recordInferRet(nodeKey, rty,
   inferred, rAtoms)` would have to record the arena type `rty` DENOTES (the litunion alias's
   own type, the declared union's own type) rather than the type the adoption ladder was
   deciding about — and that is a behaviour change to `collectU`'s structural walks, which
   consume `inferRetTyIxAt` today and want the raw `inferred`. Two consumers, two different
   types: the honest shape is a THIRD column, not a re-use. Nine lines:
   ```
   // beside inferRetTyIx, written by the SAME recordInferRet call
   let inferRetPinTyIx: i32[] = []          // the arena type `rty` denotes, or -1
   ...
   inferRetPinTyIx.push(pinTyIx)            // the caller passes it at each adoption rung
   ```
   The rungs that would have to supply it are the ~30 `recordInferRet` producers around
   `typecheck.vl:10245` and `12729-12749`; each already HAS the type it chose the name for.
2. **The speculative-window rollback** (`typecheck.vl`, `monoInferListElem` + its scalar
   twin) pops `inferRetFn`/`inferRetTy` but not `inferRetAtomCount`/`inferRetTyIx`/the
   `inferRetIdx` entries. Measured **0** skews over 17,109 programs. Four lines to make it
   total; land it WITH the first consumer that reads the two columns side by side, so the fix
   has a gate that can catch its own absence.
3. **`emit_base.vl` / `emit_collect.vl`**: `{ v: Pair<i32, string>[] }` now interns its field
   and fails at the ELEMENT (`tests/cases/generics/type-arg-list-field.vl`).
   `internShapeFieldElems` peels `[]` and interns a `{…}` leaf; a generic-application element
   needs `gaeApplyFieldTy`'s expansion ahead of that peel.
4. **`parser.vl`**: `union U { A: { v: Pair<i32, string> } }` → ``expected `}` but found `>` ``.

### Method notes earned

38. **100% COVERAGE and 0% duality are compatible, and only the CONSUMER's comparator
    separates them** (D-INFERRETTY) — the arena column answers on 5,415 of 5,415 reaches and
    changes 783 of them. A coverage sweep says 100%; a render-equality sweep says 78.2% and
    reads like spelling noise; running the CONSUMER'S LADDER over both renders says 85.5% and
    names three families with three different consequences. Run the consumer over the
    candidate, not a string comparison beside it.
39. **A column recorded BESIDE a name at one call is not an encoding OF that name**
    (D-INFERRETTY) — `recordInferRet(name, rty, inferred, …)` records a decision and its input
    in one row; the parallel-array shape makes them look like two views of one thing. Read the
    producer's ARGUMENTS before treating a sidecar as a dual. The give-away here was already
    written down one column over, about the WIDTH.
40. **A depth rule can be reachable, seam-moving and still unobservable — check whether the
    consumer's failure is CONSERVATIVE** (D-CLASSANG) — 67 corpus inputs carry a `<`, 28 move
    a seam, and the corpus is 0/0/0, because every consumer of a mis-split fragment sets
    `ok = false` and abandons the whole shape. "The scanner is wrong wherever it runs" is
    true; "therefore something will differ" does not follow. A repair like this becomes
    visible only where the NEXT gate is already implemented.
41. **Split a hazard count by the exemption that already covers it** (D-CLASSANG) — an earlier
    draft of this section claimed 36,120 fuzz inputs would be corrupted by the refuted `>`
    rule. 32,105 of them are `=>`, which the `=`-exemption neutralises under BOTH rules; the
    population only the `angOpen` gate saves is 915. Counting "inputs containing the hazardous
    character" over-states a gate's value by 35x. Count the inputs on which the two rules
    actually DISAGREE.
42. **`$?` after a pipe is the LAST stage's** (D-CLASSANG, harness) — `m=$(cmd 2>&1 | sed …);
    rc=$?` records sed's 0 for every failing build, so a corpus A/B compared two absent
    artefacts and reported 190 byte-diffs. The always-fires and the cannot-fire comparator
    (note 12) are the same bug; sanity-check in BOTH directions before reading a number.

## D-PARSETY P2 — the STRING-ONLY type spellings, and a rep frontier that is not a rep gap (#1121)

Two things. The first is D-PARSETY's phase 2, which #1117 named and #1118 left open: the
three type spellings the parser builds and then DROPS because they land on a node as a
`string`, not as a `TypeRef`. Recording them and letting the module merge rewrite the TREE
fixes the SAME user-visible bug P1 fixed, in two more positions. The second is TARGET 2 — a
minimal reproduction and mechanism for the composition failure #1118 reported, which turns
out to be neither a rep-composition gap nor new.

### P2 — what is recorded, and the bug it fixes

#1118's P1 taught `modRwType` to rename the parser's spelling TREE instead of scanning the
rendered name for identifier runs, because `modTypeRenamed` **cannot tell a type reference
from a FIELD name**. It fixed that for a `TypeRef`. The same scanner still ran on three other
strings, and two of them can carry a field name:

| position | node field | reachable spelling with a FIELD name |
|---|---|---|
| `x is T` | `IsExpr.isVariant` | `x is { v: i32 }` |
| `type N = A \| B` | `UnionDecl.udVariants[]` | `type AB = Q \| { v: i32 }` |
| `x as T` | `AsExpr.asTy` | — the merge **never renames it** (`modRwExpr`'s `AsExpr` arm rewrites only the operand), so there is no consumer and nothing is recorded |

Reproduced on master (`2c5e9cd`), one module declaring a type whose name collides with a
field name in the same module:

```vl
// lib.vl
export type v = i32
export type Q = { q: string }
export type AB = Q | { v: i32 }
export function mk(): AB { const a: AB = { v: 7 }  a }
```
→ `cannot assign {v: i32} to 'a' of type {q: string} | {v: i32}` — two types that RENDER
identically, because the diagnostic demangler strips the `$m1` the FIELD name grew. The `is`
position gives the second face: `` `is` check type '{w:string}' is not a variant of
{v: i32} | {w: string} ``.

Shipped:

- **`parser.vl`** — `parseIsType` / `parseVariantName` / `parseVariantAtom` stop dropping
  their root. It travels in a one-slot channel (`lastTyTsRoot`, the `pendingGt` shape),
  because these producers return a NAME and their caller mints the owning node afterwards;
  the caller banks it immediately, so `annTsNode` stays strictly increasing. `is null` builds
  its `TS_NULL` leaf directly (the one-token type never enters `parseTypeName`).
- **`ast.vl`** — `tsLeaf` / `tsMkKids`, the off-stack constructors (`tsMk`'s contract is "the
  children are the stack region above a mark", which only a producer mid-recursion can
  satisfy), and `udTsNode` / `udTsRoot`, the MULTI-root twin of `annTs`: a `UnionDecl` holds
  its members as a `string[]`, so one row per MEMBER in member order, non-decreasing key,
  binary search to the leftmost row then index by `k`.
- **`driver.vl`** — the `IsExpr` and `UnionDecl` arms read the tree, `modRwTsName` it, and
  render. `modTypeRenamed` stays as the fall-through.

**The one member the parser does not get from a type producer.** `type N = { … } | { … }`
takes the LBRACE path, whose FIRST member is the synthetic `"{" + synth + "}"` text assembled
from the field list. Its spelling is assembled the same way — a `TS_FIELD` per field over the
type root the field already recorded, under one `TS_OBJ` (plus a `TS_ISECT` when the `&`
chain fires) — and `tsToName` renders it back to exactly the same characters, because
`TS_FIELD` is `name + ":" + type` and `TS_OBJ` is `"{" + comma-joined + "}"`, which is what
`synth` is built by. Nothing is built unless the `&`/`|` continuation fires, so a plain
`type X = { … }` struct declaration adds no spelling node.

### The pins, and each leg reddened separately (method note 21)

This is a behaviour CHANGE, so every pin FAILS on master (`2c5e9cd`) and passes here.

| pin | the leg it needs | master |
|---|---|---|
| `modules/union-variant-field-shadows-type/` | `udTsRootAt` (the `parseVariantName` member) | `cannot assign {v: i32} to 'a' of type {q: string} \| {v: i32}` |
| `modules/union-first-operand-field-shadows-type/` | the SYNTHESIZED `TS_OBJ` first member | `cannot assign {v: i32} to 'a' of type {v: i32} \| {w: string}` |
| `modules/is-type-field-shadows-type/` | `annTsOf` on the `IsExpr` **and** the member leg | `cannot assign {w: string} to 'a' of type {v: i32} \| {w: string}` |

Sabotages, each one leg disabled, everything else shipped — the separation is exact:

| sabotage | union-variant | union-first-operand | is-type | field-name (P1) |
|---|---|---|---|---|
| S1 `annTsOf(ix)` → -1 in the `IsExpr` arm | pass | pass | **FAIL** | pass |
| S2 `udTsRootAt(ix, i)` → -1 | **FAIL** | **FAIL** | **FAIL** | pass |
| S3 the synthesized `TS_OBJ` root → -1 | pass | **FAIL** | pass | pass |

(S2 reddens the `is` pin too, and that is the shape of the dependency: with the members
mangled the union never types at all. S1 reddens ONLY the `is` pin — with the members clean
and the check type still scanned as characters, the emitter rejects `{w$m1: string}` as "not
a variant".)

### The fall-throughs are measured DEAD, and the comparator is measured POWERFUL

- **Fall-throughs.** A build that prefixes `@@POISON@@` onto BOTH string fall-throughs
  (`vs.push(modTypeRenamed(…))` and `n.isVariant = modTypeRenamed(…)`) is corpus byte-,
  message- AND run-identical to the shipped build over **1,290 files**: **0 diffs of any
  kind**. Every `IsExpr` and every `UnionDecl` member at merge time has a recorded spelling.
  Not a totality proof — a measurement, though it is total by construction too: all four
  `mkIsExpr` / `mkIsExprNeg` / `mkUnionDecl` call sites are the parser's, and each now
  records.
- **Comparator power, at volume, against known-WRONG builds.** The fuzz generator emits
  single files and this slice only changes the module MERGE, so the fuzz channel is BLIND to
  it by construction — its 0 is a regression check, not evidence (a 0 does not transfer
  between channels). The channel that CAN see it is the corpus:

| build | corpus files that diverge |
|---|---|
| `modRwTsName` renames NOTHING (wire sabotage) | **32** — including the compiler's own 16-module build (`compiler/*.vl` entries) |
| `modRwTsName` renames `TS_FIELD` too (the string scanner's defect, moved INTO the tree) | **4** — exactly the four field-shadow pins, and nothing else |

The second row is the sharper one: it says the field-name discrimination — the whole point of
P1 and P2 — changes exactly four programs in this corpus and no others, so the pins are the
complete reach and the 0-diff on the other 1,285 is not luck.

### Allocation, measured (method note 24)

| | master | now | Δ |
|---|---|---|---|
| corpus (1,288 files, `faf7de6` base) spelling NODES | 119,608 | 119,674 | **+66** |
| corpus child slots | 26,506 | 26,546 | +40 |
| corpus `annTs` rows | 58,438 | 91,295 | +32,857 |
| corpus `udTs` rows | 0 | 1,819 | +1,819 |
| the compiler's own 16-module build: spelling nodes | 10,066 | **10,066** | **0** |
| … `annTs` rows | 5,447 | 8,521 | +3,074 |
| … `udTs` rows | 0 | 90 | +90 |

**+66 spelling nodes over the entire corpus** — the `is null` leaves plus the `{…} & … | …`
re-encode's `TS_FIELD`/`TS_OBJ`, which no file in the compiler's own source uses. The row
growth is one `annTs` row per `is` expression and one `udTs` row per union MEMBER: exactly
what the information costs, the shape #1117 measured and kept.

Binary: 1,026,243 (`2c5e9cd`) → **1,029,996** bytes (+3,753). (The allocation sweep above
was taken on the `faf7de6` base, both sides over the same 1,288-file list; #1120 touches
neither `parser.vl` nor `ast.vl`, so the arena figures carry unchanged.)

### The call arithmetic

**0 parses added · 0 parses deleted · 2 consumers laddered · NET 0.** Local-aware scan by
resolver called. **Counting method, stated:** line comments are stripped before matching
(`//` outside a string literal); a match is `NAME(` with the preceding char not
`[A-Za-z0-9_.]`; the parser's own `function NAME(` definition header is excluded; the parser
list is the SCORECARD CORRECTION's plus #1117's four additions (`refArrElemKind` /
`nameIsI32ListArray` / `nameIsMapArray` / `nullClosureArrElem`). **This is a call count, not
a grep count.**

| file | master (2c5e9cd) | now |
|---|---|---|
| `compiler/parser.vl` | 0 | 0 |
| `compiler/ast.vl` | 0 | 0 |
| `compiler/driver.vl` | 0 | 0 |
| `compiler/emit_collect.vl` | 98 | 98 (untouched) |
| `compiler/emit_base.vl` | 66 | 66 (untouched) |
| **total** | **164** | **164** |

The scanner this slice actually moves is `modTypeRenamed`, which the SCORECARD has never
counted (#1117 flagged it as "a type-string parser the scorecard does not count"). Its call
sites: **5 on master, 5 now** — `modRwType` (laddered by #1118), the two this slice ladders
(`udVariants`, `isVariant`), and `tdName` / `udName`, which are DECLARATION names built from
an identifier token, not from `parseTypeName`, and are correctly renamed whole. Cumulative
across P1+P2: **3 of the 5 are now arena-first with a measured-dead fall-through.**

### Why the emit-side consumers did NOT move — the blocker, measured

The question TARGET 1 asks of every parse site is "does the node whose name this is still
have its parser tree, and is the tree the answer?". For the annotation-node consumers in this
partition — `collectA`'s 25 sites over `nd.tyName` (`emit_collect.vl:2863-2985`),
`collectGenAliasShapes`, and `emit_base`'s `tyIsNulBool` / `retNulStringFlag` /
`nameIsClosureArrayTy` over `tyNameOf(tyIx)` — the answer today is **no**, and it is a
measurement, not a reading.

A probe build that fails the emit the moment a `TypeRef` at `collectA` has no recorded
spelling, or one whose `tsToName` differs from `tyName`, over the 1,288-file corpus
(`faf7de6` base):

| | files |
|---|---|
| tree present AND identical to `tyName` | **1,042** |
| **NOSPELL** — a `TypeRef` with no recorded spelling | **203** |
| **STALE** — a recorded spelling that renders a DIFFERENT name | **43** |

**19.1% of corpus files carry a `TypeRef` the tree cannot answer for at emit time.** The two
classes are exactly the two the phased plan predicted, now with witnesses:

- **NOSPELL** — emitter-SYNTHESIZED annotations (`synthTypeRef`, `synthRetAnnots`,
  monomorphization clones): `string[]`, `K0|null`, `({[string]:boolean}|null)[]`,
  `{a:f64,f:K0,z:string}[]`. These names were computed by the emitter and never passed
  through the parser.
- **STALE** — the CANON pass (P4). `canonEmitTypeNames` widens a literal union to its base
  and resolves aliases, in place, between producer and consumer (note 22): `"a"|"b"` →
  `string`, `0|1|2` → `i32`, `1.5|2.5` → `f64`, `Id` → `i32`, `AB|null` →
  `{t:i32,a:i32}|{t:i32,b:i32}|null`, `K0|{w:i32}` → `string|{w:i32}`, `(0|1|2)&!2` → `i32`.

So P3/P4 are not "next"; **P4 is the gate on every emit-side consumer**, and it is a lockstep
rewrite (the canon pass's OUTPUT is the string the whole emitter reads). Filed with the
number and the mechanism rather than as a verdict.

### TARGET 2 — the "rep-composition gap" is neither rep-composition nor new

#1118 reported: "the three pin shapes `{v: Pair<i32,string>}` + `Pair<i32|null,string>[]` +
`Box<i32|null>|null` in ONE program emit-fail with `field access receiver is not a struct`,
while their non-generic analogue compiles and runs. Any TWO of the three compose fine. That
is a rep-composition gap." **Three claims; all three are refuted by measurement.**

**1. "Any two compose fine" is false.** The subset matrix, one program per non-empty subset:

| A `{v: Pair<i32,string>}` | B `Pair<i32\|null,string>[]` | C `Box<i32\|null>\|null` | result |
|---|---|---|---|
| ✓ | | | runs |
| | ✓ | | runs |
| | | ✓ | runs |
| ✓ | ✓ | | runs |
| | ✓ | ✓ | runs |
| ✓ | | ✓ | **`field access receiver is not a struct`** |
| ✓ | ✓ | ✓ | **`field access receiver is not a struct`** |

**2. It needs no union, no nullable, no array, no `is`, and no composition of three shapes.**
Minimal reproduction — four lines, one generic, no union anywhere:

```vl
type Box<T> = { a: T, b: string }
const o: { v: Box<i32> } = { v: { a: 1, b: "z" } }
print(o.v.b)
const q: { v: i32 } = { v: 4 }
print(q.v)
```
→ `emitProgram: nested struct fields are not supported`. Shipped as
`tests/cases/generics/type-arg-inline-object-field-collision.vl`, marked `@emit-error`
because that IS the honest current state.

**3. It is not new.** The same program fails identically on **`5eb115d`** — #1117's base,
*before* #1118 — so the `<>` repair did not create it. (#1118's own comma-carrying spelling
`{v: Pair<i32,string>}` was rejected by the CHECKER on `5eb115d`, which is why it looked new:
the fix moved the failure downstream onto a gap that was always there. Method note 34's
control discipline, applied one commit further back.)

**The mechanism, in three parts, each established by a differential run rather than by
reading.** A probe build dumping the registered struct rows at the end of the pass table:

| program | rows registered |
|---|---|
| `{v: Box<i32>}` alone | `#anon0`(a,b) · `#anon1`(v) — both minted from the LITERALS |
| `{v: Box<i32>}` + `{k: i32}` | `{k:i32}` · `#anon1`(a,b) · `#anon2`(v) — runs |
| `{v: Box<i32>}` + `{v: i32}` | `{v:i32}` · `#anon1`(a,b) — **the outer `{v: …}` row is MISSING** |
| `{v: Box}` (non-generic) + `{v: i32}` | `Box` · `{v:Box}` · `{v:i32}` — runs |

1. **`nameFieldCode` (`emit_classify.vl:10423`) has no struct-TABLE rung.** Its tail is
   `nameIsStructDecl(base) → 15`, which scans `TypeDecl` nodes for `tdName == base`. A
   generic alias's `tdName` is `Box<T>`; the APPLICATION `Box<i32>` never matches, so the
   field codes -1 and `internInlineShape` sets `ok = false` and **declines the whole outer
   shape** — the annotation mints no struct row. Its sibling `fieldTypeCode` (line 9396) has
   the missing rung: `!nameIsArray(base) && structIndexOfTypeName(base) >= 0 → 15`. **Probe
   build on `2c5e9cd`, rung added:** a program where the application IS registered
   (`const w: Box<i32>` beside `{ v: Box<i32> }` beside `{ v: i32 }`) COMPILES AND RUNS —
   for the `Pair<i32,string>` comma spelling too.
2. **The application is never registered when it appears ONLY in an interior position.**
   `collectGenAliasShapes` (`emit_collect.vl:3336`) peels `|null` and a trailing `[]` off
   each `TypeRef.tyName` and hands what is left to `gaeEnsure`, so a generic application
   inside an inline-object FIELD is invisible to it — no instance row, and part 1's rung has
   nothing to find. This is why the shipped pin still fails with the rung added while the
   `const w: Box<i32>` variant does not: **parts 1 and 2 are both necessary, and together
   they are sufficient** (measured, both spellings, on `2c5e9cd`).

   A third contributor was live one commit ago and is now closed: `internInlineShape`'s
   top-level-comma split tracked `{`/`[`/`(` depth and NOT `<`/`>`, so
   `{v:Pair<i32,string>}` split into `v:Pair<i32` and `string>` and declined a SECOND,
   independent way. On `faf7de6` the rung-only probe fixed the `Box<i32>` spelling and NOT
   the `Pair<i32,string>` one; on `2c5e9cd` (#1120's `<>` repair) it fixes both. The
   comma-free minimal repro was chosen precisely because it never depended on that half.
3. **The lenient field-NAME-SET scan converts "no row" into "the WRONG row".** With no row
   from the annotation, the outer row is minted lazily from the object LITERAL by
   `structIndexOfObjCtx`, whose scan matches on field NAMES (with f64/i64/nested-struct
   tiebreaks only). It finds the coexisting `{v: i32}` row, so no `#anon` row is minted and
   the literal is built against a field coded i32 — hence `nested struct fields are not
   supported` on the literal, and `field access receiver is not a struct` on `o.v.b`.

That is why "any two of the three compose fine" LOOKED true: the failure needs a SECOND
struct with the same field-name set, and in #1118's three-shape program `Box<i32|null>`
(fields `{v}`) was that second struct. It is a **name-resolution** gap on a generic
application, not a rep-composition one.

**No fix is attempted here**, per the slice's brief. The repair is the two hand-offs below,
which have to land together: half of it (`nameFieldCode`'s rung) is in a file a concurrent
agent owns, and the other half (`collectGenAliasShapes`'s descent) is in this partition but
registers rows that `nameFieldCode` still cannot code on its own.

### Gate

Corpus **byte-, message- AND run-diff**, **1,290 files** (`tests/cases` + `compiler/` +
`std/` + `scripts/*.vl`; compiler stdout/stderr with the out-path normalised, exit codes
compared): **3 byte-diffs, 3 message-diff files, 3 run-diffs — all 3 are the new module
pins**, which master rejects and this build compiles and runs. **0 diffs on all 1,287
pre-existing files** (the frontier `@emit-error` pin is identical on both sides).

The shared-INSTANCE channel (note 32) agrees and classifies the message delta: `vl check
tests/cases` goes from `Found 207 errors, 117 warnings` to `Found 204 errors, 117 warnings`,
and the 3 removed lines are exactly the pins' `cannot assign` rejections — every message
change is a fix, none is a regression. `vl check compiler` and `vl check std` are
byte-identical (0 diff lines).

Fuzz A/B **50,400 programs/side** (14 seeds × depths 4/5/6 × {plain, `--branching --multiobs
--declared`} × 300, generated ONCE by the master compiler so both sides see identical
programs), whole `--out-dir` TREES via `diff -r`, **52,708** output files/side with the
harness's mktemp path normalised: **0 differing paths**. Stated with its caveat above: the
generator emits single files, so this channel is a regression check on the parser-side
additions, not evidence for the merge legs.

`refresh-compiler.sh` RC=0 (1,029,996 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined
failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4,
1,029,996 bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0
(**1,976 passed, 0 failed, 8 ignored** — 1,971 + 3 module pins + 2 tiers of the frontier pin).

### What did NOT move, and the hand-offs

- **`x as T`'s spelling stays dropped.** The merge's `AsExpr` arm rewrites only the operand
  (the cast target is a numeric primitive by the checker's own rule), so there is no consumer
  and recording it would be dead weight (note 19).
- **`tdName` / `udName` keep `modTypeRenamed`.** They are declaration names built from an
  identifier token, not from `parseTypeName`; there is no tree for them and renaming them
  whole is correct.
- **Every emit-side annotation consumer** — blocked on P4, with the 203 / 43 measurement
  above. The order is now forced: P4 (the canon pass rewrites the tree in lockstep with the
  string) before P3, and `nodeTyIx` coverage before the NOSPELL class closes.
- **Hand-off 1 — `nameFieldCode`, `emit_classify.vl:10423`** (a concurrent agent's file), the
  exact diff — the rung its sibling `fieldTypeCode` (line 9396) already has:
  ```
  if nameIsStructDecl(base) { return 15 }
  if !nameIsArray(base) && structIndexOfTypeName(base) >= 0 { return 15 }   // ← add
  -1
  ```
  Verified in a probe build on `2c5e9cd`: with it, a generic application in an inline-object
  field lowers as a nested-struct field **as long as the instance row exists** — both the
  `Box<i32>` and the `Pair<i32,string>` spellings.
- **Hand-off 2 — `collectGenAliasShapes` (`emit_collect.vl:3336`) should descend, not peel.**
  It currently strips `|null` and a trailing `[]` off the rendered name and interns what is
  left; the structural form is a walk of the spelling tree interning every `TS_APP` whose
  head is a generic-alias base, which reaches an inline-object FIELD, a map VALUE and a union
  ARM for free. This is the half that makes hand-off 1's rung find something.

  **They must land together**, and the pin
  (`tests/cases/generics/type-arg-inline-object-field-collision.vl`) is the gate: neither
  half alone flips it, and its `@emit-error` directive turns into `@run` when both do.

### A third report, REFUTED: "generics do not parse inside union variants"

Handed to this slice as a verified bug in `parser.vl`: `union U { A: Box<i32> }` →
``expected an expression but found RBRACE``, `union U { A: Pair<i32,string> }` and
`union U { A: { v: Pair<i32,string> } }` → ``expected `}` but found `>` ``, with "the same
applications parse fine in an alias or a `const` annotation, so the union-variant payload
grammar does not admit a generic application". (#1120's hand-off 4 carries it too.)

**There is no `union` declaration form in VL.** A discriminated union is `type U = A | B`;
`union` is not a keyword and `parser.vl` has no such production. `union U { … }` lexes as
three ordinary top-level expressions — the identifier `union`, the identifier `U`, and an
OBJECT LITERAL — and inside an object literal `Box<i32>` is in EXPRESSION position, where
`<` and `>` are the relational operators. That is the documented, correct behaviour
(`parseTypeAtom`'s own comment: the `<` is unambiguous *in type position*).

The control that settles it carries no generic at all:

```vl
union U { A: i32, B: i32 }
```
→ **parses cleanly**, then `undeclared identifier 'union'` / `'U'` / `'i32'` ×2. The generic
spellings differ only in *where* the expression parse gives up (`>` and `,` instead of the
identifiers), and the newline-separated variants add "expected `}`" because an object
literal wants commas. Nothing about generics, nothing about a payload grammar, nothing to
widen — and therefore nothing that a restriction was protecting.

**What the report was reaching for does exist, and it is not a parse bug.** A generic
application as a real union member type-checks and then miscompiles:

```vl
type Box<T> = { v: T }
type Tag = { t: i32 }
type U = Box<i32> | Tag
const u: U = { v: 3 }
print(2)
```
→ `failed to parse WebAssembly module: type mismatch: expected (ref $type), found (ref
$type)`. Same for `Pair<i32, string> | Tag`. The non-generic control
(`type P = {a: i32, b: string}` + `type U = P | Tag`) runs. That is INVALID WASM out of a
program the checker accepts — the generic-alias soundness bug the concurrent agent is
already diagnosing in `typecheck.vl`, reported here with its non-generic control rather than
duplicated.

### Method notes earned

43. **A "composition" failure is a claim about the CONJUNCTS, and the subset matrix is
    cheap** (#1121) — #1118 reported three shapes that fail together and "any two compose
    fine". Seven programs (one per non-empty subset) refuted it in one run: the pair A+C
    fails, and the minimal repro needs neither of the two shapes the diagnosis leaned on.
    When a bug is reported as "these N things together", enumerate the subsets before
    believing the N.
44. **A frontier inherited from the previous slice needs a control one commit FURTHER
    back** (#1121) — note 34 says a pre-existing gap and a new one are separated by the
    non-generic control. That control said "new" here, because #1118's spelling was rejected
    by the checker on the older build. Running the MINIMISED repro (which the checker always
    accepted) on `5eb115d` said "pre-existing". Minimise first, then date it.
45. **A syntax that does not EXIST parses as something else, and the error points at the
    something else** (#1121) — "generics do not parse inside union variants at any arity"
    was three parse errors from a construct VL has no production for: `union U { … }` is an
    identifier, an identifier and an object literal, and the errors are what
    `Box<i32>` does in EXPRESSION position. The one-line control (`union U { A: i32, B: i32 }`
    — same construct, no generic) parses and reaches the CHECKER. Before widening a grammar,
    check that the grammar has the rule you think you are widening.
46. **The spelling tree's usable LIFETIME is a measurable property, and it ends at the canon
    pass** (D-PARSETY P2) — "the node still has its parser tree" is true at merge time (0
    fall-throughs over 1,288 files) and false at emit time (203 files with no spelling, 43
    with a stale one, 19.1% together). The same sidecar is authoritative in one pass and
    wrong two passes later; a migration's admissibility is a question about WHERE in the
    pipeline the consumer sits, not about the sidecar.

## D-ALIASREF — a one-member alias is TRANSPARENT, and the deferral note was wrong (#1122)

### The bug, at the emitted bytes

```vl
type Box<T> = { v: T }
type Y = Box<i32>          // an alias TO a generic application
const y: Y = { v: 1 }
print(y.v)
```

`vl check` accepts it (one redundant-annotation HINT), `vl build` writes 173 bytes, and the
module **fails to parse as WebAssembly**. `const y: Box<i32> = { v: 1 }` — the same program
without the alias — prints `1`.

The 173 bytes name the mechanism outright, which is why they were read before anything was
theorised:

```wat
(rec (type (;0;) (struct (field (mut i32))))
     (type (;1;) (struct (field i32) (field anyref))))   ;; the UNION BOX
(global (;0;) (mut (ref 1)) i32.const 1 struct.new 0)     ;; cell = box, init = struct
```

The cell is the union box and the initializer is the plain struct. The un-aliased control
emits ONE struct type and no box at all.

The chain, each link measured with an `emitFail` probe rather than read: the parser encodes
every non-`{`-bodied `type N = …` as a **one-member `UnionDecl`** (`parser.vl`: "A single bare
name `type N = A` (no `|`) is also accepted as a one-member union"). `collectU` skips such a
row only when `unionStructAliasShape` matches — a single **inline `{…}` shape** variant — so a
variant that is a NAME (`Cat`) or a generic APPLICATION (`Box<i32>`) is registered:
`unNames.push("Y")`. `isUName("Y")` is then true, `letIsUnion` returns true on the annotation,
and `globalCellKind` returns kind 4. Probe output on master, at `globalCellKind`:

| program | probe |
|---|---|
| `const y: Y = {v:1}` (`type Y = Box<i32>`) | `ann=Y isUName letIsUnion letIsStruct sIdx=0` |
| `const y: Box<i32> = {v:1}` | `ann=Box<i32> letIsStruct sIdx=0` |

### The deferral note, refuted

`singleMemberAliasName` (`typecheck.vl`) already resolved the SCALAR half and its comment
deferred the object half:

> A struct / object / inline-intersection member (`type MyCat = Cat`, `type AB = {a}&{b}`) is
> left as its alias NAME, which **the emitter already resolves through its named-struct /
> `unionStructAliasShape` path** — expanding it to an inline shape here would lose that
> registration (a struct param then reads as an unrecognized inline-object annotation).

The claim is **half right, and the two halves are different constructs**:

| one-member alias | on master `2c5e9cd` |
|---|---|
| `type AB = {a:i32} & {b:i32}` (variant IS a `{…}` shape) | **works** — `unionStructAliasShape` skips the union row, `collectS` interns `AB` |
| `type MyCat = Cat` (variant is a NAME) | `emitProgram: field access but no struct type declared` |
| `type Y = Box<i32>` (variant is an APPLICATION) | **silent invalid wasm** |

Only the intersection has the named-struct route the note credits to all three. The other two
have no route at all, because the row that would carry it is the union row that breaks them.

### The rule, and why it is STRUCTURAL

A one-member alias whose body is a **plain type reference** (bare name or generic application,
`aliasRefIsPlainName`, recorded syntactically in pass 0a because the arena cannot tell
`type MyCat = Cat` from `type AB = {a}&{b}` — both are one `TyUnion` over one `TyObj`) denotes
its member. `nameToTy` and `canonEmitName` read ONE predicate (`singleAliasMemberTyIx`), because
a collapse on one side without the other diverges the checker from the emitter.

The member renders **structurally** (`{v:i32}`), and the nominal alternative was BUILT, not
argued: resolving a declared-struct member to its declared NAME via `structNameOfTy` — which
looks strictly better, keeping nominal identity — **regresses `type MyCat = Cat` and
`type Y = B` straight back to `ref valtype with no interned shape`**. `collectU` still pushes
`Cat` into `uVariants` for the alias row, so the NAME classifies as a union variant box. The
named route is poisoned; only the inline shape resolves. (Note 33's shape: the better-looking
derived value was wrong, and only building it said so.)

### Entombment — the gate is load-bearing and the CORPUS already holds its pin

**S-ALIASGATE**: drop `isPlainAliasRef`, so the `TyObj` arm collapses every one-member object
alias including the intersection; everything else identical.

| build pair | corpus (1,291 pre-existing files) byte / msg / run | suite |
|---|---|---|
| shipped vs base `25e3790` | **0 / 0 / 0** | 1,974 passed |
| shipped vs **S-ALIASGATE** | — | **2 failed**: `types/intersection-object-merge.vl` |

S-ALIASGATE turns `type AB = {a:i32} & {b:i32}` into the inline shape, the named-struct
registration is lost, and a param typed `AB` fails with `emitProgram: only i32, i64, f64, f32,
boolean, struct, union, array, or string parameters are supported` — **the exact regression the
deferral note predicted, for the one construct where the note is right**. No new sabotage
fixture was needed: the pre-existing corpus already pins it.

### Channels

| channel | volume | result |
|---|---|---|
| corpus byte / message / run | 1,291 pre-existing files | **0 / 0 / 0** |
| corpus, with the 4 new fixtures | 1,294 files | **3 differ** — exactly the 3 pins (comparator sanity: not vacuous) |
| fuzz A/B (32 fixed seeds x 4 legs) | **25,600 programs/side**, 3,519 output files/side | **tree-identical** (2 `.err` lines differ: the compiler's OWN wasm function indices, shifted by 3, inside a pre-existing identical trap backtrace) |
| `vl check` message stream | 1,294 files | **0 differ** — master's checker accepts all three pins; that IS the bug |

The `check.out` zero is the finding worth restating: the corpus's whole check channel cannot
see this class, because the checker was never the thing that was wrong.

### Method notes earned

47. **Read the emitted BYTES before theorising about a miscompile** (D-ALIASREF) — "173 bytes
    suggests a nearly-empty module" was the brief's guess; the module was complete and the
    disassembly named the defect in two lines (a global typed at the union box, initialized
    with a plain `struct.new`). One `wasm-tools print` replaced the entire hypothesis stage.
48. **A deferral comment is a claim about a POPULATION, and populations get lumped** (#1122)
    — one comment deferred "struct / object / inline-intersection" as a unit on the strength
    of a route only the intersection has. Two of the three constructs it protected were
    already broken, one of them into invalid wasm. When a note defers several shapes with one
    justification, test the justification against EACH shape.
49. **The strictly-better refinement is a hypothesis; build it** (#1122) — resolving a
    struct-member alias to its nominal NAME instead of a structural shape is obviously right
    and is wrong here, because a row upstream had already claimed the name. Cost of finding
    out by building: one 40-second self-compile.

## D-UNIONGEN — a generic APPLICATION as a union MEMBER, and a union that cannot be discriminated (#1123)

A bug-fix slice, not a destringify one. #1122 fixed the ONE-member alias
(`type Y = Box<i32>`) and recorded, as its own top "left unfixed" item, that the
multi-member union path was untouched. It was: the same defect, one member over.

### TARGET 1 — the reported miscompile, read off the bytes

```vl
type Box<T> = { v: T }
type Tag = { t: i32 }
type U = Box<i32> | Tag
const u: U = { v: 1 }
```

`vl check`: one unused-variable WARNING. `vl build`: a 173-byte module. That module does not
parse as WebAssembly. `wasm-tools print` on it, beside the non-generic control
(`type Plain = {v:i32}`), is the whole diagnosis:

```wat
(global (mut (ref 2)) i32.const 1 struct.new 0)                            ;; defective
(global (mut (ref 2)) i32.const 1 i32.const 1 struct.new 0 struct.new 2)   ;; control, prints 1
```

Type 2 is the union box `(struct (field i32) (field anyref))`, type 0 the plain `{v:i32}`
struct: the CELL is the box and the INITIALIZER is the payload alone. `collectU` asks
`isStructAtom` whether a member is a struct variant; that answers from `TypeDecl` NAMES, and a
generic alias declares `Box<T>`, never `Box<i32>` — so the member never entered `uVariants`
while the alias still entered `unNames`. `globalCellKind` then classified the annotation as the
union box (`letIsUnion` ← `isUName`), and `emitUnionCoerce`'s `ObjLit` arm found no matching
arm (`unionArmVariantForObj` −1, `objVariantName` "") and fell through to plain `emitExpr`.

The fall-through is the shape of the defect, and it is not confined to a global: a local, an
argument, a return and a reassignment each reach it through their own ladder, and each emitted
an invalid module (pinned in `union-member-generic-application.vl`).

### The fix, and why it is STRUCTURAL — for the reason #1122 measured

`canonEmitTypeNames`'s `UnionDecl` arm resolves a generic-application member of a MULTI-member
union to its instantiated shape (`unionMemberGenAppShape` → `nameToTy` → `tyToEmitName`), so
`Box<i32> | Tag` reaches the emitter as `{v:i32} | Tag`. That is not a new vocabulary:
`type U = {v:i32} | Tag` compiles and runs today, and so does `type A = Box<i32>; type U = A |
Tag`, which arrives at the SAME shape through #1122's one-member rule. The nominal alternative
is the one #1122 already built and measured as a regression; nothing was re-run blind.

One-member unions are excluded — #1122 already makes them transparent, and expanding the
variant would additionally hand `unionStructAliasShape` a shape to register as a named struct.

`IsExpr.isVariant` follows for the same population, gated on the OPERAND's checked type being a
`TyUnion` — read off `nodeTyIx`, the typed-IR bank, with **no new sidecar**. The gate is
load-bearing: a NULLABLE operand (`b: Box<i32> | null`) carries no `UnionDecl`, keeps the
application NAME in its annotation, and `is Box<i32>` already resolves there through
`nullablePartOf`; rewriting it would trade a working spelling for a broken one. Both spellings
in ONE program is pinned (`x01`, in the report below).

### TARGET 2 — the sweep found a SECOND live miscompile, with no generics in it

Enumerating the type positions turned up `type U = {v:i32} | {v:string}` — two variants with the
same field NAMES and different field TYPES. On master that emits a module whose global
initializer pushes a string-array ref into an i32 field and whose two `is` tests both compare
against tag 0. Silent invalid wasm; `type A = {v:i32}; type B = {v:string}; type U = A | B` does
the same. `variantSig` — the tag key — IS the field-name join, so the two variants rank
identically, and the literal → variant resolution matches by field-name set alone.

VL's structural unions discriminate on the field-name set (`docs/guide/unions.md`), so such a
union has no sound representation. `assignTags` now rejects it loudly, naming the union and both
variants. Layout-EQUAL same-name variants stay legal (they are one variant; the twin machinery
folds them). The same reject is what keeps the generic fix honest: `type U = Box<i32> |
Box<string>` expands into exactly this shape, and without the reject the fix would have turned
one clean error into invalid wasm.

`assignTags` also stops recomputing `variantSig` inside its O(n²) rank loop (banked once).

### The type-position table (measured on `adbe6f0`, generic application `Box<i32>` in each)

| position | master | shipped |
|---|---|---|
| alias RHS `type A = Box<i32>` | works (#1122) | works |
| **declared union member** `type U = Box<i32> \| Tag` | **INVALID WASM** | works |
| … + inline-shape / scalar / `null` / second application member | **INVALID WASM** | works |
| … local / arg / return / reassign / struct-typed ident into the union | **INVALID WASM** | works |
| **`is` operand** on a union alias | clean error | works |
| **map value** `{[string]: Box<i32>}` | clean error | works |
| array element `Box<i32>[]` | works | works |
| inline-object field `{ b: Box<i32> }` | works | works |
| param / return / type-arg-to-generic / intersection operand | works | works |
| nullable `Box<i32> \| null` (INLINE spelling) | works | works |
| inline union annotation `Box<i32> \| Tag` (no alias) | clean error | clean error |
| declared struct field `type S = { b: Box<i32> }` | clean error | clean error |
| generic fn param `function f<T>(b: Box<T>)` | clean error | clean error |
| `as` operand | checker error — `as` is numeric-only for a NAMED struct too | same |
| `!= null` after a definite assign | checker error — same for a NAMED struct | same |

Every INVALID-WASM cell is gone, and the two `as` / `!= null` cells are refuted as generics
gaps by their non-generic controls.

### Channels

| channel | volume | result |
|---|---|---|
| corpus byte / message / run | 1,263 pre-existing files | **0 / 0 / 0** |
| corpus, with the 6 new fixtures | 1,269 files | **5 differ** — exactly the 5 behaviour pins (comparator sanity: not vacuous) |
| fuzz A/B (21 fixed seeds x 4 legs) | **25,200 programs/side** | **tree-identical**, 1,497 findings each side |
| suite | 1,391 passed / 0 failed | — |

### Left unfixed, with the mechanism for each

- **Inline union spelling** `const u: Box<i32> | Tag` — pinned `@emit-error`. The members live
  in one `TypeRef` name canonicalized by `canonEmitName`'s union arm, which is deliberately NOT
  given the rewrite: that same arm canonicalizes `Box<i32> | null`, whose nullable-niche
  lowering resolves the application through its NAME today.
- **Declared struct field** `type S = { b: Box<i32> }` — needs BOTH halves, and the split was
  measured: adding `const w: Box<i32>` to the program (which interns the instance) still fails,
  so `nameFieldCode`'s missing `structIndexByName(base) >= 0 → 15` rung (`emit_classify.vl`) is
  independently necessary. The map-value cell needed only the registration half, which is why
  it moved and this one did not.
- **`is` through a one-member alias** (`type BoxI = Box<i32>; u is BoxI`) — `isVariant` is
  rewritten only for a generic APPLICATION, not for a transparent alias NAME. Extending it to
  `singleMemberAliasName` would also rewrite `is MyCat` where the union's variants are nominal,
  changing a message without fixing anything.
- **Generic FUNCTION with a generic-application param** (`function f<T>(b: Box<T>)`) —
  `emitProgram: monomorphize: unsupported argument type`.
- **Union cell initialized from another GLOBAL or a CALL** (`const u: U = p` at module scope) —
  `ref valtype with no interned shape`, and the NON-generic control fails identically. Not a
  generics gap.
- **Recursive generic alias** (`type L<T> = { head: T, tail: L<T> | null }`) — the compiler
  CRASHES (a wasm trap, not a diagnostic) with or without a union, on master and on this build.
  Because the checker cannot instantiate one at all, the new structural render can never be
  handed a cyclic object.

### Method notes earned

50. **The sweep is where the second bug is** (#1123) — enumerating the type positions to
    complete a table turned up a live silent miscompile (`{v:i32} | {v:string}`) that has
    nothing to do with the construct under repair, and that the fix would otherwise have made
    REACHABLE from a previously-erroring program. A fix measured only against its own repro
    would have shipped it.
51. **Ask which HALF of a two-part gap you actually closed** (#1123) — the interior-position
    registration gap and the field-code gap look like one bug ("a generic application in an
    interior position doesn't resolve"). Adding an unrelated `const w: Box<i32>` to each program
    separates them in one measurement: the map value starts working, the struct field does not.

### D-UNIONGEN addendum — the `is`-gate pin, and a composed program that still fails

The `IsExpr` gate's guard is pinned as its own program
(`union-member-generic-application-is-gate.vl`): a declared-union operand and a NULLABLE
operand testing the SAME `is Box<i32>` in one module. An ungated rewrite compiles the first and
breaks the second, and no other shape can tell them apart.

One composed program still fails on BOTH sides, and the bisect is recorded so the next slice
does not redo it. Take the mixed pin's five constructed unions (`UShape` / `UScalar` / `UNull` /
`UTwo` / `UAlias`, each carrying a `{v:i32}` variant, each with its own `const` + narrowed read)
and append the is-gate pin's two functions: master rejects at `viaUnion`'s `is`, this build
rejects one line later at `viaNullable`'s (`narrowed receiver names no union variant`). Not a
regression — the fix moves the failure, it does not create it.

The bisect that narrows it: the same two functions beside ONE, TWO, … FIVE of those union
DECLARATIONS all compile and run on this build (and all fail on master). So it is not the count
of `{v:i32}` variant rows in `uVariants`, nor any single member kind — it is the composition
with the CONSTRUCTED-and-narrowed globals. That is where to start.

## D-FIELDCODE — the FIELD-CLASSIFICATION tables get ONE home (#1123)

`repRowOfTyLenientRow`'s own comment (emit_classify.vl) names the target and the cost:

> the field-code vocabulary has exactly two producers, both string-driven —
> `nameFieldCode(t: string)` over a rendered type and `fieldTypeCode(tyIx)` over an AST
> `TypeRef` node's `tyName` — and no `Ty`-arena classifier, so an arena tightening would
> mean a THIRD hand-copied copy of a 34-arm table (the exact drift hazard D-ABIDEDUP had
> just removed).

Two hand-copied copies of one ladder is two copies of every parse in it. This slice makes
the field-code table, and the field-ELEMENT-name table below it, single-homed. It is
D-ABIDEDUP's move applied to the field layer: **NET −9 on the parser list, −28 counting
every type-name classifier**. (A first draft of this line called it the program's largest
single-file parse deletion. It is not — D-ELEMROW/D-UARMSLOT (#1116) scored NET −24 with 17
parses deleted. The correction is recorded rather than silently applied, on this doc's
standing rule that a superlative is a measurement.)

### The enumeration, and the counting method

Local-aware, **by resolver actually called**, over `compiler/emit_classify.vl` alone (this
slice's whole partition). Line comments and string literals are blanked before matching;
the resolver's own definition header is excluded. The list is the SCORECARD CORRECTION's
parser list plus D-ARROWTY's four additions (`refArrElemKind` / `nameIsI32ListArray` /
`nameIsMapArray` / `nullClosureArrElem`).

**328 parse call sites** in `emit_classify.vl` at master `adbe6f0`. (D-ARROWTY measured 331
in this file at #1118's base; #1120–#1122 took three.)

The four functions this slice touches, and what they held:

| function | parser-list sites | every type-name classifier |
|---|---|---|
| `fieldTypeCode(tyIx)` — the NODE entry point | 8 | 24 |
| `nameFieldCode(t)` — the SPELLING entry point | 9 | 25 |
| `fieldRefElemName(tyIx)` — the NODE element-name recorder | 6 | 7 |
| `shapeFieldElemName(ftxt, code)` — the SPELLING element-name recorder | 9 | 11 |

`fieldTypeCode` and `nameFieldCode` are the same 34-arm ladder written twice, and the two
copies do **not** agree on arm ORDER: `fieldTypeCode` tests the nullable-list group (18 /
28 / `nulScalarListFieldCode`) ahead of the map group (19 / 29) and `nameFieldCode` tests
them the other way round. `fieldRefElemName` and `shapeFieldElemName` are the same
code-dispatch written twice, with three arms that genuinely differ and four that do not.

### The shape

One table, two entry points, and the ONE arm whose *evidence* differs is a parameter:

```
function fieldCodeOfSpelling(t: string, litNode: i32)   // the 34 arms, once
export function nameFieldCode(t: string)                // + the 2 name-driven closure arms
export function fieldTypeCode(tyIx: i32)                // + the 2 ARENA closure arms
                                                        // + the inline-shape tail
```

`litNode >= 0` is an AST node index and the literal-union arm is answered from the
checker's recorded type (`nodeTyIsLitUnionAlias` — no parse); `litNode < 0` means there is
no node and the spelling answers (`nameIsLitUnionType`). Passing the NODE rather than a
precomputed flag is what keeps the arm lazy on both paths — a `boolean` parameter would
have made every `"i32"` field pay for a literal-union verdict the scalar arms above settle.

`fieldRefElemName` keeps exactly the three arms where the node recorder is not the shape
recorder, and delegates the other four:

| code | node recorder | shape recorder | disposition |
|---|---|---|---|
| 15 nested struct | NOMINALIZES (`structIndexOfTypeName` → `sNames[idx]`) | records the spelling | **kept** — S4 reddens |
| 28 nullable ref-list | no deferred fallback | deferred `[]`-slice fallback | **kept** |
| 0 / 30 litunion atom + niche | `""` | records the union name | **kept** |
| 16 / 19 / 29 / 4 | identical | identical | delegated |
| 5 ref-list element | `refArrElemName` else raw `[]`-slice, UNGATED | same, gated on `nameIsArray` | delegated — **the gate is implied**: code 5 is only ever assigned under `nameIsArray`, so the two fallbacks have the same domain |

### The measurement — probes on BOTH entry points, sabotage-verified on both channels

Additive probe: master's ladder and the candidate computed side by side at every call, the
master answer returned, disagreements counted and reported at the end of a successful
`emitProgram` (the report is the first `emitFail`, so it is never masked).

| probe | corpus reaches | fuzz reaches | **disagreements** |
|---|---|---|---|
| P1a `fieldTypeCode` (NODE entry) | 3,851 | 11,829 | **0 / 0** |
| P1b `fieldRefElemName` (NODE element name) | 3,865 | 12,780 | **0 / 0** |
| P2 `nameFieldCode` (SPELLING entry) | 7,825 | 60,321 | **0 / 0** |

**100,471 comparisons, 0 disagreements.** Corpus = 1,294 files, of which 1,102 reach
`emitProgram`'s end and report; fuzz = 50,400 programs for P1a/P1b (48,093 report) and
14,400 for P2 (13,700 report).

Comparator sanity (method note 12) — the SAME harness, against a candidate perturbed to
disagree on every reach:

| sabotage of the comparator | corpus | fuzz |
|---|---|---|
| P1a candidate `= master + 1` | **3,851 / 3,851** | **3,378 / 3,378** (14,400 programs) |
| P1b candidate `= master + "X"` | **3,865 / 3,865** | **3,580 / 3,580** |
| P2 candidate `= master + 1` | **7,825 / 7,825** | **60,321 / 60,321** (14,400 programs) |

100% of reaches on both channels: neither probe is a dead comparator, and neither channel is
dark.

### Entombment — one seam reddens, three are inert and one is inert BY CONSTRUCTION

The change is behaviour-preserving, so it cannot have a fails-on-master test. Each sabotage
below is applied to the SHIPPED build and diffed against it over the corpus (byte, message
AND run):

| sabotage | corpus byte | msg | run | fuzz tree-diff |
|---|---|---|---|---|
| S1 the NODE entry stops using its arena literal-union verdict (`fieldCodeOfSpelling(tyName, -1)`) | 0 | 0 | 0 | 0 / 21,600 |
| S2 the shared table restores master `fieldTypeCode`'s arm ORDER | 0 | 0 | 0 | — |
| S3 `fieldRefElemName` stops guarding the atom codes (0 / 30 delegate) | 0 | 0 | 0 | **0 / 21,600** |
| **S4 `fieldRefElemName` stops NOMINALIZING a nested-struct target (15 delegates)** | **1** | **1** | **1** | — |
| S5 `fieldRefElemName`'s code-28 arm delegates (gains the deferred `[]`-slice fallback) | 0 | 0 | 0 | **0 / 21,600** |

- **S4 is the pin.** `tests/cases/closures/twin-fieldset-closure-field-string-vs-bool-result.vl`
  stops building — `emitProgram: nested-struct field element type is not interned` — because
  an inline-shape nested-struct field recorded its SPELLING instead of the interned struct's
  name, and every nominal-keyed use site (`structIndexByName`) then missed. So the one arm
  where the node recorder is deliberately *not* the shape recorder is load-bearing, and the
  merge is not over-merged.
- **S2 is inert by construction and is stated as such**, not as evidence. It is method note
  8's case: the arm order is exactly the equivalence P1a measured over 15,680 comparisons,
  so perturbing it does not leave the equivalence class. It is recorded because it is the
  one difference between the two former copies, and its inertness is the reason a single
  table could exist at all.
- **S1, S3 and S5 are inert on BOTH channels** — 1,294 corpus files and 21,600 fuzz
  programs each — so **no pin can exist for them today**, stated plainly as #1114 and #1119
  did. S1 says the node's arena literal-union rung and the spelling test agree everywhere
  either channel reaches; the rung is kept because it is the destringified one, not because a
  channel can see it. S3 and S5 say the code-0/30 and code-28 differences between the two
  element-name recorders are unobservable; they are kept because they are documented,
  deliberate distinctions and merging them would be a behaviour change this slice is not
  making. (Both sabotages leave the equivalence class — S3 makes a code-0 field record its
  union name where it recorded "", S5 makes an unresolvable code-28 element record a raw
  `[]`-slice where it recorded "" — so this is not method note 8's false null.)

### The work, counted not timed (method note 15)

The one thing this slice CHANGES at runtime is the node path's arm order: the map group
(19 / 29) now runs ahead of the nullable-list group (18 / 28 / `nulScalarListFieldCode`),
because the single table keeps the spelling entry point's order. Both compilers were
instrumented identically — a tick at each of the ten parse helpers the table calls — and run
over the same corpus:

| | executions of the ten helpers, whole corpus |
|---|---|
| master | 8,616,290 |
| now | **8,616,134** |
| | **−156** |

1,102 files report on both sides (identical population). Per file: **7 better (−208), 6 worse
(+52)**, and the direction of each is the arm order plus the `nulMapInnerName` CSE, exactly:
`structs/nullable-map-field.vl` −84 and `structs/declared-nullable-struct-map-field.vl` −44
(a nullable-map field no longer parses its inner map name twice, and no longer walks three
nullable-list arms first); `structs/nul-distinct-scalar-list-field.vl` +24 and
`arrays/struct-field-nullable-struct-elem-array.vl` +12 (a nullable-list field now walks the
two map arms first). A net win, and small enough in both directions that no honest wall clock
would have shown it.

### The call arithmetic

`emit_classify.vl` only; no other file changes.

| resolver | master | now | delta |
|---|---|---|---|
| `mapValNameOf` | 30 | 27 | **−3** |
| `refArrElemName` | 31 | 30 | **−1** |
| `nameIsMap` | 25 | 24 | **−1** |
| `nameIsMapMemberUnion` | 16 | 15 | **−1** |
| `nameIsArray` | 18 | 17 | **−1** |
| `nameIsStringArray` | 14 | 13 | **−1** |
| `nameIsI32Array` | 10 | 9 | **−1** |
| **parser-list TOTAL** | **328** | **319** | **NET −9** |

Counting every type-name classifier the four functions call, not only the parser list, the
18 further predicates (`nameIsString`, `nameIsF64Array`, `nameIsI64Array`, `nameIsF32Array`,
`nameIsNulI32List`, `nameIsNulRefList`, `nulScalarListFieldCode`, `nulMapInnerName`,
`nameIsNulString`, `nameIsNulBool`, `nameIsNulLitUnion`, `isValueUnionName`, `isUName`,
`nameIsStructDecl`, `nameIsLitUnionArray`, `nameIsNulClosure`, `mvValKindOfName`,
`nulLitUnionInnerName`) go **141 → 122, −19**. Total type-name classifier calls deleted from
the file: **28**.

- **Type-string PARSES deleted: 9** (parser list) / **28** (every classifier). No laddering:
  the two entry points are entry points, not rungs, and neither gained a fall-through.
- **Parses ADDED: 0. Sidecars added: 0. Consumers laddered: 0.**
- **Name-keyed RESOLUTIONS deleted: 0; one delegation edge ADDED**
  (`fieldRefElemName` → `shapeFieldElemName`), which retires 5 hand-copied arms.
  `structIndexOfTypeName` stays at 22 calls: both of its uses in these functions are the
  NODE-only arms (the inline-shape tail, and the code-15 nominalization S4 pins).
- One redundant recomputation deleted from the PATH: `nulMapInnerName(t)` was evaluated
  twice per reach in each copy.
- Source: **147 insertions, 212 deletions** (−65 lines).
- Binary: 1,030,554 → **1,029,445** bytes (**−1,109**).

### What did not move, and the mechanism

- **`nameIsRefArray` (19 call sites in this file; 28 tree-wide — 19 here, 7 in
  `emit_collect`, 2 in `wasmEmit`, and every raw hit in `emit_base` / `emit_rep` /
  `typecheck` is a comment).** Untouched, and not for want of trying: it is not a spelling
  predicate. It folds INTERN STATE into its answer — `structIndexByName`,
  `shapeElemDeclaredStructIdx`, `variantIndexOf` and a scan of `unNames` all sit inside it —
  so no structural reading of a type can be its dual, and its call sites take arbitrary
  strings rather than nodes. Deleting it needs the *element* layer's slot to be banked at the
  intern site, which is `emit_state.vl`/`emit_rep.vl` state, not this partition's.
- **`annParamKind` / `annRetKind`** look like the next twin pair (5 + 10 parser-list sites)
  and are not one: `annRetKind` carries litunion / `void` / map / union-split arms that
  `annParamKind` has no counterpart for, and their shared arms differ in order for a reason
  (`annRetKind` must claim a literal-union result before the union split). Merging them would
  be a behaviour change, not a dedup.
- **`fieldTypeCode`'s remaining `structIndexOfTypeName` tail** is the inline-shape bridge and
  belongs to the node entry point alone — the spelling entry point's inline shapes are
  interned by the annotation pass instead.
- **The `nulMapInnerName` → `mapValNameOf` → `mvValKindOfName` chain inside the one table**
  is now the richest remaining parse cluster on the field path (3 parser-list calls in one
  arm, plus a 13-parse callee). Its dual is a map-value KIND banked at the mv intern site —
  `mvValKind[slot]` already exists as a column; what is missing is a name→slot lookup ahead
  of the classifier. That is `emit_state.vl`/`emit_collect.vl` work.

### Hand-off

The "THIRD hand-copied copy" objection in `repRowOfTyLenientRow` is now a **SECOND**, and
does not have to be a copy at all: an arena field-code classifier is a third `litNode`-style
parameter on `fieldCodeOfSpelling` (or a pre-rung ahead of it), not a new ladder. The
tightening `repRowOfTyLenientRow` declines to reproduce — `shapeFieldTypeCompat`'s field-CODE
test — is therefore reachable from the arena side for the first time.

Exact diff for whoever takes it: `fieldCodeOfSpelling(t: string, litNode: i32)` at
`compiler/emit_classify.vl`; the arm to extend is

```
  if litNode >= 0 {
    if nodeTyIsLitUnionAlias(litNode) { return 0 }
  } else {
    if nameIsLitUnionType(t) { return 0 }
  }
```

— every other arm is a pure function of the spelling and will need its own arena reading
before the table can answer without one.
## D-PARSETY P3 — the emit-authority question, ANSWERED, and the fourth string-only spelling (#1126)

The brief: close the gating item #1121 measured — make the parser's spelling tree
EMIT-authoritative (0 missing, 0 stale) by (2) giving emitter-SYNTHESIZED `TypeRef` nodes a
spelling at synthesis and (3) making the canon pass rewrite the tree in lockstep. Enumerate
both populations first, do not inherit #1121's numbers.

**The enumeration is done and it refutes step 2, extends step 3, and says the partition cannot
reach either.** What ships instead is the FOURTH string-only type spelling — `x as T` — whose
deferral note in #1121 was wrong, and whose merge consumer was missing, making `as` unusable
with any named type in module mode.

### The two populations, enumerated — counting method stated

Corpus: **1,298** `.vl` files — `tests/cases/**/*.vl` (1,267, including this slice's 4 new pin
files) + a pinned `adbe6f0` snapshot of `compiler/*.vl` (25) + `std/*.vl` (4) + `scripts/*.vl`
(2). Each built INDIVIDUALLY (`vl build <file> --compiler <probe>`).

Two sweep points, both inside `emitProgram` (`emit_sections.vl`), reported through the emit
ERROR channel — the compiler wasm is instantiated with an EMPTY linker (`main.rs:279`) and has
no print imports, so a probe cannot `print`:

- **ENTRY** — immediately before the ordered pass table.
- **FINAL** — after the last pass, immediately before `emitModule`.

#1121 probed at `collectA`, which is the THIRD pass; `collectA#2`, `synthParamAnnots`,
`collectMapFilterUse` and the mono clones all mint annotations after it. FINAL is the superset
and is why these numbers are larger than #1121's 203/43.

**1,120 files reach both sweeps**; 178 never reach emit (144 type errors, 30 parse errors, 4
emit errors) and are outside every count below.

| | ENTRY | FINAL |
|---|---|---|
| `TypeRef` nodes swept | 58,586 | **59,809** |
| tree present AND `tsToName(root) == tyName` | 58,475 | 58,475 |
| **NOSPELL** — no recorded spelling | **0** | **1,223** (261 files) |
| **STALE** — recorded spelling renders a DIFFERENT name | **111** (46 files) | **111** (46 files) |
| no recorded `nodeTyIx` | 14 (9 files) | **14** (9 files) |

Files carrying either at FINAL: **305 of 1,120 = 27.2%.**

Two structural facts fall straight out of the two-point sweep, and a single-point probe cannot
see either:

- **Every NOSPELL node is minted by the EMITTER.** `nospell = 0` at ENTRY, on all 1,120 files.
  The parser + module merge hand emit a 100%-covered tree; the hole is dug afterwards.
- **Every STALE node is stale before emit STARTS.** ENTRY == FINAL == 111. The canon pass is
  the sole producer, exactly as the brief said.

### NOSPELL, attributed to its 31 synthesis sites

`mkTypeRef` has **three** call sites in the whole compiler: `parser.vl:379` (`parseType`),
`parser.vl:1328` (a struct field's type), and `emit_classify.vl:8349` (`synthTypeRef`). So the
entire NOSPELL population comes through ONE funnel. Instrumented per CALL SITE of that funnel
(a probe column keyed by node index, 31 sites reached over the 1,294-file pre-pin corpus):

| site | nodes | files |
|---|---|---|
| `emit_rewrite:606` — `synthParamAnnots`, `resolveShapeToNominal(nodeTyName(param))` | **466** | 145 |
| `emit_mono:912` — instance PARAM pin (`pinned[pj]`) | 176 | 39 |
| `emit_rewrite:421` — `synthRetAnnots`, union-alias return | 150 | 67 |
| `emit_mono:909` — instance PARAM pin | 134 | 31 |
| `emit_mono:942` — instance RETURN pin (`rs`) | 70 | 27 |
| `emit_rewrite:444` — element-value-union list return | 47 | 16 |
| `emit_rewrite:428` — nullable-ref return | 42 | 20 |
| 24 further sites (`emit_rewrite` ×11, `emit_mono` ×12, `emit_collect` ×1) | 138 | — |

### REFUTATION 1 — "the synthesizing pass knows the structure" is FALSE, and the structure is ALREADY banked

The brief's step 2 is the bank-at-the-producer move applied to node creation. It does not
apply, for a reason the attribution makes exact: **the synthesis sites take a RENDERED name.**
`emit_rewrite:606` is `synthTypeRef(resolveShapeToNominal(nodeTyName(ps[pi])), -1)`, and
`nodeTyName` (`typecheck.vl:13770`) is `tyToStr` / `tyToEmitName` over `T.tys`. That is
#1117's **arc 2** — `arena → tyToEmitName → parse` — not the parser arc. What the pass knows
is an ARENA INDEX, which it renders; deriving a spelling tree from the rendered result is a
parse, the thing this program exists to delete.

And the arena index is already banked on the node. `synthTypeRef` calls
`recordClonedNodeTy(n, name)`, which writes `nodeTyIx`. Measured:

- of the **1,217** NOSPELL nodes an arena-reading probe could evaluate, **0** had no recorded
  arena type;
- over ALL **59,809** `TypeRef` nodes at FINAL, **14** (9 files) lack one — `i32` ×12,
  `{[string]:boolean}` ×1, `S[]` ×1. **`nodeTyIx` is 99.977% total at emit time.**

So a spelling on these nodes would be a THIRD encoding of a type that already has two, bought
with a parse. **The emit-side consumers are not blocked on the spelling tree; the column that
is total for them is `nodeTyIx`.** That is a redirection of the brief's gating claim, filed
with its number.

### REFUTATION 2 — the canon pass makes `nodeTyIx` STALE TOO, on 24% of the same rows

Step 3's mechanism is right. Its SCOPE is not: the same rewrite that leaves the tree describing
the pre-canon name leaves the C1 typed-IR describing it too. Of the 111 STALE nodes,
`tyToEmitName(nodeTyIxOf(node))` reproduces

| | rows |
|---|---|
| the CANON'd name (agrees with `tyName`) | 84 |
| the PRE-CANON spelling (agrees with the TREE) | **27** |
| neither | 0 |

and every one of the 27 carries a literal-union ALIAS name: `{f:K0|f64}` vs `{f:string|f64}`,
`K0|{w:i32}` vs `string|{w:i32}`, `(K0|i64)[]` vs `(string|i64)[]`,
`{[string]:K0|i64|{q:i64}}` vs `{[string]:string|i64|{q:i64}}`. `tyToEmitName` widens a literal
union in place but does NOT resolve an alias TO one; `canonEmitName` does both.

So P4 is not "the canon pass rewrites the tree in lockstep". It is **"the canon pass hands its
result to every derived column"**, and the typed-IR the C1 endgame is built on is one of them.
Note 46's lifetime statement generalises: the canon pass ends the usable lifetime of every
sidecar recorded before it, not just the parser's.

The 56 distinct rewrite pairs, for whoever builds the structural canon:
`0|1|2`→`i32` (7) · `"x"|7`→`string|i32` (6) · `0|1`→`i32` (5) · `"a"|"b"`→`string` (5) ·
`{f:K0|f64}`→`{f:string|f64}` (5) · `Y`→`{v:i32}` (4) · `"world"`→`string` (4) · `Id`→`i32` (4) ·
`(0|1|2)&!2`→`i32` (3) · `1.5|2.5`→`f64` (3) · `AB|null`→`{t:i32,a:i32}|{t:i32,b:i32}|null` (2) ·
`i32|(2|3)&!3`→`i32` (1) · `{tag:"circle"|"square",r:i32}`→`{tag:string,r:i32}` (1) · … .
Three shapes are needed: literal → base (leaf rewrite), alias → member (SUBSTITUTE the
alias's recorded tree — `udTsRoot` already holds it for every `type N = …` member, P2), and
union-member DEDUPE after widening (a structural change, not a leaf rewrite).

### REFUTATION 3 — the partition cannot reach either population, and partial closure is worth nothing

`synthTypeRef` lives in `emit_classify.vl`; its 35 call sites are in `emit_rewrite.vl`,
`emit_mono.vl` and `emit_collect.vl`; `canonEmitTypeNames` / `canonEmitName` live in
`typecheck.vl`. Every one is another agent's this cycle. Nothing in `parser.vl` / `ast.vl` /
`driver.vl` can write a spelling at a synthesis site or rewrite the canon's output.

And the obvious partial move is worth **nothing**, which is worth stating because it looks
attractive: `emit_mono.vl` is unclaimed and accounts for **433 of the 1,223** NOSPELL nodes
(35%), and `setAnnTs` is exported from `ast.vl`, so those sites COULD be banked without
touching a claimed file. But a consumer migrates only when its column is TOTAL for it — a
`collectA` site over `nd.tyName` cannot read the tree on 65% of the population and the string
on the rest without keeping the string path alive, which is the fall-through it was supposed
to delete. Coverage that is not total unblocks no consumer. Not done, deliberately.

### What DID close: `x as T`, the fourth string-only spelling — and a module bug

#1121's P2 recorded three of the four type spellings the parser builds and drops, and deferred
the fourth with a reason:

> **`x as T`'s spelling stays dropped.** The merge's `AsExpr` arm rewrites only the operand
> (the cast target is a numeric primitive by the checker's own rule), so there is no consumer
> and recording it would be dead weight (note 19).

**The reading of the checker's rule is wrong.** `checkCastNode` (`typecheck.vl:16013`) requires
that the target RESOLVE to a numeric scalar — `primNameOf(nameToTyAt(n.asTy, ix))` ∈
{i32,i64,f32,f64} — and a user ALIAS resolves. `type Id = i32` + `x as Id` is a legal
single-file program that has always run. The merge renames the DECLARATION to `Id$mN` and left
the cast spelling alone, so the consumer was not absent: it was MISSING.

Reproduced on `adbe6f0` and re-verified on the parent `3b1fad4`, every module shape, each
with its single-file control running:

| program | master |
|---|---|
| alias declared in a non-entry module, cast there | ``unknown type `Id` in `as` cast`` |
| alias EXPORTED and imported, cast in the entry module | ``unknown type `Id` in `as` cast`` |
| alias declared in the ENTRY module, cast there | ``unknown type `Id` in `as` cast`` |
| alias reached through a CHAIN (`Count` → `Base` → i32) | ``unknown type `Count` in `as` cast`` |
| target is the primitive `i32` | runs |

**`as` was unusable with any named type in module mode.** Shipped:

- **`parser.vl`** — `parseAsType` stops dropping its root; it rides `lastTyTsRoot` (P2's
  one-slot channel) and the `as` loop banks it on the `AsExpr` node the moment it is minted, so
  `annTsNode` stays strictly increasing.
- **`driver.vl`** — `modRwExpr`'s `AsExpr` arm reads `annTsOf(ix)`, `modRwTsName`s the tree and
  renders `n.asTy` back from it; `modTypeRenamed` stays as the fall-through.

Pins (both FAIL on the parent `3b1fad4`, verified by running each against a parent-built
compiler with `--compiler`): `tests/cases/modules/as-cast-alias/` (module-local + chained +
entry-module legs) and `tests/cases/modules/as-cast-imported-alias/` (the imported leg).

**Stated plainly: the string scanner alone would also have fixed both pins.** A build with the
tree leg deleted and only `n.asTy = modTypeRenamed(n.asTy)` runs them both. The checker admits
only a target that resolves to a numeric scalar, so no field name and no literal lexeme — the
two things the tree knows and `modTypeRenamed` cannot — can appear in this position. **The
defect was a MISSING CONSUMER, not a scanner defect.** The tree leg ships anyway because
routing the new consumer through `modTypeRenamed` would have added a SIXTH live call site to a
type-string parser this program is retiring, of which three were already arena-first.

### The fall-through is measured DEAD, and the comparator is measured POWERFUL

- **Fall-through.** A build that prefixes `@@POISON@@` onto `n.asTy = modTypeRenamed(n.asTy)`
  is corpus byte-, message- AND run-identical to the shipped build over **1,331 entries**
  (1,298 files + 33 module DIRECTORIES built as units; both sabotage measurements were taken
  at the `adbe6f0` base, before two upstream slices landed): **0 diffs of any kind.** Every
  `AsExpr` at merge time has a recorded spelling. Total by construction too — `mkAsExpr` has
  exactly one call site and it now records.
- **Comparator power at volume, against a known-WRONG build.** `modRwTsName` renames NOTHING
  (wire sabotage): **47 of the 1,331 entries diverge**, including every module pin and
  `modules/basic` / `generic-export` / `generic-isolation` / `match-cross-module` /
  `name-isolation`. The channel that can see the merge sees it.
- **`annTsNode` monotonicity.** The new rows are interleaved with the `TypeRef` and `IsExpr`
  rows in one table that `annTsOf` BINARY-SEARCHES, so a single out-of-order push silently
  corrupts every lookup. A build that counts `nodeIx <= last` at `setAnnTs`: **0 violations**
  over the 1,298-file corpus AND over the 50,400-program fuzz corpus.

### Allocation, measured (note 24)

**+0 spelling nodes.** `parseAsType` already BUILT its tree on master and threw the root away
(`tsPop()` pops the stack; the nodes stayed in the arena unreferenced), so keeping it allocates
nothing new. The cost is **one `annTs` row per `as` expression**: over the whole corpus there
are **31** `AsExpr` nodes, so **+31 rows** against 91,637 existing ones. The compiler's own
16-module build contains **0** `as` expressions — **+0 rows**.

Binary, like-for-like (ONE compiler, two sources): 1,031,575 → **1,031,675** bytes (**+100**).

### The call arithmetic

**0 parses added · 0 parses deleted · 1 consumer laddered · NET 0.** Local-aware scan by
resolver called. **Counting method, stated:** line comments are stripped (`//` outside a string
literal); a match is `NAME(` with the preceding char not `[A-Za-z0-9_.]`; the `function NAME(`
definition header is excluded; the parser list is the SCORECARD CORRECTION's plus #1117's four
additions (`refArrElemKind` / `nameIsI32ListArray` / `nameIsMapArray` / `nullClosureArrElem`).
**This is a call count, not a grep count.**

| file | parent (`3b1fad4`) | now |
|---|---|---|
| `compiler/parser.vl` | 0 | 0 |
| `compiler/ast.vl` | 0 | 0 |
| `compiler/driver.vl` | 0 | 0 |
| `compiler/typecheck.vl` | 20 | 20 (untouched) |
| `compiler/emit_collect.vl` | 98 | 98 (untouched) |
| `compiler/emit_base.vl` | 66 | 66 (untouched) |
| **total** | **184** | **184** |

`modTypeRenamed`, the scanner the scorecard has never counted: **5 sites on master → 6 now** —
the new one is the `AsExpr` fall-through, measured dead above. Cumulative across P1+P2+P3:
**4 of the 6 are arena-first with a measured-dead fall-through** (`modRwType`, `udVariants`,
`isVariant`, `asTy`); the remaining two (`tdName`, `udName`) are DECLARATION names built from
an identifier token, correctly renamed whole.

### Gate

Corpus **byte-, message- AND run-diff**, **1,338 entries** (1,305 files — `tests/cases` +
a pinned parent snapshot of `compiler/` + `std/` + `scripts/*.vl` — plus 33 module directories
built as units; compiler stdout/stderr with the out-path normalised, exit codes compared, run
output + exit code compared): **4 byte-diffs, 4 message-diffs, 4 run-diffs — all 4 are the two
new pins** (each counted once as a file and once as a directory), which the parent rejects and
this build compiles and runs. **0 diffs on all 1,334 pre-existing entries.**

The shared-INSTANCE channel (note 32) agrees and classifies the message delta: `vl check
tests/cases` goes from `Found 207 errors, 119 warnings` to `Found 204 errors, 119 warnings`,
and the 3 removed diagnostics are exactly the pins' ``unknown type … in `as` cast``
rejections — every message change is a fix, none is a regression. `vl check compiler` and
`vl check std` are byte-identical (0 diff lines).

Fuzz A/B **50,400 programs/side** (14 seeds × depths 4/5/6 × {plain, `--branching --multiobs
--declared`} × 300, generated ONCE by the PARENT's compiler so both sides see identical
programs), whole `--out-dir` TREES via `diff -r`, **52,812** output files/side: **0 differing
paths** (`diff -r` RC=0, 0 output lines). Stated with #1121's caveat: the generator emits
SINGLE FILES, so this channel cannot reach the module merge at all — its 0 is a regression
check on the parser-side row addition (which every `as` cast exercises), not evidence for the
merge leg. The merge leg is carried by
the corpus + the pins + the two sabotages.

`refresh-compiler.sh` RC=0 (1,031,675 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined
failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4,
1,031,675 bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0
(**1,991 passed, 0 failed, 8 ignored** — 1,989 with the two pin directories moved aside,
measured in this worktree, + 2).

### Hand-offs, each with a VERIFIED diff

**Hand-off 1 — a LIVE invalid-wasm miscompile, single-file, no modules: `x as <alias>` for a
non-i32 numeric.** `typecheck.vl` (a concurrent agent's file).

```vl
type W = f64
const x = 5 as W
print(x)
```
→ `failed to compile … WebAssembly translation error … type mismatch: expected f64, found i32`
on `adbe6f0` AND on the parent `3b1fad4`. Same for `type W = i64` and `type W = f32`;
`const x = 5 as f64` (the primitive) runs; `type W = i32` runs (no conversion needed).

Mechanism: `emitAsCast` (`wasmEmit.vl:7552`) branches on `tgt == "f64"` / `"i64"` / `"f32"` and
falls through to the i32 arm — a structural decision made from a type-name string that is a
nominal ALIAS. The canon pass would have resolved it, but **`canonEmitTypeNames`
(`typecheck.vl:6622`) sweeps only `TypeRef` and `UnionDecl` nodes; it never touches
`AsExpr.asTy`.** That is the coverage gap, and it is one arm:

```vl
    } else if n is AsExpr {                        // ← add, beside the UnionDecl arm
      const c3 = canonEmitName(n.asTy)
      if c3 != n.asTy { n.asTy = c3 }
    } else if n is UnionDecl {
```
**Verified in a probe build on this branch, at the parent `3b1fad4`: all four failing
programs above compile and run.**
(`AsExpr` is already imported by `typecheck.vl`; the arm banks no atom count, so
`annUnionAtoms` is untouched.) This slice makes the module case REACHABLE — before it, `x as W`
in a module was a type error — so the gap is now hit from one more direction. It is
pre-existing (note 34's control: the single-file form fails identically on `adbe6f0`), which is
why no pin ships for it here.

**Hand-off 2 — P4, for the `typecheck.vl` owner: the canon pass is the last producer of FOUR
columns, not one.** Population above: 111 nodes / 46 files / 56 distinct rewrite pairs, of
which 27 also leave `nodeTyIx` describing the pre-canon type. The lockstep write has to cover
`TypeRef.tyName` (already), the spelling tree (`annTsOf` → a structural canon), `nodeTyIx`
(re-`recordClonedNodeTy` with the canon'd name, or better, the canon'd `Ty`), and
`annUnionAtoms` (already banked by #1113). The alias→member substitution needs no new
machinery: `udTsRoot` (P2) already holds every `type N = …` member's tree.

**Hand-off 3 — for the `emit_rewrite` / `emit_collect` owners: do NOT bank spellings at the
synthesis sites.** The attribution table above is the map; the finding is that all 1,223 nodes
already carry `nodeTyIx` and the names come from `tyToEmitName`/`tyToStr`. The migration these
sites want is arc 2 — the RENDERER hands over a type index and the consumer stops rendering —
not a spelling column.

**Hand-off 4 — `tyToEmitName` is NOT TOTAL over the arena: it does not terminate on a
recursive type.** A probe that renders `nodeTyIxOf(ix)` for every `TypeRef` TRAPS (stack
exhaustion, `wasm backtrace` from `<wasm function 436>`) on **15 of 1,294** corpus files —
`recursive-linked-list-sound.vl`, `mutual-recursive-type.vl`, `recursive-binary-tree-sound.vl`,
`recursive-array-element.vl`, `indirect.vl`, `indirect-polymorphic.vl`, … . The compiler does
not hit this today because nothing renders those annotations; anyone migrating a consumer to
"render the arena type and compare" will. `isEquatable`'s `seen` stack is the cycle-guard
pattern the emit renderer lacks.

### Method notes earned

50. **A sidecar's coverage is a function of WHERE you sweep, and one point is not a
    measurement** (D-PARSETY P3) — #1121 probed at `collectA` (pass 3 of 25) and reported
    203 NOSPELL / 43 STALE files. Sweeping at emit ENTRY and at emit FINAL instead gives
    0 / 111 and 1,223 / 111, and the PAIR is what carries the structure: NOSPELL is 100%
    emitter-minted (0 at entry) and STALE is 100% pre-emit (identical at both). Neither fact
    is visible from a single interior point, and both change what the fix has to be.
51. **"Bank at the producer" fails when the producer is a RENDERER, and the tell is that the
    thing you want is already banked** (D-PARSETY P3) — the brief's step 2 assumed the
    synthesis sites know the structure. They know an ARENA INDEX and they render it; the
    index is already on the node (`recordClonedNodeTy`, 99.977% total at emit). A second
    structural encoding derived from the first one's RENDER is a parse wearing a sidecar's
    clothes. When a proposed bank would be the third encoding of one type, the answer is to
    read the encoding that exists.
52. **A rewrite that invalidates one derived column invalidates ALL of them — enumerate the
    columns before calling it a lockstep** (D-PARSETY P3) — the canon pass was filed as
    "the tree goes stale". It also leaves `nodeTyIx` describing the pre-canon type on 27 of
    the same 111 rows, all of them literal-union ALIAS names, because `tyToEmitName` widens a
    literal union but does not resolve an alias to one. The C1 typed-IR is not a refuge from
    P4; it is a second victim of it.
53. **Partial coverage of a population unblocks no consumer, so "close 35% of it" is not a
    down payment** (D-PARSETY P3) — 433 of the 1,223 uncovered nodes are minted in an
    UNCLAIMED file and could have been banked without touching anyone's partition. A consumer
    migrates only when its column is total for it; at 65% it keeps the string fall-through it
    was migrating to delete, and the slice books progress that buys nothing. Declined on the
    measurement, not on the effort.
54. **A deferral justified from a checker RULE must quote the rule, not paraphrase it**
    (D-PARSETY P3) — "the cast target is a numeric primitive by the checker's own rule" versus
    what `checkCastNode` actually requires, which is that the target RESOLVE to a numeric
    scalar. The gap between "is" and "resolves to" is the entire alias vocabulary, and it made
    `as` unusable with any named type in module mode. Three previous slices read that note and
    inherited it.


## D-ISTY — the `is`-test TYPE was already banked; the emitter stops re-classifying its SPELLING (#1125)

`emitIs`'s box-tag ladder took the tested type's SOURCE SPELLING apart four ways, and the two
narrowed-arm unbox reads took the same spelling apart again after it had travelled through the
narrowing stack. Every one of those answers is a projection of ONE value the CHECKER had
already resolved and banked — `isVarTyIxOf`, recorded by `checkIsExprNode` since D-NARROW and
read, until this slice, by exactly one consumer (`pushNarrowRep`).

### The producer chain, and why the emitter never used it

```
parser        IsExpr{ isVariant: "S[]" }        (the only mint site for an `is` node)
checker       chkTy = nameToTy(n.isVariant)     → isVarTyIx[isIx] = chkTy   (checkIsExprNode)
narrowing     pushNarrowRep(name, variant, isVarTyIxOf(condIx), setId)      → narrowTys[i]
emitter       …re-classified `n.isVariant` / `narrowVariants[i]` from scratch
```

Both banks are **total for any program that emits**, by construction and by measurement:
`IsExpr` nodes are minted ONLY by the parser (`mkIsExpr` has two callers, both in `parser.vl`),
so every one of them predates `checkProgram`'s sizing of the sidecar; and an `is` whose type
does NOT resolve raises `tErr("unknown type … in 'is'")`, which `driver.vl` turns into
`if T.diags.length > 0 { return 2 }` — the emitter never runs. Measured: **8,031 of 8,031
reaches covered** (below), with **0** reaches where the bank declined and the name ladder
answered anything.

### The four spelling tests are one question

`emitIs` ran `valueAtomKind(isAtom)`, then `nameIsLitUnionType(isAtom)` (rewriting the atom to
`"string"`), then `nameIsMap(isAtom)` → `mapTagOf`, then `nameIsRefArray(isAtom)` →
`refArrTagOf`. All four decide ONE i32: the box tag the arm claims. `isArmTagOfTy(ity)` derives
it from the banked type — `unMemAtomKind` (`valueAtomKind`'s arena dual) → `scalarTagOfKind`,
`tyIsLitUnion` → kind 2's tag (the structural form of the `isAtom = "string"` rewrite),
`unMemIsMap` → `mapSlotTag(mvSlotOfTy(tyMapValOf(ity)))`, `unMemIsRefElemArray` →
`refArrSlotTag(rlSlotOfTy(tyRefArrElemOf(ity)))`. #1110's shape, one layer up: *when several
parses are projections of ONE value, banking that value deletes them all at once.*

The two composites it replaces are `mapTagOf` = `mapSlotTag(mvSlotOfMapValNameOrMono(
mapValNameOf(atom)))` and `refArrTagOf` = `refArrSlotTag(rlSlotByName(refArrElemName(atom)))`:
the same compositions with the name slicer swapped for the arena hop. `nameIsRefArray`'s extra
content over a shape test is the reflist layer's INTERN STATE (#1116), and that is exactly what
`rlSlotOfTy(...) >= 0` asks, so the guard and the tag were always one lookup.

### The narrowed-arm reads: the same bank, one hop later

`emitRefArrayUnionUnboxRead` / `emitMapUnionUnboxRead` received the arm's rendered NAME
(`narrowedRefArrayOf` / `narrowedMapOf`) and re-resolved it — `rlSlotByName(refArrElemName(atom))`
and `mvSlotOfMapValNameOrMono(mapValNameOf(atom))`. The narrowing stack banked the arm's arena
type at the push, so `narrowedArmTyOf(name)` (a twin of `emit_classify`'s private
`narrowSlotOf` + `narrowSlotTy` over the same `emit_state` tables) hands the structure over and
both re-resolutions become `rlSlotOfTy(tyRefArrElemOf(...))` / `mvSlotOfTy(tyMapValOf(...))`.
The `atom` parameter is gone from both signatures.

The MONO sentinel is the one place the two legs could have parted: `mvSlotOfMapValNameOrMono`
answers -1 for a mono/atom-valued map, and `mvSlotOfTy` answers -1 for "no row claims this
type". They coincide numerically and `mapTypeIdxOf(-1)` is the shared `$mStructIdx` either way,
so the probe compared the SLOT the consumer casts with, not the intermediate names — 724 of 724
agreeing.

### The probe: candidate beside authority, at the consumer

Six tags, accumulated and reported ONCE at the end of `emitProgram`. `cov` = the bank answered;
`DIS` = covered and the candidate differs from the authority; `uncovLive` = the bank declined
AND the name leg produced a live answer (method note 10: consequence, not reach).

| tag | site | corpus reach / cov / DIS / uncovLive | fuzz reach / cov / DIS / uncovLive |
|---|---|---|---|
| **ISTY** | `emitIs`'s arm tag | 893 / 893 / **0** / 0 | 7,138 / 7,138 / **0** / 0 |
| **RAUB** | ref-array unbox slot | 75 / 75 / **0** / 0 | 263 / 263 / **0** / 0 |
| **MAPUB** | map unbox slot | 61 / 61 / **0** / 0 | 663 / 663 / **0** / 0 |
| **MVRA** | map-VALUE ref-list guard | 364 / 217 / **0** / 0 | 14,500 / 9,741 / **0** / 0 |
| ARROW | `strContains(isVariant, "=>")` | 325 / 325 / **24** / 0 | 1,304 / 1,304 / **87** / 0 |
| ARROWC | …of which CONSEQUENTIAL | 24 / 24 / **0** / – | 87 / 87 / **0** / – |
| MONOSH | `nameIsWholeSpanShape(isVariant)` | 1,424 / 1,424 / **224** / 0 | 9,534 / 9,534 / **0** / 0 |

1,274 corpus files (397 reporting) + 50,400 fuzz programs (10,090 reporting), 51,674 total.

**Comparator sanity, per tag, before believing any 0** (method note 12): the probe was rebuilt
with each candidate leg deliberately wrong and re-swept. ISTY's atom+map arms → **461**
disagreements, ISTY's ref-array arm ALONE (a separate build, because the first perturbation
never reaches it) → **70**, MVRA → **217/217**, RAUB → **75/75**, MAPUB → **61/61**. The 0s are
not vacuous.

### Two REFUTATIONS the same probe produced

**MONOSH — `nameIsWholeSpanShape` is a question about the SPELLING, and the arena cannot ask
it.** `monoStaticIsGuardOf` scopes the dead-arm drop to an anonymous `{…}` shape guard, and its
comment says why: "leaves every scalar / closure / array / **declared-name** guard emitting both
arms exactly as before". The arena resolves `Cat` to the very same `TyObj` the inline shape
resolves to — nominality is not in the type — so a `TyObj` test WIDENS the guard to declared
names and drops arms the guard deliberately keeps. 224 corpus disagreements, every witness a
declared name (`Cat`, `Dog`, `C`, `S`, `A`, `B`). **Not migrated. Not migratable** without a
nominal-anonymity marker, which is a parser-side record, not an arena property.

And the shape of that measurement matters more than the verdict: **fuzz reported 0
disagreements on 9,534 reaches** at the same tag. The fuzz grammar emits no declared-name `is`
guard inside a monomorphized instance, so the fuzz channel is BLIND to the entire divergent
population. A slice that ran fuzz first and stopped would have shipped it. (Method note 5's
inverse: a green FUZZ is not a green probe either.)

**ARROW — the `=>` scan diverges 111 times, is inert every time, and is deliberately NOT
migrated.** `strContains(nd0.isVariant, "=>")` gates the nullable-closure non-null test. Its
arena dual (`unMemIsFunc` — the type IS a `TyFunc`) is TIGHTER: the 24 + 87 divergences are all
struct shapes with a closure FIELD (`{f:(i32)=>K0[]|i64}`, `{a:f64,z:(()=>i64)[]|i32}`), where
the name test says yes and the type says no. All 111 are inconsequential — the site's real gate,
`exprNulClosure(nd0.isObj)`, is false at every one of them. The other direction (a NAMED
function-type alias, `type F = (i32) => i32`, where the name test says no and the type says
yes) is **unreachable today for two independent reasons measured by building the programs**:
`f: F | null` as a param fails emit outright ("only i32, i64, f64, f32, boolean, struct, union,
array, or string parameters are supported"), and a narrowed call through such an alias fails the
CHECKER ("called value is not a function"). So the migration would be a behaviour change in a
population that cannot occur, with **no pin available on any channel** — the #1114 / #1119 case,
and this slice declines it rather than shipping an unpinnable non-equivalence for one
non-SCORECARD parse. Filed as a hand-off with its exact diff below.

### Entombment — every migrated leg is pinned by the PRE-EXISTING corpus

Six gate sabotages (note 4: perturb so the value LEAVES the equivalence class the consumer
distinguishes), each vs the shipped build over the corpus (1,270 files at the measurement, 1,274
after the last rebase):

| sabotage | what it breaks | byte | message | run |
|---|---|---|---|---|
| **S-ISTY** — litunion arm claims kind 0's tag, not kind 2's | the `is K0` string-tag compare | 20 | 0 | 17 stdout + 1 status |
| **S-ISTYMAP** — the map arm always tags the MONO slot | the map arm's tag band | 23 | 0 | 20 stdout |
| **S-ISTYRA** — the ref-array arm's tag + 2 | the ref-array arm's tag band | 36 | 0 | 26 stdout + 3 status |
| **S-RAUB** — the narrowed ref-array slot + 1 | the wrapper `ref.cast` target | 8 byte + 22 build-status | 22 | 30 status |
| **S-MAPUB** — the narrowed map slot forced MONO | the map-struct `ref.cast` target | 23 | 0 | 23 status |
| **S-MVRA** — the ref-list value seed never fires | the stored list's build | 2 byte + 7 build-status | 9 | 9 status |

No new fixture was needed: the corpus already holds a pin for each of the six.

### The call arithmetic

Local-aware scan (the #1119 method: by resolver actually called, non-comment, argument traced
through the enclosing function's bindings, ONE hop into the callee) over the four owned files
`wasmEmit.vl` / `emit_rep.vl` / `emit_state.vl` / `emit_rewrite.vl`:

| SCORECARD resolver | master | now | delta |
|---|---|---|---|
| `nameIsRefArray` | 2 | 0 | **−2** |
| `nameIsLitUnionType` | 3 | 2 | **−1** |
| `nameIsMap` | 1 | 0 | **−1** |
| `refArrElemName` | 1 | 0 | **−1** |
| `mapValNameOf` | 1 | 0 | **−1** |
| **TOTAL (4 files)** | **19** | **13** | **NET −6** |

- **Type-string PARSES deleted: 7** — the six above plus `valueAtomKind(isAtom)` at `emitIs`
  (a parse of the same family, not on the SCORECARD list).
- **Deleted from a PATH, not from the source: 2** — `mapTagOf` and `refArrTagOf` reached
  `mapValNameOf` and `refArrElemName` inside `emit_classify`; those calls no longer run for any
  `is` test. Both functions now have **ZERO callers compiler-wide** (see hand-offs).
- **Name-keyed RESOLUTIONS deleted: 4** — `rlSlotByName` ×1, `mvSlotOfMapValNameOrMono` ×1,
  `mapTagOf` ×1, `refArrTagOf` ×1.
- **Parses ADDED: 0. Consumers laddered: 0. Sidecars added: 0** (both banks already existed;
  this slice adds no state and no reset obligation).
- **Resolutions REMOVED at runtime, not just at compile time:** the MVRA arm now resolves the
  map value's ref-list slot ONCE where master ran `nameIsRefArray` and then `mvValInnerRlSlot`.
- New exports: `tyMapValOf` (`emit_rep`, one hop over `TyMap.mVal`). New private helpers:
  `isArmTagOfTy`, `narrowedArmTyOf` (`wasmEmit`).
- Cross-file: `emit_classify` / `typecheck` / `emit_collect` / `emit_base` / `parser` UNCHANGED.

Binary: 1,031,675 → **1,031,979** bytes (+304).

### Gate

| channel | volume | result |
|---|---|---|
| corpus byte / message / run | 1,274 files | **0 / 0 / 0** |
| fuzz A/B, whole `--out-dir` trees | **50,400 programs/side**, 52,708 output files/side | **0 differing paths** |
| probe (candidate beside authority) | 51,674 programs | **0** disagreements on the 4 migrated tags |
| `refresh-compiler.sh` | | RC=0 |
| `rep-fuzz-check.sh` | exact ✅ 1 baselined reject, 0 new/stale | RC=0 |
| `native-fixpoint.sh` | stage3 == stage4 | RC=0 (1,031,979 bytes) |
| `lint-self.sh` | | RC=0 |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | 1,999 tests | **1,985 passed, 0 failed** |

Every number in this section was re-measured on THREE successive landing bases as master moved
under it — `5bca019` (D-UNIONGEN, #1124: `typecheck` / `emit_collect`), `3b1fad4` (D-FIELDCODE,
#1123: 28 parses deleted in `emit_classify`, whose field-classification tables these arm
resolvers sit on top of) and `d1154cc` (D-PARSETY P3, #1126: `parser` / `driver`). Every re-run
reproduces the whole net exactly: corpus byte-, message- and run-identical (1,270 files, then
1,274), fuzz A/B 50,400 programs/side with 0 differing paths, the probe's four migrated tags 0
over both channels (ISTY 893 corpus + 7,138 fuzz reaches, all covered), all six sabotages
reddening the same files with the same counts, and every standing script RC=0. (The first run,
on `adbe6f0`, said the same over 1,263 files.)

### Hand-offs (exact diffs)

1. **`emit_classify.vl` — `mapTagOf` and `refArrTagOf` are now DEAD** (0 callers compiler-wide;
   `vl check` does not flag an unused EXPORT, so the gate is green either way). Deleting them
   removes 2 more parses (`mapValNameOf`, `refArrElemName`) and 2 name-keyed resolutions
   (`mvSlotOfMapValNameOrMono`, `rlSlotByName`) from the source. They are the last consumers of
   the atom→tag entry points; `mapSlotTag` / `refArrSlotTag` (the slot→tag halves) stay.
2. **`emit_classify.vl` — export `narrowSlotTy`** (or a `narrowedArmTyOf(name)` beside
   `narrowedRefArrayOf`), and `wasmEmit`'s private twin goes:
   ```
   -function narrowSlotTy(i: i32): i32 {
   +export function narrowSlotTy(i: i32): i32 {
   ```
   Better still, `narrowedRefArrayOf` / `narrowedMapOf` could return the SLOT their own
   containment checks already resolve the type for, and the emitter would stop receiving a
   rendered arm name at all.
3. **The ARROW site** (`wasmEmit.vl`, `emitIs`'s nullable-closure arm), measured above and NOT
   taken. The diff is one line, and the reason to hold it is the missing pin, not the risk:
   ```
   -    if strContains(nd0.isVariant, "=>") {
   +    if unMemIsFunc(isVarTyIxOf(isIx)) {
   ```
   It becomes pinnable the day a named function-type alias can be a nullable param — i.e. when
   `f: F | null` stops failing `emitProgram`'s parameter check. That is the fixture to write
   first.
4. **`typecheck.vl`** — `isVarTyIxOf`'s comment still says the bank exists "for the emitter's
   narrowing stack". It now has four more consumers; the comment is the place to record that
   the bank is TOTAL for emitting programs (the `T.diags` gate above), because that totality is
   what let this slice DELETE rather than ladder.

### Method notes earned

55. **A bank can be TOTAL by construction, and that is what turns a ladder into a deletion**
    (D-ISTY) — every previous consumer of a `nodeTyIx`-family sidecar kept a name fall-through
    because emitter-synthesized nodes read past the end. `IsExpr` is different for a reason a
    grep can check in one line: `mkIsExpr` has two callers and both are in the parser, so no
    `is` node can postdate the checker's sizing. Before laddering a sidecar consumer, ask who
    MINTS the node — the answer decides whether the fall-through is load-bearing or ballast.
56. **A 0 on the fuzz channel can mean the generator has no grammar for the divergence**
    (D-ISTY) — the MONOSH tag reads 224 disagreements on 1,270 corpus files and **0 on 50,400
    fuzz programs**, because the generator emits no declared-name `is` guard inside a
    monomorphized instance. Method note 5 says a green corpus is not a green probe; this is its
    mirror, and it is the more dangerous one, because the fuzz leg is the one quoted for
    volume.
57. **When two legs disagree, measure the CONSEQUENCE at the next gate before calling either
    one wrong** (D-ISTY) — the ARROW site's legs disagree 111 times and the site's behaviour is
    identical at all 111, because `exprNulClosure` rejects every one. "Disagrees" was not the
    finding; "disagrees and cannot matter, and therefore cannot be pinned" was.

## D-CYCTY — the compiler TRAP bounded, and the emit_collect concentration AUDITED (#1127)

The brief: fix or bound the compiler CRASH #1124's sweep filed (a recursive generic alias
traps the compiler), establish whether it and #1126's `tyToEmitName` non-termination are one
bug or two, then attack `emit_collect.vl` — "the largest un-audited concentration in the
compiler", 288 operations, and `emit_base.vl`'s 337.

What ships is the crash bound, with the two populations SEPARATED by measurement. What the
audit produced is four refutations and one probe that says the brief's named "free win" is a
ladder, not a deletion — with the witness.

### The crash, and its mechanism

`vl check` ACCEPTS `type L<T> = { head: T, tail: L<T> | null }` + `const a: L<i32> = …`.
`vl build` TRAPS: `wasm trap: call stack exhausted`, `tyToNominalName` recursing into itself
through `litUnionAliasNameOfTy`.

The mechanism is deliberate, and the D-UNIONGEN note that filed this ("the checker cannot
instantiate one at all, so the new structural render can never be handed a cyclic object") is
**REFUTED**: `applyGenAlias` (`typecheck.vl:4810`) registers an EMPTY `mkObjTy` placeholder
under the instance's resolved memo key BEFORE it resolves the fields, precisely *"so a
recursive application lands on its own (cyclic) arena index instead of recursing forever"*.
The checker instantiates it, `T.diags` is empty, and the emitter is handed the cyclic object.

What a recursive DECLARED struct has and a generic INSTANCE does not is a NAME against its
index. `tyToNominalName` short-circuits at `structNameOfTy(ix) != ""` / `unionAliasDeclNameOfTy`;
`type Tree = { kids: Tree[] }` is equally cyclic and renders as `"Tree"` in one step. A
generic instance is registered in `cUserTypes` but not in `cStructTyIxs`, so nothing stops the
descent.

Three separate unbounded loops are reachable from one such program, and which one fires
depends on the field's shape — measured by building each:

| program | trapping function | file |
|---|---|---|
| `tail: L<T> \| null` | `tyToNominalName` <- `reachRegisterName` <- `collectTyReachRegister` | `typecheck.vl` <- `emit_collect.vl` |
| `tail: L<T>[]` (no union anywhere) | `gaeEnsure` re-entering itself on its own field spelling | `emit_classify.vl` <- `emit_collect.vl:3357` |
| any (latent) | `tyToEmitName` — #1126's hand-off 4 | `typecheck.vl` |

### ONE root, TWO DISJOINT populations — the measurement

Root cause: a renderer with no cycle guard over an arena the checker deliberately makes
cyclic. `tyToStr` (diagnostics) has a depth cap and is why the type ERROR path prints
`{head: i32, tail: {head: …, tail: …}}` instead of trapping; `tyToEmitName` and
`tyToNominalName` have none.

They are NOT the same bug, and a probe settles it. A probe build swept every `TypeRef` node of
every corpus file with two cycle detectors — the NOMINAL one (mirroring `tyToNominalName`'s
short-circuits) and the STRUCTURAL one (the same walk with the two nominal lines removed,
which is `tyToEmitName`'s reachability):

| population | files | which |
|---|---|---|
| **nom > 0** (the live crash) | **3** | only the three new pins |
| **str > 0, nom = 0** (latent, #1126's) | **14** | `recursive-linked-list-sound` · `recursive-binary-tree-sound` · `recursive-type-build-traverse` · `recursive-alias-nullable-arg` · `xfail-mutual-recursive-types` · `mutual-recursive-type` · `recursive-tree` · `recursive-array-element` · `recursive-map-value` · `nullable-recursive-call-narrow-canary` · `optional-chain-member-recv` · `structural-twin-heap-dedup` · `scripts/fuzzgen.vl` (str=28) · the new nominal-boundary pin |

The two sets are **disjoint**: every pre-existing file in the structural population reads
`nom = 0`. So this fix does NOT protect a future `tyToEmitName` consumer — 13 pre-existing
corpus files (including the FUZZ GENERATOR itself) still trap one — and a `tyToEmitName` guard
would not have fixed this crash. Two guards, one root. #1126's "15 of 1,294" and this 13+1 are
the same finding at slightly different probe granularity.

### What ships

One guard, in `collectU` — the FIRST emit pass, so it precedes every renderer:

```
 export function collectU(stmts: i32[]) {
+  if guardFiniteUserTypes() < 0 { return -1 }
```

`guardFiniteUserTypes` scans `cUserTypes` (which keys every declared alias AND every
generic-alias INSTANCE — `applyGenAlias` memoizes each under its resolved key, so one scan is
complete for this family) and, for each, asks whether a name-faithful render would terminate.
The test mirrors `tyToNominalName`'s descent exactly minus the string building: the same
nominal short-circuits, the same composite arms, a path stack instead of the concatenation. A
litunion alias is an all-`TyLit` member set and cannot carry a cycle, so the arms the renderer
short-circuits through `litUnionAliasNameOfTy` are descended here without over-reporting.

The message names the type by the SOURCE SPELLING of the first annotation whose recorded type
is the offending index (`L<i32>`) — the arena type has no finite render, which is the point.
That lookup is a linear `P.nodes` scan on the FAILURE path only.

```
- Error: error while executing at wasm backtrace: … wasm trap: call stack exhausted
+ Error: emit error emitProgram: recursive generic type `L<i32>` is not supported —
+   its expansion has no finite type name
```

`vl check` still accepts (an emit-coverage gap is not a check failure — `driver.vl`'s standing
policy), which is why this is an `@emit-error` pin and not a parser reject. A parser-side
"a generic alias may not reference itself" rule was considered and declined on two
measurements: it cannot see the MUTUAL case (neither declaration mentions itself), and it
would reject a declared-but-never-applied alias, which compiles today and is pinned below.

### Pins — three FAIL ON MASTER, verified by running them against the master seed

| pin | master (`fd411bd` seed) | this build |
|---|---|---|
| `generics/recursive-generic-alias-nullable.vl` | **TRAP** `<wasm function 437>` (`tyToNominalName`) | `@emit-error` |
| `generics/recursive-generic-alias-array.vl` | **TRAP** `<wasm function 1291>` (`gaeEnsure`) | `@emit-error` |
| `generics/recursive-generic-alias-mutual.vl` | **TRAP** `<wasm function 437>` | `@emit-error` |
| `generics/recursive-generic-alias-uninstantiated.vl` | runs, `7` | runs, `7` (boundary: no instance ⇒ no cyclic entry) |
| `generics/recursive-type-as-generic-argument.vl` | runs, `1` | runs, `1` (boundary: a cycle WITH a nominal exit) |

The two boundary pins are the reject's edges, and the second one is load-bearing: the
structural probe reads `str = 3` on it and the shipped guard reads `nom = 0`.

### Comparator sanity — the guard's nominal short-circuit is load-bearing

Sabotage **S-NOM**: delete the two nominal short-circuit lines (the guard then rejects any
cyclic type, nominal or not). Against the shipped build over the same 1,305-file corpus:
**18 message diffs, 14 byte diffs** — every recursive declared-struct fixture in the corpus,
plus the fuzz generator. The corpus channel sees this guard; the 0/0/0 below is not vacuous.

### Gate

| channel | volume | result |
|---|---|---|
| corpus BYTE (`vl build` per file, `diff -rq` of the whole wasm tree) | 1,305 files (`tests/cases/**` 1,274 + `compiler/*.vl` 25 + `std/*.vl` 4 + `scripts/*.vl` 2) | **0 differing** |
| corpus MESSAGE (rc + stderr per file) | 1,305 files | **0 differing** |
| corpus RUN (`vl run --batch --out-dir`, whole-tree `diff -r`) | 1,274 files, 1,398 outputs | **0 differing**, transcript identical |
| fuzz A/B, whole `--out-dir` trees | **50,400 programs/side** (21 fixed seeds x 3 depths x 4 legs x 600), 52,083 output files/side | **0 differing paths** |
| `refresh-compiler.sh` | | RC=0 |
| `rep-fuzz-check.sh` | exact ✅ 1 baselined reject, 0 new / 0 stale | RC=0 |
| `native-fixpoint.sh` | stage3 == stage4 | RC=0 (1,033,840 bytes) |
| `lint-self.sh` | | RC=0 |
| `SELFHOST_NATIVE_ALIGN=1 deno task test` | 2,007 tests | **1,993 passed, 0 failed, 14 ignored** |

The suite magnitude reconciles exactly with the brief's 1,991/0/8 at `fd411bd`: +8 tests from
the 5 new fixtures (3 of which also mint a `selfhost_native_align` emit-reject case), and 6
`native-opt` cases ignored on this box (no binaryen) that counted as passes there —
1,991 − 6 + 8 = 1,993.

Binary 1,031,979 → **1,033,840** (+1,861). Self-compile wall clock, min of 9 interleaved:
master **1,365 ms**, this build **1,347 ms** — the guard's cost is below the noise floor,
because every declared struct/union entry answers at its own root in one registry lookup and
only a genuinely cyclic entry is walked.

### THE AUDIT — `emit_collect.vl` and `emit_base.vl`, counted

Method, stated: unit = **CALL SITES** (several on one line count separately), `grep -Hn`,
comments stripped **string-literal-aware** (a `//` inside a `"…"` is not a comment), function
DEFINITION headers excluded, per-file sums cross-checked against an independent tree-wide
`grep -Hn` recount (115 and 77 reproduce exactly: 123 raw → 118 stripped → −3 headers, and
101 → 100 → −23 headers). Measured on the `fd411bd` blob.

**REFUTATION — 288 and 337 do not reproduce under the definition the brief gives.**

| | `emit_collect.vl` (5,081 ln) | `emit_base.vl` (2,386 ln) |
|---|---|---|
| SCORECARD resolver CALL SITES | **115** | **77** |
| inline character surgery (slice / char probe / indexOf / `[]`-suffix) | 56 | 132 |
| … + `.length` probes on a provable string | 74 | 178 |
| **total, stated definition** | **189** | **255** |
| widest defensible reading (the 227-function string-parameter family) | 290 | 290 |

288 is within 2 of `emit_collect`'s MAXIMAL reading and ~1.5x its scorecard reading. 337 is
reached by NO reading; the gap is closed only by also counting whole-string equality tests
(`== "i32[]"`, `!= "null"` — 135 in `emit_base`, 149 in `emit_collect`), which are atomic
identity tests, not parses. Quote 189/255, or say "maximal family" when quoting 290.

**REFUTATION — neither file is where the mass is.** Tree-wide, the SCORECARD resolvers are
called 679 times: **`emit_classify.vl` 487 (72%)**, `emit_collect.vl` 115 (17%),
`emit_base.vl` 77 (11%). And `emit_base` is 23 of the 42 resolver DEFINITIONS: **96 of its 178
surgery operations and 42 of its 77 resolver calls are INSIDE another resolver's body**, so
they retire when the resolver does, not when a call site migrates. Its density (0.107 ops/line
vs 0.037) is the definitional shape, not a migration target.

**The four concentrations, split by what the argument IS** — (a) a `TypeRef.tyName` /
`nodeTyName` node spelling (an arena index can replace it one-for-one), (b) a name the emitter
itself synthesized (peeled / sliced / split), (c) a name read out of a banked table column:

| concentration | sites | (a) node | (b) synthesized | (c) table |
|---|---|---|---|---|
| `registerInlineUnion` | 34 | **0** | 31 | 3 |
| `collectA` | 28 | 11 | 17 | 0 |
| `collectFnValUse` | 9 | 2 | 5 | 2 |
| `collectCloSigs` | 6 | 5 | 0 | 1 |
| **total** | **77 of 115 (67%)** | **18 (23%)** | 53 | 6 |

**Only 18 of 77 sit on something an arena index can replace.** `registerInlineUnion` is the
blocker and it is structural, not incidental: it has 19 dynamic call entries and **15 are
RECURSIVE self-calls passing a peeled substring**. Of the 4 external entries, 1 is a node
spelling, 2 are `reachRegisterName(tyIx, …)` — i.e. ALREADY a render off the arena — and 1 is
a banked inferred-return column. Its parameter cannot become an arena index until the arena
carries a node for every peeled sub-name it recurses on. That is the mechanism behind "kill the
SOURCES, not the call sites" at this site, stated as a requirement rather than a slogan.

Two further findings from the same enumeration:

- **`shapeHasCloField` has TWO definitions with different signatures, and the destringified
  one is already in production.** `emit_collect.vl:912` parses the rendered shape text (5
  scorecard calls inside its body); `emit_classify.vl:3516` walks the shape TABLE by index
  (`sFieldCount` / `sFieldTypeAt` / `sFieldTgtStructIdx`) with a `seen` cycle guard. The
  string twin's 2 callers pass emitter-derived names (`fvSb`, `fvAtoms[fva]`), so retiring it
  needs a name→shape-index hop at those two sites and the indexed twin EXPORTED — a hand-off,
  `emit_classify` is another partition.
- **`collectFnValUse` already carries an in-source `DESTRINGIFY — MEASURED AND REFUTED`
  note**: an arena reading disagreed on 15 of 1,269 corpus files because the name walk is
  alias-blind and `fnValUsed` is monotone. Do not re-open it without new evidence; this audit
  did not.

### The brief's named "free win" is a LADDER, not a deletion — measured, with the witness

The claim under test: *"`nameIsMapMemberUnion`'s 25 sites are free — a union is a `TyUnion`,
never a `TyMap`, so the guard evaporates the moment its paired `nameIsMap` becomes
`nodeTyIsMap`."*

**The count is 24, not 25** (`grep -Hn`, comments stripped, header excluded), and they live
`emit_classify` 15 · `emit_collect` 6 · `emit_base` 1 · `emit_query` 1 · `emit_rewrite` 1 —
**62% outside both target files**.

**The REASONING holds at 21 of 24.** `nameIsMap` is `name[0]=='{' && name[1]=='['` plus a
trailing-`[]` reject, so `{[string]: i32} | boolean` passes it; `nameIsMapMemberUnion` exists
only to correct that false positive, and `nameIsMap(X) && !nameIsMapMemberUnion(X)` is exactly
"X is a bare map" — what a `TyMap` test answers. All 21 use the identical operand on the same
line in that idiom.

**It FAILS at 3.** `emit_collect.vl:3924` and `emit_collect.vl:5079` and `emit_rewrite.vl:429`
are POSITIVE classifiers, not corrective guards — no paired `nameIsMap` exists (indeed
`nameIsMap` has ZERO call sites in all of `emit_rewrite.vl`), and `emit_rewrite:429` is a
dispatch ARM that pins a lambda's `fnRet` to a map-member-union box. Each becomes net-new
arena work ("is this a `TyUnion` with a map arm?"), not a deletion.

**And "free" presumes the paired `nameIsMap` can become `nodeTyIsMap`, which needs a NODE.**
Only **6 of the 24 operands are node-backed**; 13 are derived substrings (`nullablePartOf(…)`,
`.slice(…)`, `monoUnwrapParens(…)`, split atoms) with no arena node at all, 3 are parameters,
2 are table reads.

So the one node-backed site inside this partition was probed properly, at
`collectA`'s `nd.tyName` map arm (`emit_collect.vl:2885`) — candidate `nodeTyIsMap(i)` beside
authority `nameIsMap(nd.tyName) && !nameIsMapMemberUnion(nd.tyName)`, accumulated and reported
once (method note 10: `uncovLive` = the arena DECLINED and the name leg answered LIVE):

| channel | reach | cov | **DIS** | **uncovLive** |
|---|---|---|---|---|
| corpus (1,006 reporting files) | 123,037 | 123,005 | **0** | **2** |
| fuzz, plain + declared legs (23,695 reporting of 25,200) | 91,319 | 91,319 | **0** | **0** |

Comparator sanity first (method note 12): the same probe rebuilt with the arena leg INVERTED
reads **DIS = 123,005 / 123,005** on the corpus. The 0 is not vacuous.

**Verdict: agreement is total where the arena answers, and the site is still not deletable.**
`uncovLive = 2` — one corpus file, `maps/map-value-union-struct-map-field.vl`, has two map
annotations with NO recorded `nodeTyIx` where the name leg answers TRUE. Replacing the name
test outright would stop those two annotations forcing `mUsed`/`lUsed`/`aUsed` and their mv
slot. A ladder keeps both name calls alive, so the honest score for this "free win" is
**0 parses deleted**. It becomes a deletion the day `nodeTyIx` covers emitter-minted
annotation nodes — #1126's hand-off 3, not this partition.

And the shape of that measurement is method note 56 again, in the same direction: **the fuzz
channel read `uncovLive = 0` over 91,319 reaches** and would have green-lit the deletion on
its own. The corpus is the sensitive channel for `nodeTyIx` coverage, because the uncovered
nodes are minted by passes the fuzz grammar never triggers.

### The call arithmetic

- **Type-string parses DELETED: 0. Laddered: 0. Name-keyed resolutions deleted: 0.
  Parses ADDED: 0. NET 0.**
- This slice adds a structural ARENA walk (`tyNomRenderLoopsGo`) and two typecheck imports
  (`structNameOfTy`, `unionAliasDeclNameOfTy` — both already exported; `typecheck.vl` is
  UNCHANGED). New private helpers in `emit_collect.vl`: `nomPathHas`, `tyNomRenderLoopsGo`,
  `tyNomRenderLoops`, `annSpellingOfTyIx`, `guardFiniteUserTypes`. One module-level `i32[]`
  path stack, popped to empty on every exit — no arena-lifetime obligation (note 7), and the
  suite's shared-INSTANCE driver is green.
- Files touched: `emit_collect.vl` + 5 fixtures. `parser.vl` / `ast.vl` / `driver.vl` /
  `emit_base.vl` UNCHANGED — the crash's fix does not live in any of them, and the audit says
  why for `emit_base` (its calls are inside its own resolver bodies).

### Hand-offs (exact diffs)

1. **`typecheck.vl` — `tyToEmitName` needs the same cycle guard, for the 13 pre-existing
   corpus files this one does not cover.** `tyToStr` already carries the pattern; the emit
   renderer is the one without it:
   ```
   +let emitNameDepth = 0
    export function tyToEmitName(ix: i32) {
      emitNameAtoms = 1
      if ix < 0 { return "" }
   +  if emitNameDepth > 32 { return "" }
   +  emitNameDepth = emitNameDepth + 1
   +  const r = tyToEmitNameGo(ix)
   +  emitNameDepth = emitNameDepth - 1
   +  r
   +}
   ```
   A depth cap returns `""` (the renderer's existing "has no emit name" answer, which every
   caller already handles) rather than a truncated name. `isEquatable`'s `seen` stack is the
   exact alternative; the depth cap is cheaper and `tyToStr` is the precedent. **Do not ship
   it without re-running the corpus** — 13 files reach the cyclic types today and get finite
   names only because nothing renders those annotations.
2. **`typecheck.vl` — `tyToNominalName`'s comment claims more than it delivers.** *"Nominal-first
   ALSO tames recursion"* is true only for a NAMED recursive struct; a generic-alias instance
   has no name registered against its index and the same comment reads as a guarantee. Record
   that the taming is nominal, not structural, beside the `applyGenAlias` note at 4806.
3. **`emit_classify.vl` — `gaeEnsure` has no in-progress guard.** It recurses on its own field
   spellings and its only stop is `structIndexByName(name) >= 0`, which is satisfied only AFTER
   interning completes:
   ```
   +const gaeInFlight: string[] = []
    export function gaeEnsure(name: string) {
   +  if capHas(gaeInFlight, name) { return 0 }
    ...
   +  gaeInFlight.push(name)
    ...   (pop before every return)
   ```
   `collectU`'s guard reaches it first today, so this is defence in depth — but it is the
   second of the three loops and it is not in `typecheck.vl`.
4. **`emit_classify.vl` — export the INDEXED `shapeHasCloField(si, seen)`** so
   `emit_collect.vl`'s string twin (line 912, and 5 scorecard calls inside it) can retire:
   ```
   -function shapeHasCloField(si: i32, seen: i32[]) {
   +export function shapeHasCloField(si: i32, seen: i32[]) {
   ```
   The two `emit_collect` callers pass emitter-derived names, so they also need a
   name→shape-index hop; that is the real work, and it is small.
5. **For whoever takes `collectA`** — the 11 node-backed sites are the whole opportunity in
   that pass, the probe above says the arena AGREES on all of them where it answers, and
   `uncovLive` is the only thing standing between a ladder and a deletion. Measure
   `uncovLive` per site before migrating; it was 2 on the one site probed here and the fuzz
   channel cannot see it.

### Method notes earned

58. **A trap in a self-hosted compiler is a bug in the FIRST pass that walks, not in the
    function that recurses** (D-CYCTY) — three unbounded loops in three files are reachable
    from one four-line program, and which one fires depends on whether the recursive field is
    a union, an array, or neither. Bounding the walk's ENTRY (one guard in the first pass over
    the checker's own registry) covers all three; guarding the recursing function covers one.
59. **Two non-terminations with one root cause can have DISJOINT populations, and the corpus
    will tell you which** (D-CYCTY) — the nominal renderer loops on 3 files (all new pins) and
    the structural renderer on 14, with ZERO overlap. "Same root cause" was true and would
    have been the wrong thing to act on: fixing either one leaves the other's population
    trapping.
60. **Ask what the argument IS before counting call sites** (D-CYCTY) — 115 scorecard calls in
    `emit_collect.vl` look like 115 migration candidates; 18 of them sit on a node spelling and
    53 sit on strings the emitter peeled itself. The (a)/(b)/(c) split is a five-minute
    measurement that reprices an entire slice, and it is what turns "the largest un-audited
    concentration" into "one recursive string-rewrite loop with 15 self-calls".
61. **`uncovLive = 2` on ONE corpus file is the whole verdict** (D-CYCTY) — a site with
    123,005 covered reaches, 0 disagreements, and a comparator-sane probe is still not
    deletable, because two annotations on one file have no recorded arena type. Coverage is not
    agreement (note 51's sibling); AGREEMENT IS NOT TOTALITY either, and only totality deletes.
## D-ATOMKIND — the union box ABI keys on the atom's CODE, the `null` tag is a CONSTANT, and D-ISTY's declined ARROW hand-off is pinnable after all (#1128)

`wasmEmit.vl` is the file where a wrong answer is wrong BYTES, and its largest single
type-name-classifier concentration was `scalarTagOf` at 16 calls. **Thirteen of the sixteen were
`scalarTagOf("null")`** — a classifier walking six literal compares to reach a constant of the
box ABI. The other three, and every sibling in the union-`==` / literal-`is` / narrowed-unbox
machinery, ask questions that are all projections of ONE value the file already has in hand;
two sites had it BANKED and threw it away to re-derive it from a rendering one call later.

### The enumeration, and the counting method

**Unit: CALL SITES** — a textual `name(` in non-comment code, string-literal-aware `//` stripper,
the resolver's own `function name(` header excluded. Not grep hits: `scalarTagOf("null")` has
**14 raw matches** in `wasmEmit.vl` and **13 call sites** (the fourteenth is inside a comment).
Counted over the four files this slice owns (`wasmEmit` / `emit_rep` / `emit_state` /
`emit_rewrite`) and cross-checked tree-wide over all 25 compiler modules.

The list is the value-atom CLASSIFIER family — the resolvers that answer a question about a type
by taking its rendered spelling apart. The census the brief quotes counts these; the SCORECARD
CORRECTION's parser list does not.

| resolver | master (4 owned files) | now | delta | tree-wide master → now |
|---|---|---|---|---|
| `scalarTagOf` | 16 | **1** | **−15** | 16 → **1** |
| `vbHeapIdxOfAtom` | 2 | **0** | **−2** | 2 → **0** (dead compiler-wide) |
| `valueAtomKind` | 9 | 12 | **+3** | 41 → 44 |
| `strContains` over a type spelling | 2 | 1 | **−1** | 22 → 21 |
| `atomEqOpcode` | 2 | 2 | 0 | 2 → 2 |
| `removeAtomFromSet` | 4 | 4 | 0 | 13 → 13 |
| **TOTAL** | **35** | **20** | **NET −15** | **96 → 81, NET −15** |

**The SCORECARD parser list over the same four files is 40 → 40, NET 0**, and that is stated
first because it is the number this program's headline tracks. This slice moves the value-atom
family, not that list. Nothing outside the four owned files changed, so the tree-wide delta
equals the partition delta exactly — a cross-check, not a second measurement.

Two further units, because they are not resolver calls and must not be counted as if they were:

- **Whole-spelling EQUALITY tests against a type name: 12 deleted, 0 added.** `atom == "string"`
  ×5 (the payload unbox, `==`'s two, literal `is`'s two), `atom == "i64"` / `"f64"` / `"f32"` ×3
  (the widened `==` operand), `atom == "f64"` / `"i64"` ×2 (literal `is`'s constant emit),
  `arms[k] == "string"` ×1, `mAtom == "string"` ×1 (the narrowed union-FIELD read). Each becomes
  a compare against the ABI code.
- **Substring SCANS of a type spelling: 1 deleted** — `strContains(nd0.isVariant, "=>")`.

**The brief's census figure is not reproducible and is one release stale.** It reports
`wasmEmit` at 83 operations with `valueAtomKind` at 9; at `fd411bd` `valueAtomKind` is **8** in
that file (#1125 deleted one), and the widest filter this slice could justify — the six
resolvers above plus every SCORECARD-list call in the file — totals **52**, not 83. The 83 is
quoted here as the brief gave it, with the note that no stated resolver list reproduces it.

### `scalarTagOf("null")` ×13 — a classifier whose argument never varies

`null` is a KEYWORD, not a rendered type. `valueAtomKind("null")` is 6 by the seventh arm of a
ladder whose first six compare against six different literals, so the map is a bijection at this
one point and the walk is dead work — 13 times, in `emitUnionCoerce`'s NullLit arm, the `??` tag
test over an ident / a call / a union FIELD, `emitMapGetOrUnionBox`'s miss-box and both of its
peels, the omitted-field default, the optional-chain null test, and four further null-tagged
stores. `emit_rep` now names the code (`nullValKind()`) and the tag (`nullBoxTag()`) beside
`scalarTagOfKind`, where the kind→tag table already lives, and the four `!= 6` guards read
`nullValKind()` too — so the ABI's null code has ONE home.

### The union `==` / literal `is` / unbox machinery is one code asked six ways

`emitUnionConcreteEq` held an atom SPELLING and asked it: the box TAG (`scalarTagOf`), "is it a
string" twice, the payload cast (`emitUnionPayloadUnbox` → `atom == "string"` then
`vbHeapIdxOfAtom`), and the other operand's widened rep (`emitUnionEqOther` → three more
compares). Six derivations of `valueAtomKind(atom)` spread over three functions.
`emitUnionPayloadUnbox` and `emitUnionEqOther` now take the CODE; `emitUnionConcreteEq` and
`emitUnionLitIs` derive it once.

**`emitUnionUnionEq` already had it.** `armKinds[]` comes out of `recordUnMemTys`' banked
`unMemValKind` column — D-UNION-ATOM-KIND's WRITE half, whose READ half this function already
used for the tag — and it then handed the callee the arm's SPELLING to re-derive the same code
for the payload cast. #1110's shape, one layer out: *the bank was read and then discarded.*

The sharpest instance is `emitCoalesce`'s ident arm. It reads the residual member's code out of
the bank (`unionResidualSoloKindOfSet` over the narrowing table's banked set id — the entire
point of D-SETID), renders the residual set to fill `emitValueUnionUnboxRead`'s `atom`
parameter, and that callee's first line parsed the rendering straight back into the code the
caller was already holding. `emitValueUnionUnboxRead` now takes the code.

**Why the substitutions are EXACT, not a fold** (#1095's rule). `valueAtomKind`'s first six arms
are literal compares against six distinct lexemes and nothing below them can produce codes 0–6:
`nulElemListAtomKind` yields only 7 or 9, `litUnionArrayElemOf` only 7, `nameIsFuncTypeAtom`
only 11. So `atom == "string"` ⇔ `k == 2`, `"i64"` ⇔ 3, `"f64"` ⇔ 4, `"f32"` ⇔ 5, `"null"` ⇔ 6,
in BOTH directions. A member that is not a value atom at all (a litunion alias `K0`, code −1)
reaches `vbHeapIdxOfKind(-1)` = −1 and the identical loud reject the spelling path gave; and
`scalarTagOf(a)` is *defined* as `scalarTagOfKind(valueAtomKind(a))`, so the tag substitution is
an inlining.

**One substitution is not a CSE and is called out as such:** at `emitCoalesce`'s ident arm the
callee's producer CHANGES — from `valueAtomKind(crest)` over the rendered residual to the banked
`cak`. They are the same by `unionResidualSoloKind`'s contract ("the structural form of
`valueAtomKind(removeAtomFromSet(set, "null"))`"), and master already relied on that equality at
this very site: it used `cak` for the value-typed blocktype and the `!= 6` gate three lines
above, so a disagreement was already a live miscompile before this slice. The corpus and fuzz
channels measure the equality directly (below).

### TARGET 1 — D-ISTY's ARROW hand-off: the filed diff was WRONG, and the pin exists

#1125 measured `strContains(isVariant, "=>")` as a divergent-but-inert dual (111 divergences, 0
consequential), declined it as "a behaviour change with no pin on any channel", and filed:

```
-    if strContains(nd0.isVariant, "=>") {
+    if unMemIsFunc(isVarTyIxOf(isIx)) {
```

**Both halves are refuted, and the second was refuted by BUILDING the filed diff.**

**1. The pin exists.** #1125's unreachability argument is about the OPERAND: `f: F | null` as a
param fails `emitProgram`'s parameter check, and a narrowed call through the alias fails the
checker. Both re-verified here on `fd411bd`, plus a third the note did not have (`: F | null` as
a RETURN fails with `emitProgram: bare null needs a struct-typed context`). But the gate reads
the `is` TYPE, and the two spellings are independent. An **inline-spelled** nullable-closure
binding tested through the **alias name** reaches the site with the scan false:

```vl
type F = (i32) => i32
function inc(a: i32): i32 { a + 1 }
function go() {
  const h: ((i32) => i32) | null = inc
  if h is F { print(1) } else { print(0) }                 // master: emit REJECT
  if h is (i32) => i32 { print(h(40)) } else { print(0) }  // master: 41
}
go()
```

On master the first test is `emitProgram: `is` names a type that is not a union variant` — a
loud emit reject for a program the checker accepts. Shipped as
`tests/cases/closures/nullable-closure-is-alias-name.vl`; it FAILS on `fd411bd` (verified by
running it with `--compiler` against a master-built seed) and prints `1` / `41` here.

**2. `unMemIsFunc(isVarTyIxOf(isIx))` is a NO-OP at that site.** A probe build wired exactly the
filed diff and reported, from the site itself, `ty >= 0 but not TyFunc`. The reason is #1122's:
`parser.vl` encodes every non-`{…}`-bodied `type N = …` as a **one-member `UnionDecl`**, the
checker's pass 0a registers a `TyUnion` placeholder for it, and #1122's transparency collapse
(`aliasRefIsPlainName`) admits only a plain NAME or a generic APPLICATION member — an ARROW body
is neither, because `aliasRefIsPlainName` requires an identifier head and `(i32) => i32` starts
with `(`. So `T.tys[nameToTy("F")]` is a `TyUnion` over one `TyFunc`. `emit_rep`'s
`tyDenotesFunc` peels the degenerate wrapper (iteratively — an alias chain can nest them) and
then asks `TyFunc`. **A one-member union has nothing to discriminate; it denotes its member —
#1122's own rule, applied one construct further out.**

The sabotage that pins the peel IS the filed diff: `S-ARROWPEEL` stops `tyDenotesFunc` peeling,
and the new fixture stops building.

The direction #1125 measured — the scan says yes, the type says no, at 24 corpus + 87 fuzz
reaches, all struct shapes with a closure FIELD — is untouched: `exprNulClosure` is false at all
111, and the corpus (1,306 pre-existing files) and fuzz (50,400 programs) channels both report
byte-identity, which is that inertness measured again from the other side.

### Channels

Measured on TWO successive landing bases as master moved under the slice — `fd411bd` (D-ISTY)
and `fcc2272` (D-CYCTY, #1127: `emit_collect`). The four owned files are byte-identical across
the two bases (`git diff fd411bd fcc2272 -- <the four>` is empty), and every number reproduces.

| channel | volume | result |
|---|---|---|
| corpus byte / message / run, base `fcc2272` | **1,312 files** | **1 / 1 / 1 — and it is the new ARROW pin, nothing else** |
| corpus, pre-existing files only | 1,310 | **0 / 0 / 0** |
| corpus, base `fd411bd` | 1,307 files | same: **1 / 1 / 1**, the same file |
| fuzz A/B, whole `--out-dir` trees, base `fd411bd` | **50,400 programs/side**, 52,708 output files/side | **0 differing paths** |
| fuzz A/B, base `fcc2272` | **50,400 programs/side**, 52,708 output files/side | **0 differing paths** |

The single differing corpus row is the comparator sanity: a sweep reporting 0 over a corpus that
contains a fails-on-master fixture would be measuring nothing.

### Entombment — eight legs reddened by the PRE-EXISTING corpus, one needed a new pin

Nine sabotages, each applied to the SHIPPED build and swept against it over the whole corpus
(byte, message AND run), on the `fd411bd` base — 1,306 files for the first three rows, 1,307
once the new `union-eq` pin landed. Method note 4: perturb so the value LEAVES the equivalence
class the consumer distinguishes.

| sabotage | what it breaks | byte | msg | run |
|---|---|---|---|---|
| **S-NULLTAG** — `nullBoxTag()` returns the tag of kind 7 | every null-tagged box vs `isArmTagOfTy`'s independently derived null tag | **99** | 0 | 1 stdout + 1 status |
| **S-PAYLOAD** — the payload unbox claims the STRING cast for kind 3 | the `==` / `is` payload `ref.cast` | 7 build-status | **7** | 6 status |
| **S-EQOTHER** — the widened `==` operand's i64 arm never fires | the concrete operand's rep | **1** (see below) | 0 | 1 status |
| **S-EAK** — `emitUnionConcreteEq` gates on `scalarTagOfKind(eak + 1)` | the `==` arm-tag compare | 2 | 0 | 2 stdout |
| **S-LAK** — `emitUnionLitIs` gates on `scalarTagOfKind(lak + 1)` | the literal-`is` arm-tag compare | 3 | 0 | 2 stdout + 1 status |
| **S-UNBOXK** — `??` unboxes the residual at `cak + 1` | the `??` non-null arm's cast | 1 | 0 | 1 status |
| **S-ARMK** — union==union unboxes each arm at `armK + 1` | both payload casts | 4 | 1 | 3 status |
| **S-MFK** — the narrowed union-FIELD read claims the STRING cast for kind 3 | the field unbox | 6 build-status + 1 byte | **7** | 7 status |
| **S-ARROWPEEL** — `tyDenotesFunc` stops peeling the one-member union | the ARROW gate (== #1125's filed diff) | 1 build-status | 1 | 1 status |

**S-EQOTHER was INERT on the pre-existing corpus — 0 / 0 / 0 over 1,306 files — and that is
reported before its fix, not instead of it.** `operators/union-eq.vl` and
`operators/union-eq-reversed.vl` cover the i32 / string / boolean arms, none of which needs a
widening, so the `i64` arm of `emitUnionEqOther` had no pin anywhere in the corpus: master could
have deleted it silently. `tests/cases/operators/union-eq-i64-arm-widens-literal.vl` is that pin
(`i64 | string` compared with an int literal, both `==` and `!=`); it is byte-, message- and
run-IDENTICAL between master and the shipped build, and the sabotage build emits invalid wasm on
it. The re-sweep with it present is the row above.

### The call arithmetic, restated as this doc's four counts

- **Type-string classifier calls DELETED: 18** (`scalarTagOf` ×15, `vbHeapIdxOfAtom` ×2,
  `strContains` ×1). **ADDED: 3** (`valueAtomKind` at `emitUnionConcreteEq`, `emitUnionLitIs`,
  and the shared derivation in `emitIdentNode`). **NET −15.**
- **Whole-spelling equality tests deleted: 12. Added: 0.**
- **Consumers laddered: 0. Sidecars added: 0** (no new state, no reset obligation:
  `nullValKind`/`nullBoxTag`/`tyDenotesFunc` are pure functions of existing tables).
- **Resolutions removed from the PATH, not only from the source:** `emitUnionUnionEq` runs
  `valueAtomKind` zero times per arm where master ran it twice; `emitUnionConcreteEq` and
  `emitUnionLitIs` once where master ran it twice; `emitCoalesce`'s ident arm zero times where
  master ran it once on a rendering it had just produced; and thirteen `null`-tag sites run a
  seven-compare ladder zero times.
- New exports (`emit_rep`): `nullValKind`, `nullBoxTag`, `tyDenotesFunc`. Signature changes
  (private, `wasmEmit`): `emitUnionPayloadUnbox`, `emitUnionEqOther`, `emitValueUnionUnboxRead`
  take an i32 code where they took a `string`.
- Cross-file: `typecheck` / `emit_classify` / `emit_collect` / `emit_base` / `parser` /
  `driver` / `ast` UNCHANGED.

Binary: 1,033,840 → **1,033,945** bytes (**+105**) on `fcc2272`; 1,031,979 → 1,032,084, the same
+105, on `fd411bd`.

### What did NOT move, and the mechanism for each

- **`scalarTagOf`'s last caller** — `emitUnionCoerce`'s bare-closure arm,
  `fbI32Const(scalarTagOf(clArm))` with `clArm = unionClosureArmName(unionName)`. That
  function's own comment already files it ("the returned NAME stays the member's stored
  spelling, which `emitUnionCoerce` feeds to the still-name-keyed `scalarTagOf` — a D5
  residual"). Its arm SELECTION is already structural (`unMemIsFunc(mems[m])`), so the honest
  repair is for it to return the arm's INDEX and the tag to come from `unMemValKindAt` — and it
  lives in `emit_classify`. Folding the tag to the constant `scalarTagOfKind(11)` here instead
  would be a behaviour change in exactly the alias population TARGET 1 just proved reachable
  (an arm spelled `F` has `valueAtomKind("F") == -1`), so it was NOT taken blind.
- **`isValueUnionName` (9 calls in `wasmEmit`, the census's second concentration)** — not a
  projection of one member's kind. It asks a property of the whole member SET (≥2 atoms, every
  atom a value atom, plus the solo-numeric-with-null rule), and its callers hold a rendered
  union NAME with no row id. Its arena dual is a walk of `unMemValKind` over a set id, which
  needs `msSetOfText` first — the same text resolution, plus a decline path. That is a
  laddering, not a deletion. Deliberately not taken.
- **`removeAtomFromSet` (4)** — already the migrated chokepoint (`msSubNull` / `msSubAtom` with
  the string surgery as the fall-through). What its callers did with the rendered residual is
  what this slice deleted at one of the four sites; the resolution itself is one layer down.
- **`emitNarrowedMem`'s `mAtom == "string"`** — the VARIANT-field twin of the struct-field read
  this slice migrated, and it already holds `mk = valueAtomKind(mAtom)` one line above, so the
  change is `if mk == 2`. It was not taken because it landed after the corpus, fuzz and nine
  sabotage builds were measured, and shipping a line the gate had not seen — or re-spending a
  50,400-program gate for a substitution proved identical eleven lines away — was the worse of
  the two. It is one line, in this partition, for the next slice.
- **`emitAsCast`'s `tgt == "f64"` / `"i64"` / `"f32"`** — the emit half of #1124's live
  miscompile, re-verified on `fd411bd`: `type W = f64; const x = 5 as W; print(x)` builds and
  fails to instantiate (`type mismatch: expected f64, found i32`). The checker half
  (`canonEmitTypeNames` never canonising `AsExpr.asTy`) is a concurrent agent's target this
  cycle and is NOT duplicated here. Recorded as a dependency, with the observation that the
  canon fix leaves the emitter still classifying a cast TARGET by its spelling — the same class
  of blindness TARGET 1 just fixed for `is`.

### REFUTATION — #1123's `nameIsRefArray` hand-off is STALE; the state it asks for exists

#1123 filed: *"Deleting it needs the element layer's slot to be banked at the intern site, which
is `emit_state.vl`/`emit_rep.vl` state, not this partition's."* **The column is already there.**
`emit_state.vl:634` declares `rlElemTyIx` — "the ARENA type the slot's STORED element name
denotes … recorded ONCE per slot at intern time (`rlInternName`)" — written at
`emit_classify.vl:9927` and read through `rlElemTyIxAt` (7 call sites) and `rlSlotOfTy` (8). It
landed with destringify D5-final, before #1123 was written.

What is missing is on the CALLER side and cannot be supplied from this partition:
`nameIsRefArray` has **26 call sites** (19 `emit_classify`, 7 `emit_collect`, **0** in the four
files this slice owns — #1125 took the last two), and every one receives a rendered string with
no node and no arena index. The resolver also folds INTERN STATE into its answer
(`structIndexByName`, `shapeElemDeclaredStructIdx`, `variantIndexOf`, a scan of `unNames`), so
its dual is `rlSlotOfTy(…) >= 0` — which needs a type, which is what those call sites do not
have. **Banking more state in `emit_state` unblocks nothing; the work is giving those 26 sites
a node.**

### Hand-offs, each with a verified diff

1. **`emit_classify.vl` — `vbHeapIdxOfAtom` now has ZERO callers compiler-wide** (verified with
   the same stripper: only its own definition header and comments remain). `scalarTagOf` has
   exactly one, above. Both are the atom-spelled entry points #1110 left behind.
2. **`emit_base.vl` — split `atomEqOpcode`.** It is `valueAtomKind(atom)` plus a four-arm kind
   table, and both of its call sites (both in `wasmEmit`) now hold the code:
   ```
   +export function atomEqOpcodeOfKind(k: i32) { …the four arms… }
   -export function atomEqOpcode(atom: string) { const k = valueAtomKind(atom) … }
   +export function atomEqOpcode(atom: string) { atomEqOpcodeOfKind(valueAtomKind(atom)) }
   ```
   This slice did NOT move the table into `emit_rep` unilaterally: that leaves a hand-kept
   duplicate, the exact drift hazard #1110's comment and #1123's whole thesis are about.
3. **`emit_classify.vl` — `exprNulClosure` is spelling-blind to an aliased nullable closure, and
   that is a LIVE INVALID-WASM miscompile.** Measured on `fd411bd`, unchanged by this slice:
   ```vl
   type F = (i32) => i32
   function inc(a: i32): i32 { a + 1 }
   const h: F | null = inc                              // the DECLARATION carries the alias
   if h is (i32) => i32 { print(1) } else { print(0) }
   ```
   → `Invalid input WebAssembly code … type mismatch: expected i32, found (ref $type)`. Identical
   with a module-global `let g: F | null`, and with `h is F`. `exprNulClosure` reaches
   `declaredNulClosure` / `paramNulClosure` / `globalCellKind`, each of which classifies the
   binding's rendered annotation; `F | null` carries no arrow, so the kind-19 niche is never
   assigned and the `is` falls through to the variant ladder. The `is`-side half of this family
   is what TARGET 1 fixed; the DECLARATION side is `emit_classify`'s, and it is a MISCOMPILE,
   not a reject.
4. **`typecheck.vl`** — `nameToTy` returns a one-member `TyUnion` for an arrow-bodied alias
   while returning the member itself for a plain-NAME alias (#1122's `cPlainAliasNames`). Every
   arena consumer that asks "is this type a closure / a map / an array" must therefore peel, or
   answer wrongly for one alias spelling and not the other. `tyDenotesFunc` peels for the one
   consumer this slice needed; the general fix is to extend `aliasRefIsPlainName`'s collapse to
   any one-member body, or to hand consumers a `tyDenotes*` family.

### Method notes earned

62. **A classifier call whose ARGUMENT is a literal is a deletion, not a migration**
    (D-ATOMKIND) — 13 of `wasmEmit`'s 16 `scalarTagOf` calls passed the constant `"null"`. The
    census counted them as consumer operations and they were; but the fix needed no bank, no
    probe and no equivalence argument, because `valueAtomKind("null")` is 6 by inspection of a
    ladder of literal compares. Before designing a dual, check whether the argument varies.
63. **A filed one-line diff is a hypothesis; build it before quoting it** (D-ATOMKIND) —
    #1125's ARROW hand-off shipped an exact diff with its rationale, and the diff is a no-op:
    the alias resolves to a `TyUnion` over a `TyFunc`, so `unMemIsFunc` answers false at the
    very site the diff exists to fix. One probe build said so; no amount of reading would have.
    (Note 49's shape, applied to a hand-off rather than to a refinement.)
64. **"No pin is available" is a claim about a SEARCH, and the search can be looking at the
    wrong operand** (D-ATOMKIND) — #1125 looked for a program whose nullable-closure OPERAND
    could be spelled through an alias, proved that unreachable twice, and concluded the site was
    unpinnable. The gate reads the `is` TYPE. Spelling the operand inline and the TEST through
    the alias reaches it in five lines. When a two-gate site is declared unreachable, check that
    the reachability argument is about the gate being migrated.
65. **An inert sabotage is a hole in the CORPUS, and the slice that finds it should fill it**
    (D-ATOMKIND) — S-EQOTHER deleted the `i64` widening from every union `==` and changed
    nothing over 1,306 files, because the three existing `union-eq` fixtures use arms that need
    no widening. Reporting "inert, so no pin can exist" (#1114/#1119/#1123's honest form) was
    available and would have been wrong here: the pin did not exist, but it was five lines away.
    Try to WRITE the pin before recording that none can be had.
## D-ASCANON + D-RECRENDER — the `as` target joins the emitter's vocabulary, the renderer stops looping, and the checker's tree is measured TOTAL and FRESH (#1129)

Branched at `fd411bd`, rebased onto `0d25eaa` (D-CYCTY #1127 + D-ATOMKIND #1128 landed
underneath). **Every reproduction, pin and gate below is stated against `0d25eaa`**; where a
measurement was taken at an earlier base it says so.

D-CYCTY landed a `collectU` guard that REJECTS a recursive GENERIC alias with a named emit
error, and its own summary says it "does not protect a future `tyToEmitName` consumer". That is
confirmed here from the other direction: **both of this slice's recursion legs still trap the
compiler on `0d25eaa`** — they reach `tyToEmitName` through `canonEmitName`'s `&`-fold and
through `unionMemberGenAppShape`, neither of which sits behind that guard, and neither of which
is a recursive generic INSTANCE (the recursion is in a plain declared struct).

The brief: (1) fix the live `x as <non-i32 alias>` invalid-wasm miscompile #1126 handed off;
(2) fix or bound `tyToEmitName`'s non-termination on a recursive type, filed as latent;
(3) retire `nameToTy`, the checker's second recursive-descent type parser, whose stated
prerequisite was that the canon pass makes the parser's spelling tree stale.

**Two of the three reports are corrected by measurement.** Target 2 is not latent — two
single-file, well-typed programs make the compiler die today. And target 3's mandatory
prerequisite does not apply to the consumers that matter for `nameToTy`: at the checker's own
positioned resolver funnels the tree is **100% present and 0% stale over 333,073 reads**,
because the canon pass runs *after* checking.

### TARGET 1 — `x as <alias>`, and why the handed-off diff is not the one that ships

Reproduced on `fd411bd` and re-verified on each rebase parent, last on `0d25eaa` (each run against a
parent-built compiler with `--compiler`):

| program | master |
|---|---|
| `type W = f64` · `const x = 5 as W` · `print(x)` | `type mismatch: expected f64, found i32` |
| `type W = i64` · … | `type mismatch: expected i64, found i32` |
| `type W = f32` · … | `type mismatch: expected i32, found f32` |
| `type W = i32` · … | runs (no conversion needed) |

Mechanism, and it is wider than the hand-off said. **Four** emit consumers read `AsExpr.asTy`
as a STRING and compare it to the four primitive spellings — `emitAsCast` (`wasmEmit.vl`,
`tgt == "f64"` / `"i64"` / `"f32"`, else the i32 arm), `exprIsI64` / `exprIsF32` / `exprIsF64`
(`emit_classify.vl:5776, 5938, 6048`, `e.asTy == "i64"` …), and the value-type feature scan in
`emitProgram` (`emit_sections.vl:2077-2079`, `strContains(pn.asTy, "i64")`). `canonEmitName`
resolves an alias; `canonEmitTypeNames` swept `TypeRef`, `UnionDecl` and `IsExpr` and **never
`AsExpr`**. One missing arm, four broken consumers.

**The handed-off diff was `n.asTy = canonEmitName(n.asTy)`. What ships reads the arena
instead**, and the difference is a parse:

```vl
    } else if n is AsExpr {
      const at = primNameOf(nodeTyIxOf(i))
      if at == "i32" || at == "i64" || at == "f32" || at == "f64" {
        if at != n.asTy { n.asTy = at }
      }
    }
```

`checkNode` banks the cast's checked type on the node (`nodeTyIx[ix] = checkCastNode(n, ix)`),
and `checkCastNode` admits the cast **only** when the target RESOLVES to one of
i32/i64/f32/f64 (`primNameOf(nameToTyAt(n.asTy, ix))`). So the primitive name read straight off
the typed-IR **is** the emitter's vocabulary here — total by the checker's own admission rule,
and incapable of disagreeing with the checker. `canonEmitName`, by contrast, is a string
rewriter whose arms call `nameHasPipe`, `splitTypeName`, `isTopLevelFuncTypeName`, `nameHasSep`
and `nameToTy`: routing a new consumer through it would have added a parse to a family this
program is retiring. The four-way gate repeats `checkCastNode`'s rule so a REJECTED cast keeps
the author's spelling for the diagnostic that already quotes it.

Pins (both FAIL on the parent, verified by running each against a `0d25eaa`-built compiler):

- `tests/cases/numerics/as-cast-alias-target.vl` — the alias mirror of `as-cast-values.vl`:
  the same 4×4 runtime matrix through `type I32/I64/F32/F64`, every expected line identical to
  the primitive spelling's, plus three CHAINED aliases (`Wide` → `I64` → i64). Parent:
  `type mismatch: expected i64, found i32`.
- `tests/cases/modules/as-cast-alias-nonI32/` — the module leg. The two pre-existing module
  `as`-cast pins (#1126) both alias **i32**, the one target needing no conversion, so they run
  even when the emitter mistakes the alias for i32. With `f64`/`i64` the same mistake emits
  invalid wasm. Parent: `type mismatch: expected f64, found i32` in `half$m1`.

Sixteen further shapes were checked by hand and all now match their primitive spelling exactly:
`as <alias>` inside an inferred-return function, a lambda, a generic call, a `.map` callback, a
call argument, an array literal, a struct-field initialiser, and an arithmetic operand.

### TARGET 2 — REFUTED: `tyToEmitName`'s non-termination is not latent, and it is pinnable

The hand-off filed it as reachable only by a probe ("the compiler does not hit this today
because nothing renders those annotations"). **Two single-file, well-typed programs make the
COMPILER ITSELF die on the parent**, through two different callers:

```vl
type Node = { v: i32, next: Node | null }
const n: Node & { v: i32 } = { v: 1, next: null }   // canonEmitName's `&`-fold arm
```
```vl
type Node = { v: i32, next: Node | null }
type Box<T> = { b: T }
type U = Box<Node> | { w: i32 }                     // unionMemberGenAppShape
```

Both: `wasm trap: call stack exhausted`, a wasm backtrace and no diagnostic. A recursive type
is a CYCLE in the arena and `tyToEmitName` renders structurally — every arm recurses into the
field / element / member / result types, so the render of a cycle is an infinite string.

The scale is worth stating plainly: with the pin file in the tree, `vl check tests/cases` on
the parent **dies on the whole directory** (one wasm trap takes the shared instance down); the
shipped build reports `Found 204 errors, 119 warnings.`

Fixed with `isEquatable`'s guard, moved to the renderer: `tyToEmitName` becomes a wrapper
holding an ANCESTOR stack, the 15-arm body becomes `tyToEmitNameGo`, and a type already on the
stack renders `""` — which is what every caller already does with an unrenderable type. Nothing
is lost: the recursive shapes the emitter *does* lower ride their NOMINAL annotation spelling
(`Node`), never a structural render. Both programs now compile and run.

**Ancestors, not "seen".** The stack is pushed and popped around the recursive entry, so a
shape mentioning one struct TWICE as siblings (`type Pair = {a: S, b: S}`) still renders both.
The pin carries that as its third leg, so a future "remember every index visited" simplification
reddens.

Pin: `tests/cases/types/recursive-type-emit-render-cycle.vl` (all three legs in one file).
Parent: `wasm trap: call stack exhausted`.

### TARGET 3 — REFUTED: the canon-staleness prerequisite does not gate the CHECKER's consumers

The brief made prerequisite 1 mandatory *before reading the tree at all*: `canonEmitTypeNames`
rewrites `n.tyName` in place without updating `annTsRoot`, so downstream the tree describes the
pre-canon name.

That is true, and it is an EMIT-time fact. `canonEmitTypeNames` runs at the END of
`checkProgram`. Every `nameToTy` / `resolveAnnot` call the CHECKER makes has already happened.

Measured, not reasoned. A probe inside the two positioned resolver funnels — `nameToTyAt` and
`resolveAnnotAt`, which between them carry 8 of the call sites and receive the annotation NODE
— comparing `tsToName(annTsOf(node))` against the string the checker is about to parse, plus a
post-canon sweep of every `TypeRef`, reported as a checker diagnostic at the end of
`checkProgram` (method note 17):

Measured at the `fd411bd` base (the probe builds predate the rebases; the two funnels, the
canon pass and the bank are byte-identical across all three parents — #1127 touches only
`emit_collect.vl` and #1128 only `wasmEmit`/`emit_rep`/`emit_state`/`emit_rewrite`):

| | corpus (1,279 files) | fuzz (50,400 programs) |
|---|---|---|
| reads at the two funnels | **146,048** | **187,025** |
| tree present AND renders the exact string | **146,048** | **187,025** |
| **STALE** (tree renders a different name) | **0** | **0** |
| **MISSING** (`TypeRef` with no tree) | **0** | **0** |
| — | | |
| `TypeRef` nodes swept AFTER canon | 59,193 | 97,473 |
| STALE after canon | **124** (59 files) | **979** |
| missing after canon | 0 | 0 |

**333,073 checker-time reads, 0 stale, 0 missing, on both channels.** The tree is TOTAL and
FRESH for exactly the population `nameToTy` serves. The staleness is real and lands entirely on
the far side of the pass that causes it.

Two counting notes. (a) The `at` argument is a diagnostic POSITION node, and for a struct FIELD
that is the `FieldDef`, not its `TypeRef` child; before following that one hop, 3,851 corpus
reads landed on a node with no row — a probe artifact, not a coverage hole, and worth recording
because it looks exactly like one. (b) The post-canon figure re-derived at this head is
**124 / 59 files**, not the 111 / 46 inherited from #1126 — a different sweep point (end of
CHECK, so files that never reach emit are included) and two more pin files.

**Sabotage.** The probe's 0 is only worth what its wire is worth. A build whose `pbNote` reads
`annTsOf(at - 1)` — a one-node shift, the off-by-one class, not an injective relabel —
reclassifies **142,089 of the same 146,048 corpus reads** (97.3%): fresh 146,048 → 3,959, stale
0 → 452, no-tree 0 → 141,582. (The 3,959 survivors are neighbouring annotations that genuinely
carry the same spelling — `i32` beside `i32` — which is what an off-by-one on a dense column
looks like.) #1117's VALUE sabotage on the same bank (the parser stops recording `[]`) is the
upstream evidence that the bank itself is sensitive.

**What this changes for the next slice.** `tsToTy` — the structural dual of `nameToTy`, arm for
arm, which #1117 built as a probe and did not ship — is the whole remaining cost of the
checker-side migration. It does not need the canon fixed first, and it does not need a string
fall-through: at every checker-time consumer the column is total TODAY. The canon problem is
real and stays owned by the EMIT-time consumers (`emit_rep.vl`'s 7 `resolveAnnot` calls and
everything downstream of `TypeRef.tyName` after the sweep), which is where P4 belongs.

**Corrections to the brief's enumeration, counted at this head** (`grep -Hn`, `//` stripped by
a string-literal-aware scanner, definition headers excluded, per-file sums cross-checked
against the tree-wide total):

| resolver | brief | this head | where |
|---|---|---|---|
| `nameToTy` | 27 | **28** | typecheck 28 |
| `nameToTyAt` | 4 | 4 | typecheck 4 |
| `resolveAnnot` | 3 | **8** | typecheck 1 · **`emit_rep.vl` 7** |
| `resolveAnnotAt` | 4 | 4 | typecheck 4 |
| `tyGtIsClose` | 14 | 14 in typecheck, **33 tree-wide** | +emit_base 8 · emit_classify 8 · emit_collect 3 |
| `skipQuotedName` / `splitTypeName` / `topLevelArrowIndex` / `nameHasSep`+`nameHasPipe` / `splitGenArgs` / `splitTopAmp` | 10 / 6 / 3 / 8 / 2 / 1 | 10 / 6 / 3 / 8 / 2 / 1 | typecheck |

`resolveAnnot` is the one that matters: **7 of its 8 call sites are in `emit_rep.vl`**, another
partition and the far side of the canon pass. A typecheck-only migration reaches 1 of 8.

### `holeDemandTy`'s dedup key — migrated, and measured DEAD

`holeDemandTy` (`typecheck.vl:7240`) deduplicated its alternative arms on `tyToStr(m)` —
render-equality standing in for type identity, this program's own discredited proxy — while its
SIBLING (`noteHoleAlt` / `holeAltIndex`, 7080 / 7103) already dedups the same alternatives with
`tyEq`. Two ways the render key is not the question: `tyToStr` TRUNCATES at depth 8 (`…`), so
two arms differing only below it collapse into one; and it prints `Nullable(TyFunc)` and
`TyFunc(→ Nullable)` alike. Migrated to `tyEq` (`tyArrHasEq`), which decides render-equality
structurally with a cycle guard. `strArrHas` had no other caller and is deleted.

**Stated plainly: no pin can exist for this one, and here is the measurement.** A build whose
`tyArrHasEq` always returns `false` (dedup removed) is message-identical over the shared-instance
`vl check tests/cases` channel, and six hand-written duplicate-arm programs are identical on
parent, ship and sabotage. A reach probe explains why:

| | calls | TRUE returns |
|---|---|---|
| corpus, 1,279 files | **6** (all in `soundness/hole-is-guard-alternative-reject.vl`) | **0** |
| fuzz, 50,400 programs | **0** | **0** |

The dedup never fires, because `noteHoleAlt` already dedups upstream with `tyEq` and no
duplicate alternative ever reaches this list. It ships anyway: it removes two render-equality
resolutions from the standing check's first grep and the last string-keyed membership test in
the file, and if it ever DOES fire the truncating key would be the wrong answer.

### The call arithmetic

**0 parses deleted · 0 laddered · 0 added · NET 0. 2 render-equality resolutions DELETED.**
Counting method as stated above; the parser list is the SCORECARD CORRECTION's plus #1117's
four additions.

| | parent `0d25eaa` | now |
|---|---|---|
| the 23-parser list, tree-wide | **530** | **530** |
| `nameToTy` / `nameToTyAt` / `resolveAnnot` / `resolveAnnotAt` | 28 / 4 / 8 / 4 | 28 / 4 / 8 / 4 |
| `tyToStr` (renderer) | 146 | **144** |
| `tyEq` | 13 | 14 |
| `strArrHas` | 1 def + 2 calls | **deleted** |
| `primNameOf` (an ARENA read) | 17 | 18 |

The `AsExpr` arm is the point: it is a new emit-vocabulary consumer that costs **zero** parses,
because it reads `nodeTyIx`. The handed-off `canonEmitName` version would have added one.

### Allocation and work (method note 24)

`tyToEmitName`'s guard adds one `i32` push + pop on ONE module-level array per invocation, and
an O(current-depth) ancestor scan. The array oscillates between empty and the render's depth,
so its capacity stabilises immediately and it is empty on entry and exit of every top-level
call (which is also why it is not an arena-lifetime sidecar, method note 7). The `AsExpr` arm
adds one `nodeTyIxOf` + `primNameOf` per `AsExpr` node — 31 in the whole corpus, **0** in the
compiler's own 16-module build. `holeDemandTy` loses one `string[]` and every `tyToStr` render
it used to build.

Binary, like-for-like (ONE compiler, two sources): 1,033,945 → **1,034,041** bytes (**+96**). Self-compile of ONE fixed
input (the pinned parent snapshot), 3 runs each, at the `fd411bd` base: parent 1604 / 1725 / 1879 ms, ship
1790 / 1636 / 1687 ms — indistinguishable, and stated as the wall-clock sanity check it is
rather than a measurement (method note 15).

### Gate

Corpus **byte-, message- AND run-diff**, **1,350 entries** (`tests/cases` + a pinned parent
snapshot of `compiler/` + `std/` + `scripts/*.vl`, plus every `tests/cases/modules` directory
built as a unit; compiler stdout/stderr with the out-path normalised, exit codes compared, run
output + exit code compared): **5 byte-diffs, 5 message-diffs, 5 run-diffs — all 5 are the
three new pins** (the module pin counted as its directory, as `entry.vl` and as `lib.vl`).
**0 diffs of any kind on all 1,345 pre-existing entries.**

Shared-INSTANCE channel (note 32), with the three new pins moved aside so the comparison is
over the pre-existing corpus: `vl check tests/cases` is `Found 204 errors, 119 warnings` on
both sides, **0 diff lines**; `vl check compiler` and `vl check std` are byte-identical.
With the recursion pin left IN, master's run dies with `wasm trap: call stack exhausted` and
produces no summary at all — the target-2 pin, on the shared-instance channel.

Fuzz A/B **50,400 programs/side** (14 seeds × depths 4/5/6 × {plain, `--branching --multiobs
--declared`} × 300, generated ONCE by the PARENT compiler so both sides see identical
programs), whole `--out-dir` TREES via `diff -r`, **52,703** output files/side: **0 differing
paths** (`diff -r` RC=0, 0 output lines).

`refresh-compiler.sh` RC=0 (1,034,041 bytes) · `rep-fuzz-check.sh` RC=0 (exact; 1 baselined
failure — 0 unsound, 1 reject; 0 new, 0 stale) · `native-fixpoint.sh` RC=0 (stage3 == stage4,
1,034,041 bytes) · `lint-self.sh` RC=0 · `SELFHOST_NATIVE_ALIGN=1 deno task test` RC=0
(**2,004 passed, 0 failed, 8 ignored** — 2,001 with the three pin entries moved aside,
measured in this worktree, + 3).

### What did NOT move, and the mechanism

- **`nameToTy` — 0 of 28 sites.** The missing piece is `tsToTy`, and it is the ONLY missing
  piece for the checker half: #1117 built it as a probe (0 structural disagreement over
  319,945 comparisons) and shipped the BANK without it. This slice's contribution is that the
  gating question — "is the tree usable before the canon problem is solved?" — is now answered
  YES for the checker, with 333,073 reads on two channels behind it. Writing `tsToTy` is a
  ~150-line structural dual of a 315-line character-surgery function; it was not attempted
  here rather than attempted unproven.
- **`canonEmitName`'s own parsing.** It splits, peels parens, finds top-level arrows and folds
  intersections over the STRING — and it runs DURING the canon pass, so its inputs are the
  pre-canon spellings the tree describes exactly. It is the natural next consumer after
  `tsToTy` exists, and a structural `canonEmitTs` is also what P4 needs to rewrite the tree in
  lockstep. Not attempted: it is the same missing dual.
- **`tyToEmitName`'s callers still receive a rendered NAME.** The cycle guard makes the
  renderer total; it does not make the arc `arena → tyToEmitName → parse` go away. That is
  #1126's method note 51 and it is unchanged.

### Hand-offs

**Hand-off 1 — `emit_rep.vl`'s 7 `resolveAnnot` calls are the post-canon population.** They
resolve a name AFTER `canonEmitTypeNames`, so they are the consumers prerequisite 1 actually
gates, and they are 7 of that resolver's 8 sites. Whoever owns `emit_rep.vl` should know that
the checker-side tree is not their column — theirs needs P4 first.

**Hand-off 2 — P4 is unchanged and still owned by `typecheck.vl`**, with this slice's
re-derived population: **124 stale `TypeRef` nodes over 59 corpus files** (979 over 50,400 fuzz
programs), 0 missing. #1126's decomposition still applies: literal → base is a leaf rewrite,
alias → member can SUBSTITUTE `udTsRoot`, and union-member dedupe after widening is structural.

**Hand-off 3 — the four `asTy` string consumers can now be deleted rather than fixed.**
`emit_classify.vl:5776 / 5938 / 6048` (`e.asTy == "i64"` / `"f32"` / `"f64"`) and
`emit_sections.vl:2077-2079` (`strContains(pn.asTy, …)`) are now guaranteed to see one of the
four primitive spellings, so they are correct as written — but each is a structural decision
made by comparing a type NAME, and each has `nodeTyIxOf(<the AsExpr node>)` available beside
it, which is the same answer without the string.

### Method notes earned

58. **"Latent" is a claim about REACHABILITY and it needs a reachability search, not a
    caller-count** (D-RECRENDER) — a non-terminating renderer was filed as unreachable because
    "nothing renders those annotations". Two callers do: an INTERSECTION annotation folds
    through the checker algebra and renders the fold, and a generic APPLICATION as a union
    member resolves to its structural shape. Both are four-line single-file programs, both kill
    the compiler with a stack-exhaustion trap on master, and one of them takes the whole
    shared-instance `vl check` run down with it. Before filing something latent, enumerate its
    callers and construct an input for each.
59. **A staleness prerequisite has a PHASE, and the consumers on the near side of it are not
    blocked** (D-ASCANON) — "the canon pass invalidates the tree" was filed as mandatory before
    reading the tree at all. The pass runs at the END of `checkProgram`, so it cannot reach a
    single one of the checker's own resolutions: 146,048 corpus + 187,025 fuzz reads at the two
    positioned funnels, 0 stale and 0 missing. The prerequisite is real and belongs entirely to
    the emit-time consumers. Ask WHEN the invalidating pass runs relative to the consumer
    before inheriting the block.
60. **When a hand-off ships a diff, check whether the thing it computes is already banked**
    (D-ASCANON) — the handed-off fix was `n.asTy = canonEmitName(n.asTy)`, a STRING canon that
    would have added a call to a rewriter whose arms call `nameToTy`. The checker had already
    banked the cast's resolved type on the node, and `checkCastNode`'s own admission rule makes
    the arena read total. Same four programs fixed, one parse fewer, and no second answer that
    could drift from the checker's. A verified hand-off diff is evidence the BUG is real, not
    that the FIX is the right one.
61. **A dedup whose upstream already dedups is dead, and the honest output is the reach count**
    (D-ASCANON) — `holeDemandTy`'s `tyToStr` key is exactly the discredited proxy this program
    exists to delete, and migrating it to `tyEq` is right. It is also unpinnable: 6 calls over
    the corpus, 0 over 50,400 fuzz programs, 0 TRUE returns on either, because `noteHoleAlt`
    dedups the same alternatives with `tyEq` one layer up. Ship it, say the sabotage is inert
    on every channel, and give the number instead of a pin.

## D-ELEMHOME + D-GAELEAF — the shape layer's FIELD SCANNER and its ELEMENT-NAME table get ONE home, and TARGET 2's premise is refuted twice (#1130)

Branched at `fd411bd`, rebased through `0d25eaa` (D-ATOMKIND #1128) onto **`cd69bd9`**
(D-ASCANON + D-RECRENDER #1129). Every number below is stated against `cd69bd9`; where a
measurement was first taken at an earlier base and MOVED, both readings are given, because the
move is the finding.

Three things, in `compiler/emit_classify.vl` only:

1. **D-DEADTAG** — `mapTagOf` / `refArrTagOf`, which #1125 left with zero callers, are deleted.
2. **D-ELEMHOME** — the `{…}` field SCANNER (six hand-copied copies) and the field
   ELEMENT-NAME dispatch (three hand-copied copies) each get one home: D-FIELDCODE's move
   applied to the two tables one layer down.
3. **D-GAELEAF** — a generic APPLICATION buried inside another annotation's field text now
   interns. Closes the gap `tests/cases/generics/type-arg-list-field.vl` was pinned on, and an
   INVALID-WASM hole in the generic-instance interner.

### The counting method, and the UNIT

Local-aware, **by resolver actually called**, over `compiler/emit_classify.vl` (this slice's
whole partition). Comments stripped and string literals blanked before matching; each
resolver's own `function NAME(` header excluded; per-file sums cross-checked against the
tree-wide total. The list is the SCORECARD CORRECTION's parser list plus D-ARROWTY's four
additions — **319 call sites at master `cd69bd9`**, reproducing D-FIELDCODE's number exactly
(`emit_classify.vl` is byte-identical at `0d25eaa` and `cd69bd9`).

Two other census UNITS appear below and are NOT interchangeable with it: *inline character
surgery* (the hand-written depth scanners) and *name-keyed resolutions*.

### 1. D-DEADTAG — two functions with zero callers

Re-grepped at `cd69bd9`, not taken from #1125's hand-off: `mapTagOf` and `refArrTagOf` have
**0 call sites compiler-wide** (`compiler/*.vl` + `std/*.vl` + `scripts/*.vl`; every remaining
textual hit is a doc comment). Deleting them removes **2 parses** (`mapValNameOf`,
`refArrElemName`) and **2 name-keyed resolutions** (`mvSlotOfMapValNameOrMono`, `rlSlotByName`).
`mapSlotTag` / `refArrSlotTag` — the slot→tag halves, which `wasmEmit` calls 3 + 5 times —
stay; their `emit_classify` call counts go 1 → 0 because the deleted wrappers were their only
callers here.

### 2a. D-ELEMHOME, the SCANNER — six copies of the annotation grammar become one

`emit_classify.vl` carried **eight** `{}[]()<>`-depth scanners. Six of them are the SAME loop
over the SAME alphabet with the SAME `part.indexOf(":")` split, differing only in what they do
with each `(name, text)` pair:

| function | what it does per field |
|---|---|
| `funcTypeShapeLowerable` | classify + recurse; reject an unsupported code |
| `variantNestedShapeOk` | the intern-free mirror of the same acceptance |
| `internNonLowerableFieldShapes` | descend a closure / nested-shape field |
| `internShapeFieldElems` | peel `[]` and intern a `{…}` leaf |
| `internInlineShape` | classify, pre-intern, push the row |
| `internShapeAs` | classify, `emitFail` on a bad field |

They are now `shapeInnerFieldSplit(inner, outNames, outTexts)` plus six loops. The split is
PURE, so every caller's per-field side effects (`internShapeDeep`, `internInlineShape`,
`registerValueUnionName`) run in the same left-to-right order they did interleaved with the
scan. A malformed part (`ci <= 0`) pushes an EMPTY name — a well-formed field name always has
at least one character before its `:`, so `outNames[i] == ""` is exactly the test each copy
applied inline.

**This is why #1118's `<>` repair and #1120's sweep had to be applied one scanner at a time.**
Measured, unit = *inline character surgery*: `tyGtIsClose` call sites in this file go
**8 → 3** — the shared splitter, plus the two scanners that are genuinely different grammars
and are documented as staying (see "what did not move").

### 2b. D-ELEMHOME, the TABLE — the field ELEMENT-NAME dispatch

`shapeFieldElemName(ftxt, code)` is the shape-text element-name recorder. #1123 already routed
the NODE recorder (`fieldRefElemName`) through it, keeping the three arms that genuinely
differ. Two more hand-copied copies remained: `internInlineShape`'s per-field push loop (10
arms) and `gaeEnsure`'s (4 arms). Both now delegate.

`internInlineShape` — arms 16 / 15 / 19 / 29 / 0 / 4 / 30 and the default are **character-for-
character the same recording** as `shapeFieldElemName`'s, so they delegate; the code-16 arm's
`registerValueUnionName` SIDE EFFECT stays at the call site. Codes **5 and 28 stay local** and
are documented: this recorder resolves an element through the ALREADY-INTERNED tables
(`structIndexByName`, plus a grouping-paren peel) where the shape-text one records a DEFERRED
`[]`-slice for `collectA`'s variant field pass. That difference is load-bearing — sabotage S2.

### 3. D-GAELEAF — the buried generic APPLICATION

`collectGenAliasShapes` (`emit_collect`) interns an application only where a TypeRef spells it
BARE, behind `| null` / `[]` (`gaePeelWrappers`). Its own comment records the same hole for the
map-VALUE position and patches it there. The INLINE-SHAPE FIELD position has it too: in
`{v: Pair<i32,string>[]}` the application is interior to the shape spelling, so no interner
reached it and the code-5 field's element lookup failed loudly.

`internShapeDeep` already peels every wrapper (grouping / `| null` / `[]`) and descends a MAP's
value position; it now interns a generic-application LEAF through `gaeEnsure`. One line, at the
bottom of the descent, where the leaf is already in hand.

And `gaeEnsure`'s own element table was 4 arms where the shape-text table has 9 — a code-0
litunion-atom field of a generic instance recorded `""`, so the row read back as a plain i32
slot and the member literal emitted as a STRING ref into it. **INVALID WASM on master**, the
exact shared-layout / different-encoding split `annShapeIndexOf`'s code-0 comment describes for
the inline-shape path. The delegation closes it.

Four programs graduate, each pinned:

| pin | master `cd69bd9` | now |
|---|---|---|
| `generics/type-arg-list-field.vl` (was an `@emit-error`) | "ref-list field element type is not interned" | **runs** |
| `generics/type-arg-list-field-return.vl` (new) | same reject | **runs** |
| `generics/type-arg-nested-list-field.vl` (new, `Box<i32>[][]`) | same reject | **runs** |
| `generics/type-arg-litunion-field.vl` (new) | **"failed to parse WebAssembly module"** | **runs** |

Verified with `--compiler`: master's suite run with the three new files present is
**1,998 passed / 3 failed**; the shipped build is **2,000 passed / 0 failed**.

### The measurement — corpus and fuzz, both channels

| channel | volume | result |
|---|---|---|
| corpus byte / message / run (A = `cd69bd9`, B = shipped) | **1,319 files** | **4 differ, all four the intended graduations; 1,315 byte-, message- AND run-identical** |
| fuzz A/B, whole `--out-dir` trees | **50,400 programs/side**, 52,708 output files/side | **0 differing paths** |

### The work, COUNTED not timed (method note 15)

The split now allocates two arrays per scanner call where four of the six copies allocated
none. Both compilers were instrumented identically — a tick at each scanner entry and at each
`part` produced — and swept over the same corpus:

| | scanner calls | parts produced | reporting files |
|---|---|---|---|
| master | 3,492 | 5,363 | 1,112 |
| now | 3,498 | 5,369 | 1,115 |

On the **identical 1,112-file population** the counts are **3,492 → 3,492** and
**5,363 → 5,363**, with **0 per-file differences**; the +6/+6 is exactly the three programs
that newly reach `emitProgram`'s end. So the character scanning is unchanged and the added
cost is two array allocations per call — ~3 per corpus file. Counted, because a change this
size is invisible to a wall clock (method note 15).

### Entombment — four sabotages redden, one is corpus-blind and fuzz-red, one is inert

Each sabotage is applied to the SHIPPED build and diffed against it over the corpus (byte,
message AND run), on the landing base `cd69bd9`:

| sabotage | corpus byte | msg | run | fuzz tree-diff |
|---|---|---|---|---|
| **S1 the shared splitter goes `<>`-BLIND** (the `<` / `>` arms deleted) | **2** | **2** | **2** | — |
| **S2 `internInlineShape`'s code-5/28 arms DELEGATE** | 0 | 0 | 0 | **4 / 25,200** |
| **S3 `gaeEnsure` reverts to master's 4-arm element list** | **1** | **1** | **1** | — |
| **S4 `internShapeDeep` loses the `gaeEnsure` leaf arm** | **3** | **3** | **3** | — |
| S5 the splitter's MALFORMED marker inverted (push the raw part as the NAME) | 0 | 0 | 0 | **0 / 25,200** |
| **S6 the `internInlineShape` delegation is neutered** (`shapeFieldElemName(txt, -1)`) | **126** | **126** | **125** | — |

- **S1 is the single-splitter pin.** One edit, in ONE function, reddens the generic-bracket
  fixtures — which is the whole point: on master the same edit would have had to be made six
  times to have the same effect, and #1118 is the record of what five-out-of-six looks like.
  (`type-arg-nested-list-field.vl` is correctly unaffected: `Box<i32>[][]` has one type
  argument and therefore no comma to mis-split.)
- **S2 is CORPUS-BLIND and fuzz-RED** — method note 5's case, found only by running both. The
  witness (seed 6, depth 6, `--declared --branching --multiobs`, case 353) is a declared-twin
  program with a `{f: {f: i32}[]}` field: master and the shipped build both reject it with
  "ref-list field element type is not interned"; S2 **compiles and runs it**. So merging the
  code-5/28 arms is a behaviour CHANGE (one that graduates programs), not a dedup — filed as a
  hand-off rather than taken.
- **S5 is inert on both channels, and mostly inert BY CONSTRUCTION** (method note 8), stated as
  such rather than as evidence. For five of the six consumers the perturbation cannot leave the
  equivalence class: `nameFieldCode("")` is -1, which drives `okAll = false` / `ok = false` /
  a no-op descent — exactly what the `ci <= 0` branch did. It leaves the class for
  `internShapeAs` alone, where the message changes from "malformed struct field" to "only i32 /
  boolean / string / array struct fields are supported" — and no channel reaches a malformed
  field in `internShapeAs`. **No pin can exist for it today** (the #1114 / #1119 / #1123 form),
  and per method note 65 the attempt to write one was made: a malformed shape alias is not
  constructible through the parser, which is what makes the branch dead in the first place.

### The call arithmetic

`emit_classify.vl` only; no other file changes.

| resolver | master `cd69bd9` | now | delta | where |
|---|---|---|---|---|
| `mapValNameOf` | 27 | 24 | **−3** | `mapTagOf` ×1, `internInlineShape` codes 19 + 29 ×2 |
| `nullablePartOf` | 54 | 52 | **−2** | `internInlineShape` code 15, `gaeEnsure` code 15 |
| `refArrElemName` | 30 | 29 | **−1** | `refArrTagOf` |
| `nameIsLitUnionType` | 19 | 18 | **−1** | `internInlineShape`'s code-0 guard |
| **parser-list TOTAL** | **319** | **312** | **NET −7** | |

Off the parser list, the same delegations take `nulMapInnerName` 8 → 7,
`nameIsLitUnionArray` 9 → 7, `nulLitUnionInnerName` 2 → 1 — **−4 further type-name classifier
calls**, so **11** in total.

- **Type-string PARSES deleted: 7** (parser list) / **11** (every classifier).
- **Parses ADDED: 0. Sidecars added: 0. Consumers laddered: 0.**
- **Name-keyed RESOLUTIONS deleted: 2** — `mvSlotOfMapValNameOrMono` 13 → 12,
  `rlSlotByName` 14 → 13.
- **Inline character surgery deleted: 5 of 8 depth scanners** — `tyGtIsClose` 8 → 3.
- Delegation edges ADDED: 2 (`internInlineShape` → `shapeFieldElemName`,
  `gaeEnsure` → `shapeFieldElemName`), retiring 14 hand-copied arms.
  `gaeEnsure` 1 → 2 calls (the new `internShapeDeep` leaf arm).
- Tree-wide parser list: **530 → 523**.
- Source: **284 insertions, 427 deletions** (−147 lines in `emit_classify.vl`).
- Binary: 1,034,041 → **1,030,494** bytes (**−3,547**).

### TARGET 2 — the arena field-code classifier: the hand-off's premise refuted, and MY OWN blocker refuted one commit later

D-FIELDCODE's hand-off proposed that an arena field-code classifier "does not have to be a copy
at all: … a third `litNode`-style parameter on `fieldCodeOfSpelling`", making
`shapeFieldTypeCompat`'s field-CODE tightening reachable from `repRowOfTyLenientRow`.

**Refutation 1 — the parameter cannot be called.** `fieldCodeOfSpelling(t: string, litNode: i32)`
is a function OF `t`. `litNode` changes which evidence ONE arm consults; the other 33 arms are
predicates on the spelling, and the CALLER must supply it. `repRowOfTyLenientRow` has no
spelling — that is what makes it the arena leg. The hand-off's own closing sentence says so
(*"every other arm is a pure function of the spelling and will need its own arena reading"*);
what it did not follow through is that the intended CALLER has nothing to pass. So the option
set is: (a) render the arena type and feed the existing table; (b) write the third 34-arm
ladder over `Ty` — `ty is TyPrim && primName == "i32"` cannot share an arm with `t == "i32"` —
which is the exact drift hazard `repRowOfTyLenientRow`'s comment declines and that D-ABIDEDUP /
D-FIELDCODE exist to have removed.

**Refutation 2 — of this slice's own first answer.** At base `0d25eaa` a probe build that calls
`tyToEmitName(ty)` at `repRowOfTyLenientRow`'s entry — route (a), the only route from an arena
index to a spelling — **TRAPPED the compiler on 9 of 1,315 corpus files** that master compiled
cleanly (`types/recursive-tree.vl`, `types/mutual-recursive-type.vl`, the four
`soundness/recursive-*` files, `soundness/xfail-mutual-recursive-types.vl`,
`structs/structural-twin-heap-dedup.vl`, `structs/optional-chain-member-recv.vl`); the backtrace
was `tyToEmitName` self-recursing. That was written up as a hard blocker. **#1129 (D-RECRENDER)
landed while this slice was gating, and the identical probe rebuilt at `cd69bd9` traps on
0 of 1,319** — only the two pre-existing false positives (programs already failing the CHECKER
on both sides) remain. The blocker is gone; the finding survives only as a dated measurement,
and as the reason to re-take every number after a rebase.

Route (a) is still the wrong route, but now for a reason on the program's own terms rather than
a crash: reaching the tightening by rendering buys it with **a render plus a 34-arm SPELLING
classification per field per candidate row** — i.e. it adds exactly the parse this program
exists to delete. Measured on the probe: rendering every `repRowOfTyLenientRow` query costs
**5,037 rendered characters over 357 queries** on the corpus and **89,342 over 5,153 queries**
over 25,200 fuzz programs.

**And the tightening does not need a field CODE at all**, which is the useful part. A probe on
master measured the rung and its inputs (accumulated per program, emitted as the first
`emitFail` at the end of `emitProgram`):

| tag | corpus (1,319 files, 1,120 reporting) | fuzz (25,200 programs, 24,006 reporting) |
|---|---|---|
| `repRowOfTyLenientRow` rung 1 (identity, `structIndexOfTy`) | 163 | 2,388 |
| **rung 2 (the un-tightened lenient field-NAME-set scan)** | **8** | **34** |
| declines | 186 | 2,731 |
| `rlSlotOfTyTwin` calls | 317 | 4,569 |
| `rlSlotOfTyTwin` returns a SLOT | 6 | 6 |
| …**of which at least one row came from RUNG 2** | **6** | **6** |
| rung-2 matched row carries a recorded arena type (`sTyIx >= 0`) | **7 / 8** | **34 / 34** |
| rung-2 QUERY `TyObj` has every `objFieldTypes[k] >= 0` † | **8 / 8** | **34 / 34** |

† measured at `0d25eaa`, where `emit_classify.vl` is byte-identical; every other row in the
table reproduces at `cd69bd9` (LR1 160→163 and TWQ 314→317 are the three corpus files #1129
added that reach the site).

Two findings:

1. **The un-tightened rung is not vestigial — it decides EVERY slot `rlSlotOfTyTwin` ever
   returns**, on both channels (6 of 6, 6 of 6). The six corpus witnesses are
   `structs/declared-twin-inline-elem-{map-field,array}-param.vl` and the four
   `structs/nested-{null-hole,union-softening}-list-{elem,return}-twin.vl`. So the tightening
   question is live, not moot.
2. **The arena dual of `shapeFieldTypeCompat` at this rung is a per-field TYPE comparison, not a
   CODE comparison.** The candidate row's own arena type is recorded (`sTyIx`) at 7/8 corpus and
   34/34 fuzz rung-2 matches, and the query's per-field arena types are complete at 8/8 and
   34/34 — so both sides of the comparison are already in hand and no field-code vocabulary
   enters. What it needs instead is a structural type equality over the arena, which this
   program has already flagged as behaviour-changing ("tyEq is behavior-changing", the C1
   de-stringify note), and 87.5% corpus coverage means it LADDERS rather than deletes. That is
   the shape of the next slice, and it is a different slice from the one the hand-off described.

### What did not move, and the mechanism

- **`shapeFieldParse` and `splitUnionArmsAllDepth` keep their own scanners.**
  `splitUnionArmsAllDepth` splits on `|`, not `,` — a different grammar. `shapeFieldParse` is
  the FIELD-SET MATCHER's grammar and differs from `shapeInnerFieldSplit` in two ways that are
  both load-bearing for it: it STRIPS SPACES (so the canonical `tyToEmitName` render and the
  spaced `tyToStr` render parse the same) and it keeps a MALFORMED part's text as the field
  NAME (so a name-set match fails cleanly rather than matching an empty name). Folding it in
  would need two flags and would change the malformed contract; it is one scanner, not five.
- **`internShapeAs` still records `""` for every field's element name.** It is the only one of
  the three interners that does, and it is untouched here because that is a separate,
  unmeasured question from the two copies this slice merged.
- **`gaeEnsure`'s code-5 arm** keeps its raw `tn.slice(0, len-2)` element: an instance field's
  list element is spelled by `gaeApplyFieldTy`'s substitution (`Box<i32>[]` → `Box<i32>`), a
  name the canonicalizing `refArrElemName` does not key.
- **`nameIsRefArray` — 19 call sites in this file, re-measured at `cd69bd9` and unchanged.**
  #1123's mechanism holds: it folds INTERN state (`structIndexByName`,
  `shapeElemDeclaredStructIdx`, `variantIndexOf`, a scan of `unNames`), so no structural reading
  is its dual, and its faithful dual is the table lookup `rlSlotOfTy(tyRefArrElemOf(m))` — which
  needs the element slot banked in `emit_state.vl`, another partition.
- **The generic-instance MAP field (code 19) still fails at emit.** With the delegation the row
  now records the map's VALUE name instead of `""`, but the mv SLOT itself is never interned for
  a generic instance, so `Holder<S>` over `{[string]: S}` keeps its "map value type has no
  interned slot" reject — identical on both sides. That interning is `collectA`'s
  (`emit_collect.vl`), a different partition.

### Hand-offs (exact diffs)

1. **`emit_base.vl` L1699 / L1709 and `wasmEmit.vl` L1737-1751 name `mapTagOf` / `refArrTagOf`
   in comments.** Both functions are gone; the concepts live on as `mapSlotTag` /
   `refArrSlotTag`. Not edited here — other partitions.
2. **`internInlineShape`'s code-5/28 arms could adopt the DEFERRED `[]`-slice fallback**, and
   S2 measures exactly what that buys: **4 differing paths over 25,200 fuzz programs**, all in
   the direction of graduating a program both master and this build reject
   ("ref-list field element type is not interned" on a `{f: {f: i32}[]}` declared-twin field).
   The diff is to delete the two local arms and let the `else` branch take them. It is a
   behaviour change with a fuzz witness available today (seed 6, depth 6,
   `--declared --branching --multiobs`, case 353) — write it as a fixture first.
3. **`internShapeAs` records `""` for every element name** where its two siblings now share a
   9-arm table:
   ```
   -    sFieldElemName.push("")
   -    recordSFieldElemTyIx("") // D5
   +    const en = shapeFieldElemName(rawTexts[pi], codes[pi])
   +    sFieldElemName.push(en)
   +    recordSFieldElemTyIx(en) // D5
   ```
   (`rawTexts` is already in scope after this slice.) Unmeasured — `internShapeAs`'s callers
   need enumerating first.
4. **`collectGenAliasShapes`** (`emit_collect.vl`) could drop its map-VALUE special case: with
   D-GAELEAF, `internShapeDeep` reaches an application under ANY composition wrapper including
   a map value, so the two are now redundant paths to the same `gaeEnsure`. Measure before
   deleting — the phase ORDER differs (`collectGenAliasShapes` runs before `collectAnnShapes`).
5. **The rung-2 tightening**, per TARGET 2 above: a per-field ARENA-TYPE comparison between
   `T.tys[ty].objFieldTypes[k]` and `T.tys[sTyIx[si]].objFieldTypes[j]` at the matched field
   name, gated on `sTyIx[si] >= 0` (7/8 corpus, 34/34 fuzz) and laddering to today's answer
   where it is not. It needs a structural `tyEq` and it will ladder, not delete.

### Method notes earned

66. **A hand-off that names a PARAMETER has hidden an assumption about the CALLER**
    (D-ELEMHOME) — D-FIELDCODE's `litNode` parameter works because both entry points hold the
    spelling and one of them ALSO holds a node. The proposed third parameter cannot work,
    because the caller it is for holds NEITHER a spelling nor a node it could get one from.
    Before building a filed diff, check what the intended caller has in hand — not what the
    function could accept. (Method note 63's shape, one level up: the hand-off was not a no-op,
    it was addressed to a caller that cannot call it.)
67. **A refactor's pin is a ONE-PLACE edit that reddens where the pre-refactor edit would have
    had to be made N times** (D-ELEMHOME) — S1 deletes two `if` arms from `shapeInnerFieldSplit`
    and two corpus files go red. On master the identical semantic sabotage requires six edits,
    and #1118 is the record of what five-out-of-six looks like in production. For a
    "collapse N copies into one" slice, that asymmetry IS the evidence; a byte-identical corpus
    only says the collapse was faithful.
68. **A TRAP is a measurement — and it expires like any other** (D-ELEMHOME / TARGET 2) — rather
    than argue about `tyToEmitName`'s cycle guard, a probe build that simply CALLS it at the
    site under discussion answered in one sweep: 9 of 1,315 corpus files that built cleanly on
    `0d25eaa` stopped building. Two commits later (#1129, D-RECRENDER) the same probe traps on
    **0 of 1,319**. The blocker was real when measured and false when shipped, and only the
    re-measurement after the rebase caught it. A slice that quotes a blocker it took at its
    branch point is quoting a stale lead — including when the slice is its own source.
69. **The `git checkout -- <file>` that reverts a sabotage also reverts the SLICE**
    (D-ELEMHOME, operational) — a sabotage/restore loop that spells "restore" as
    `git checkout -- compiler/x.vl` silently discards uncommitted work, and the next build
    "passes" because master compiles fine. Recovered from `git fsck --unreachable` (the dropped
    stash commit) and verified by rebuilding to a byte-identical artifact. Keep a copy of the
    good file beside the sabotage script and restore with `cp`; commit before the first
    sabotage.
70. **A new LANGUAGE surface is where the destringified channels get paid back** (B21 phase 2a,
    `match` over value unions — not a destringify slice, logged here because it is a consumer).
    The feature needed a type in arm position. The pre-program way to build it was a new
    string channel (a pattern spelling on the `MatchExpr`, re-split downstream); what it
    actually cost was `mkIsExpr(scrut, ty, pos) + setAnnTs(...)` in the parser — the D-PARSETY P2
    node — after which the module merge renamed it (P2's own arm), lint's flat scan found it,
    `nameToTy`/`sameVariantTy` decided membership from the ARENA, and the emitter read the
    banked `isVarTyIxOf` (D-ATOMKIND's ABI). **Zero new type-string parsing, zero emitter
    change, corpus byte-identical.** The measurable form: when a feature can be built by
    MINTING AN EXISTING NODE rather than by adding a channel, the program's terminal condition
    is holding for that shape. The one place a spelling was still needed — rendering the pattern
    back in `vl fmt` — is the node's own source SPAN, not a re-derivation.
