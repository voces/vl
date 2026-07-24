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

**Still string-classified (the rest of the layer, honest scope).** The `unionArmPath*`
family (`unionArmPathIsMap` / `IsMapList` / `IsClosure` / `IsCloArray` / `HasCloValue`) and
its callers resolve an arm atom through `structIndexByName` / `variantIndexOf` and then walk
the emitter's *field-code* tables (5/14/15/16/19/22). Destringifying those means re-deriving
the field codes from the arena, which is a distinct piece of design, not a re-keying — a
later batch. Likewise `unionRefArrayArmSlotForElemAtom` (atom-EQUALITY against a rendered
element set), `unionClosureArrElemUnion` (returns an element NAME the name-keyed reflist
layer consumes), and `emitUnionCoerce`'s alias expansion (the union-boxing ABI).

**Correct as-is, deliberately untouched:** `unionMemberCount(unionMemberSetOf(…)) > 1` (a
count), `structUnionNullCmpName` (`unionHasAtom(set, "null")` + a non-null count — `null` is
a keyword, not a rendered shape), `setNarrowFromCondElse` / `currentStructNarrowSetOf`
(narrow-SET algebra over the narrowing table, whose keys are member-set strings by design).

### D4 — residual structural decisions made by rendering

The ~10 sites that decide structure by comparing rendered text
(`tyToStr(t.nInner) == "string"`, `tyToEmitName(x) != ""` used as a representability probe).
Replace with arena predicates. `tyEq` (typecheck.vl) is the model — it already decides
render-equality *structurally, without building the strings*.

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
| per-atom classify-by-render of a union member set | 15 sites | **15 sites** — the open arc |

The 12 remaining `table[i] == name` scans split three ways, and **most are not the disease**:

- **Legitimate nominal identity** — `unNames`/`uVariants` lookups (a declared name *is* the
  identity), the `rlElemName` exact-match fast path ahead of the structural key.
- **Legitimate ABI identity** — the `cloSigKeys` scan: that key text *is* the interned
  WasmGC functype's identity, so a string is its natural representation. What mattered was
  that every *producer* derives it structurally, which D3 did.
- **Genuinely open** — the `mvValName` map-value scans (parked: re-keying removes a
  comparison but not the string, which retires at D5) and `unMemberSet` (the union arc).

### The open arc: union member sets

`unionMemberSetOf(name)` returns a pipe-joined member string; ~15 consumers `splitUnionAtoms`
it and classify each atom **by its rendered text** (`nameIsMap(atom)`, `refArrElemName(arm)`,
`unionArmPathIsMap(atom, path)`). That per-atom re-derivation is the disease.

**Scope carefully:** an atom that is a declared variant name (`Cat`) feeding
`variantIndexOf` is *nominal identity — lossless and correct*. Only the inline-shape /
composite atoms are the disease. **ABI hazard:** the box-tag scheme depends on member
ORDER (`unVarStart`/`unVarCount` slice `uVariants`), so any reordering is an ABI change.

## Method notes earned during this program

1. **An additive probe must cover every resolution path of a layer, and must be
   sabotage-verified** (invert the comparison; confirm it fires on the target shape) before a
   "0 disagreements" means anything. A single-site probe on the map-value layer swept 0 and
   then *failed* sabotage — the load-bearing path was elsewhere. An unverified 0 is worthless.
2. **A recorded arena index ≠ a name key** (D1) — intern-time vs query-time resolution
   diverge once the arena mutates in place.
3. **A type key ≠ a rep key** (D2) — slot layers fold structurally-distinct types that share
   a wrapper.

All three are the same underlying mistake: assuming an arena artifact answers the same
question the string did. Check which question the site is asking, first.
