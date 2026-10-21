# The union registry keyed by type — design

Lane L6 ([plan](architecture-refactor-plan.md#l6-log)) paused because the union registry's identity is
still the NAME. This design replaces that identity with a TYPE: a row's key is the sequence of
type-table members it was minted from, and no spelling takes part. It answers four questions:

1. What type each untyped root should carry, so its atom set survives (§2, §3).
2. What the mono roots need to hand the registry a type (§4).
3. The ordered steps that delete the name-keyed path (§5).
4. The risks (§6).

Every number here was measured on master **a027add9b** (2026-10-19) with a throwaway probe
compiler. The prototype was reverted and the seed rebuilt pristine. No compiler source changes
with this document.

## 1. What the registry keys on today, and what a type key has to keep

A row is minted by `mintInlineUnion` (`emit_union_registry.vl`) from a NAME. Its parts:

- `unNames`, the spelling;
- `unKey`, `canonUnionKeyOfName`'s interned canon-text id, which is the identity every lookup uses;
- one entry per `splitUnionAtoms` atom in `unMemAtoms` / `unMemTys` / `unMemKinds`;
- a `uVariants` slice (`unVarStart` / `unVarCount`).

Two facts decide what a type key may and may not do. Both were read from the code.

- **Box tags are global, not positions in a row.**
  - A struct variant's tag is the rank of its `variantTagKey` signature among all signatures
    (`assignTags`, ordered by `sigRankOrder`). Equal signatures share a tag, so two same-shape
    records get ONE tag.
  - A scalar's tag is `scalarTagOfKind(k) = uVariants.length + k`, and null is kind 6.
  - Ref-array, map and closure arms take slot bands above `uAtomBandTop()`, interleaved mod 3
    (`refArrSlotTag`, `mapSlotTag`, `cloSigSlotTag`).

  So reordering a row's members renumbers no tag.
- **What is positional is the row's own columns.** The atom list, `unMemTys`, `unMemKinds` and
  the variant slice run in parallel. The member-set ABI rule (never dedupe a member set) protects
  that coupling: D1028's dedupe broke it by shortening one column. The rule does not protect the
  tag numbering.

The consequence is that **the key can be order-independent.** Today a row's key is
order-dependent. On the `ord.vl` witness below, `boolean|null|i32` has name key 7 while its type
key is 4, and the type key is shared with `boolean|i32|null`. Both spellings run today, each on
its own row. A sorted member multiset, which is the shape `hcUnionId` already uses (it sorts and
never dedupes, per D1712), keys them as one row. That row's atom sequence remains the layout data.

The key must also be a TYPE identity, not a REP identity. `repCanonId` / `hcUnionId` keys a
literal as its base scalar and folds twin records. [registry-by-type-id.md](registry-by-type-id.md)
§2 measured 360 row merges and 63 member-set differences under it. A type key therefore needs a
literal-preserving member id: the `tyCanonKey` grain (`emit_ty_canon.vl`) rather than
`repCanonId`.

## 2. The measurement

The probe logged every `registerInlineUnionAt` root call that holds no type. For each call it
printed two things:

- the name's row, atoms, kinds and key;
- the type the root could hand over, as its canonical member sequence (`canonUnionMemberTysOf`),
  and the key that sequence would find, with `null` printed as `n`.

The sweep covered 14,631 files: `tests/cases` plus `scripts/silent-sweep/distilled/named`.

Each call falls into one of three outcomes:

- **EQ**: the type's member sequence matches the name's atom ids.
- **NE**: it differs.
- **no row**: `registerInlineUnionOfTy` mints nothing, because the root is a nullable of one
  member (`Circle|null`, `{[i32]:boolean}|null`, `i32[][]|null`). These calls are already
  registry no-ops.

`/bound` marks calls where an instance binding was in scope.

| root | EQ | NE | no row | files |
| --- | --- | --- | --- | --- |
| `monoPinMintedUnion` (param and let pins) | 20 | 22 | 125 | 73 |
| `monoPinMintedUnion` (list element) | 1 | 0 | 15 | 9 |
| `rsC` (instance return) | 28 | 4 | 76 | 64 |
| `rsC` (bound) | 55 | 0 | 0 | 39 |
| `tpSub` | 0 | 0 | 4 | 3 |
| `tpSub` (bound) | 2 | 0 | 0 | 1 |
| literal-union arm pin | 2 | 0 | 0 | 1 |
| literal-union arm pin (bound) | 3 | 1 | 0 | 1 |
| site 43 (`registerCollapsedUnionName`) | 0 | 14 | 0 | 9 |

Counts are weighted calls; a line logged ×N counts N.

**By originating grid**, using a cell's directory for `tests/cases` and its set prefix for
`named/`:

| root | NE by grid | EQ + no row by grid |
| --- | --- | --- |
| `monoPinMintedUnion` | `cases/generics` 19, `cases/soundness` 1, `cases/std` 1, `cases/unions` 1 | `cases/generics` 118, `named/mty` 6, `cases/std` 12, `named/d947` 3, `named/d426lift` 3, 19 more across 11 grids (list-element pins included) |
| `rsC` | `cases/generics` 4 | `cases/generics` 80, `named/d2567` 12, `named/d3140` 14, `named/mty` 8, `cases/closures` 13, 32 more across 9 grids (bound calls included) |
| `tpSub` | — | `cases/generics` 6 |
| literal-union arm pin | `cases/generics` 1 | `cases/generics` 5 |
| site 43 | `cases/unions` 9, `cases/types` 3, `cases/soundness` 2 | — |

Every NE is in a `tests/cases` fixture. None is a census-derived cell. The named sets reach these
roots only where the name and the type already agree.

## 3. The two roots with no type that carries their atoms

### Site 43: a same-shape union collapsed to a record

There are 14 calls in 9 files:

- `soundness/call-result-union-binding`;
- `soundness/union-same-shape-discriminant-sound`;
- `types/struct-union-same-shape-field-slot` (×2);
- `types/struct-union-same-shape`;
- `unions/discriminant-value-is-ablation`;
- `unions/same-shape-inline-union-is` (×5);
- `unions/same-shape-nullable-cell-deliveries`;
- `unions/same-shape-nullable-field-and-cell-reads`;
- `unions/same-shape-union-into-nullable`.

In every one the name has two atoms with the SAME member id (`A:1, B:1`, kinds `1,1`, two
variants). The type is the single `TyObj` `[1]`, and it finds no row.

**The rep differs between the two spellings.** The witness pair is `f(v: A | B)` and `f(v: A)`
with `type A = {x: i32}` and `type B = {x: i32}`. Built `--names` and read with `wasm-dis`:

| spelling | parameter | body |
| --- | --- | --- |
| `f(v: A \| B)` | `(ref $1)`, `$1 = (struct (field i32) (field anyref))`, a union box | `struct.get $1 0`, compare with 0, then `struct.get $0 0` |
| `f(v: A)` | `(ref $0)`, the record | a direct `struct.get` |

Under D3870 (C), `A | B` is `A`, and there are no runtime tags. So the name builds a box the ruling
says does not exist. The type is the side that is right.

**The three options, each prototyped and graded over the 9 files plus the witness (10 programs):**

| option | prototype | result |
| --- | --- | --- |
| (a) do not collapse at site 43 | site 43 mints nothing (`c_skip43`) | **7 of 10 runs → emit refusal**: `ref valtype with no interned shape`, `field access receiver is not a struct`, `struct field type A\|B has no struct-field rep`, `is test but no union type declared`. The 3 nullable-cell files are unchanged. |
| (a′) the type route: canon spells a non-null same-shape `A\|B` as `A` | `l6SameShapeRec` before `canonSameShapeNullable` (`c_canon43`) | **10 of 10 → `ref valtype with no interned shape`**, the nullable files included |
| (a″) as (a′), and also no site-43 mint and no `TyObj` arm in `nodeTyIsUnionAlias` | `c_canon43b` | **10 of 10 → `ref valtype with no interned shape N variant -1`**, a nullable-cell valtype asked for a variant with no row |
| (b) a literal-union type row | — | does not apply: no literal is involved |
| (c) a side column | this is today's `annUnionAtomsOf` bank | runs. It preserves the box D3870 rules out, and a type key cannot read it without reading the annotation node |

The ablation (a″) shows that the canon spelling and the two annotation-count readers are not the
whole reader set. With all three converted, something still classifies the parameter `v: A | B`
as a `variant` from its spelling, and no row backs that classification.

The single-binding spelling `const a: A | B = {x: 3}; print(a.x)` RUNS under (a′). So the missing
reader is on the parameter and signature path. `annUnionAtomsOf` feeds `emit_sig_tokens.vl` and
`emit_rewrite.vl`, and `emit_classify.vl` has 13 `return "variant"` arms, each behind its own
predicate.

**Recommendation: no row.** The type is right: a type key for `A | B` is the record's own key,
which finds no union row. To get there, every reader that classifies by the spelling must read
the type instead. The readers are enumerated by a position matrix, not by reading call sites
(§5 step 4).

Option (a) as stated, keeping a `TyUnion[A, B]`, would key two identical member ids and preserve
a box that has no ruling behind it. Option (c) is the status quo, and it keeps the name in the
identity.

### The literal-union arm pin: `K | L | null`

The witness is `generics/nullable-fold-nominal-lists-and-literal-box.vl`, at a call that already
has a bound row:

- the name's atoms are `K:13, L:14, null`;
- the type is `string|null` (`[4, n]`, where 4 is `string`), so the canonical sequence softened
  `K | L` to `string`.

The other two arm-pin calls (`generic-union-param-litunion-alias-arm.vl`: `K|i32` and
`K|i32|null`) already agree: `K` keeps its own id.

**The rep at both spellings**, from the witness `lit2.vl`, built `--names` and read with
`wasm-dis`. The program has `type K = "a" | "b"`, `type L = "c" | "d" | "x"` and
`const kl: K | L | null = "d"`. All three calls print `false`.

| spelling | parameter | result |
| --- | --- | --- |
| `Kd(a: K \| L \| null): K \| L \| null` (direct) | `(ref $0)`, the `(struct i32 anyref)` box | `(ref $0)` |
| `Hd(a: K \| L \| null, _b: string): K \| L \| null \| string` (direct) | `(ref $0)` | `(ref null $3)`, the nullable string |
| `H<A, B>(a: A, _b: B): A \| B`, instantiated `H(kl, "q")` | `(ref null $3)`, the nullable string | `(ref null $3)` |

The direct spelling of `K | L | null` therefore boxes three atoms. The generic instance binds `A`
to `string | null` and passes a nullable string. Neither matches the literal-union ruling
(2026-10-13). Under that ruling every string literal union is ONE interned i32 atom, and canon
must stop softening a string member set to `string`. Under the ruling, `K | L` is one atom, and
`K | L | null` is a nullable atom.

**Recommendation: (b), a literal-union type row.** The type's canonical sequence keeps `K | L` as
one member, a literal-union type over the five literals, under `| null`.

- (c) a side column would bank the name's three-atom split beside a softened type. That split is
  the one the ruling replaces.
- (a) is not available: nothing collapses here, and the softening is canon's.

(b) is the litunion ruling's own canon change. A canon prototype was not built here, because it
changes bytes on every inline string-literal union. It belongs to the step that lands that ruling
(§5 step 3), graded on the corpus.

## 4. The mono roots: what each one needs to hand over a type

**`rsC` and `tpSub` need nothing new.**

- `rsC` agrees on 83 of 87 calls: its instance's `retTy` (55 of 55 bound calls) and the
  substituted return type.
- `tpSub` agrees on its 2 bound calls (`letBT`); its other 4 are one-member nullables that mint no row.

All four `rsC` NE are the position of `null`:

| file | name | type |
| --- | --- | --- |
| `annotated-param-union-at-nullable-pin` | `string\|null\|Rec` | `[4,1,n]` |
| `nested-nullable-param-return` | `boolean\|null\|i32` | `[4,0,n]` |
| `nested-nullable-param-return` | `i32\|null\|string` | `[0,6,n]` |
| `nullable-fold-nominal-lists-and-literal-box` | `Rec2[]\|null\|Rec[]` | `[10,10,n]` |

An order-independent key (§1) agrees on the first three. The fourth is a twin-member set; see §6.

**`monoPinMintedUnion` needs a different type, not a new one.** Its 22 NE fall into four kinds:

| kind | calls | example (name ⇒ type the caller hands) | what the root needs |
| --- | --- | --- | --- |
| the ARGUMENT's type is handed, and the argument is one member | 15 | `{r:i32}\|{s:i32}` ⇒ `{r:i32}`; `{[i32]:string}\|{[i32]:i32}` ⇒ `{[i32]:string}`; `P[]\|i32` ⇒ `{x:i32}[]` | the substituted PARAMETER type under the full instance binding |
| the ARGUMENT's type is handed, and the argument is a smaller union | 4 | `{[i32]:boolean}\|null\|string` ⇒ `[5,n]`; `{[i32]:i32}\|{[i32]:boolean}\|string` ⇒ `[1,3]`; `R\|S\|null` ⇒ `{a:i32}\|{b:i32}` | the same |
| `null` position | 1 | `i32\|null\|{[i32]:i32}` ⇒ `[0,7,n]` | the order-independent key |
| an atom the name cannot type | 2 | `#anon0[]\|i32[]` (atom kind −1; the type has both members); `string\|{[i32]:boolean}` (the map atom is id 10, the type's member is id 11) | a key read from the type, not from the atoms |

The param caller (`monoMakeInstanceParams`, `emit_mono.vl`) passes `gateTy = pinTys[pj]`, which is
the argument's type. It reaches the substituted annotation only for explicit type arguments, and
only when `!monoTyHoldsRefArm(gateTy)`. The full binding (`letBN` / `letBT`: `exBN` plus
`monoBindCols` over the declared parameters) is built AFTER this step.

The fix is either to build that binding first and type every pin as
`substTyDeep(parType, letBN, letBT)`, or to hand the pin the checker's per-call binding
(`callBindTyOf`). The second was measured on 2026-10-19 (L6 log): 104 agree, 5 member render
(alias or `#anon` against a structurally equal member, which agree by type id), 3 null position
(agree under an order-independent key) and 1 with no type (`{[i32]:boolean}|null`, a one-member
nullable that mints no row). Under the two keys above, every multi-atom pin with a type agrees.

## 5. The ordered steps

Each step names its witnesses, its gate and the rows it closes. A step whose gate is "identity"
must leave every built module byte-identical:

- `scripts/rep-fuzz-check.sh` exact;
- difftree `--identity` at 0 differ;
- the fixpoint reproducing.

A step that changes bytes is graded on the corpus and the capability matrices instead:

- 0 `runs → not-runs`;
- 0 `→ silent`;
- every differing module explained.

| # | step | witnesses | gate | closes |
| --- | --- | --- | --- | --- |
| 1 | **A type key column, shadowed.** `unTyKey`: the sorted multiset of literal-preserving member ids of the root's type, minted beside `unKey` at every row. Every untyped root (the five above, and sites 32, 33 and 37) logs the key it would find. Nothing reads it. | `ord.vl` (§7); the 4 `rsC` null-position calls; the 22 `monoPinMintedUnion` NE | identity | none |
| 2 | **Type the mono pins.** `monoPinMintedUnion` from the substituted parameter type under the full binding; `rsC` from `retTy`; `tpSub` from `letBT`. Still minted by name: the type only feeds the shadow. | the 22 `monoPinMintedUnion` NE, which must read EQ by type key | identity; the shadow's NE count for the mono roots reaches 0 | none |
| 3 | **Literal-union rows (§3, option b).** Canon keeps an inline string-literal member set whole under `null` and in a mixed union. `K \| L \| null` is a nullable atom at both spellings. This is the litunion ruling's canon change. | `generics/nullable-fold-nominal-lists-and-literal-box.vl`; `lit2.vl` (§7, both spellings must give one rep); [D6950](inventory/D6950.md)'s repro and its four `named/d3140_r2_sb_*__F5a.vl` cells; `lists/union-element-array-litunion.vl` | corpus + capability matrices (bytes change on every inline string-literal union) | expected to close D6950. This is a prediction: it is graded by deleting `identListRep`'s and `globalListRep`'s read-site rungs and rerunning that row's A/B, which is L2's stage-3 step |
| 4 | **Twin members get no row (§3, site 43).** A union whose members are one type under D3870 is that type. A position matrix over a same-shape `A \| B` template enumerates the spelling readers at every delivery: parameter, return, binding, field, element, `is`, nullable cell. Each reader moves to the type, then site 43 and the `TyObj` arm of `nodeTyIsUnionAlias` are deleted, and so is the `annUnionAtomsOf` bank once its last reader goes. | the 9 site-43 files; `t43.vl` / `t43d.vl` (§7), which must give one rep; `Rec2[] \| null \| Rec[]` in `nullable-fold-nominal-lists-and-literal-box.vl` | corpus + capability matrices + the new matrix in both faces | none filed. Ablation (a″) is the evidence that more readers exist than the two counted |
| 5 | **Switch the identity.** `mintInlineUnion` finds and mints by `unTyKey`. A recursion passes member TYPES, not cut names. `unNames` becomes a display render, and `canonUnionKeyOfName` and `registerInlineUnionAt`'s name dispatch are deleted. | `ord.vl`, both orders on one row; every root's witnesses from steps 2–4 | identity on every module whose spellings were already one row. Each merged row is a listed, explained module diff | render-parse counts in `registerInlineUnionAt` / `registerInlineUnionAtoms` |
| 6 | **Delete the name-keyed readers.** `isUName`, `unionMemberTysOf(name)`, `unionHasAtom(name)` and `unMemHasAtom` move to their type twins under the registry-by-key recipe (#2426, #2438, #2473). | the readers' own fixtures | identity | render-parse rows; B3's union half |

Steps 1 and 2 can land as one PR. Steps 3 and 4 are independent of each other and both come
before 5, because 5 is byte-identical only for rows whose type and name already agree.

**Status: steps 1 and 2 are done** (`emit_union_tykey.vl`; L6 log, 2026-10-19). The key
renders each member structurally (`tyToStructStr`, a nested union or list by its sorted
members), so a record and its alias, or `Set<i32>` and `{[i32]: boolean}`, are one member, as
D3870 makes them. A union or list already on the walk's path keys as a back-reference
(`^k`), so a recursive alias keys in time linear in its size. A row whose atom no member type resolves is keyed by its struct row's
recorded type, or else by the type it was minted for. The mono pins are typed at the instance:
a parameter's pins wait until its binding is whole, and a bare `T` member of a union parameter
(`T | string`, `T | i32 | null`) is bound from the argument by `bindGenUnionArmInto`, which
the instance's own binding does not do. Over `tests/cases` and `distilled/named`, every mono
root agrees by type key. Two roots still disagree, both assigned to later steps: the
literal-union arm pin `K | L | null` (one call, step 3), and site 43 (14 calls in the 9 files,
step 4).

**Status: step 4 is done for records** (L6 log, 2026-10-19). Site 43 and the `TyObj` arm of
`nodeTyIsUnionAlias` are deleted, and a twin record union is the record at every position,
generic instances included (`substRecordTwin`). The shadow's site-43 disagreements are 0. Twin
LISTS still take a box: substitution keeps `Rec[]` and `Rec2[]` apart on purpose
(`substListTwinNominal`, D3503), so the nullable-fold fixture is unchanged.

**Status: step 3 is done** (L6 log, 2026-10-19). Canon keeps an inline string-literal set whole
under `null` and in a mixed union, and `K | L | null` is the nullable literal atom at the direct
spelling and in a generic instance. The arm pin `K | L | null` is no longer reached, so the shadow
has no disagreement left. The prediction held: D6950 is closed, and `identListRep`'s and
`globalListRep`'s rungs are deleted.

**Status: step 5 is in progress** (L6 log, 2026-10-19). An unregistered spelling with a type is
adopted by the row its type keys to, confirmed by where `null` sits in the type's members and
in the row's atoms; its name is no longer parsed (`unNameAdoptTyKeyRow`). `unNameAdoptKeyRow`
is deleted. One row merges, `unions/inferred-return-self-union-nullable.vl`, whose unrolled
`Node | null` adopts the `Node | null` row; the output is unchanged. `ord.vl` builds
byte-identical.

Then the find (L6 log, 2026-10-19, step 5's second slice). `registerInlineUnionGo` asks the
row its type keys to (`unRowOfTyKey`, the first row per key) before it mints, and an inferred
nominal return adopts with its type. A type-key row serves another spelling only where both
name the same record atoms. One D3870 record type can have two struct rows that rep apart: a
literal `kind` field against its alias's atom, as in `Ca | Ra` beside `C | R`. Otherwise the
spelling takes the canon row of its type, as before. Every merge is in the L6 log. Each one is
a member reorder of the same multiset, a union alias of the same members, or an inline record
beside its transparent alias (`{x: i32} | i32` and `P | i32`). `ord.vl` prints the same in both
orders.

Then the descent (L6 log, 2026-10-19, step 5's third slice). `registerInlineUnionAt` no longer
recurses through its name's parts. A list, a `| null`, a closure or a map registers the unions
its subtypes hold by descending its arena type (`registerInlineUnionChildOf`), and a recursive
type reaching itself again stops (`riuOpenTys`). No module changes. The record split the
type-key guard works around is filed as [D7220](inventory/D7220.md).

Then D7220's close (L6 log, 2026-10-19). A string-literal record field reps as its one-member
set's interned atom whichever way it is spelled, so `{kind: "circle"}` and `{kind: KC}` have
one struct row. The type-key
guard (`utkStructText`) still holds: the union box site resolves a member by name against the
adopted row, so a row shared by type is safe only where the member names agree.

Left: `mintInlineUnion` still mints under `canonUnionKeyOfName`, and the guard stays, until
the type reaches the box site. The adopt with no type is live: an `i64 | i32` mixed-width literal-union
alias has a literal-preserving type key that finds no row. `isUName`, `unionRowOf`,
`registerValueUnionNameTy` and `pushValueUnionRow` are asked with a name only. So
`unRowOfSetText`, `unKeyPush`, `unKeyAliasRow`, `isUNameKeyAB` and that fallback still call
`canonUnionKeyOfName`. They move once a softened type key at the `tyCanonKey` grain exists, or
once the type reaches `registerValueUnionName`'s callers.

Then the softened key's first slice (L6 log, 2026-10-20). Four seams that held a type but
asked by name now hand the type over:

- the map-value narrow rep and `nulRefElemEmitName` ask `isUNameKeyAB` (sites 48 and 49);
- the `as?` null arm and `registerSharedReadUnion` mint through `registerValueUnionNameAB`
  (sites 50 and 51).

No module in `tests/cases` or the corpus changes, and [D4260](inventory/D4260.md) closes.

Left:

- `annParamKindTy`'s type keys to a row its spelling does not, which costs one unused
  `$fnsig`.
- `pushValueUnionRow` cannot key by type yet. A nested-null pin spelling (`boolean|null|i32`)
  and its type (`boolean|i32|null`) differ in member order, so two rows would share a key
  across sets.
- The `isUName` / `unionRowOf` callers that hold no type.
- `emit_collect`'s sites, which belong to another lane.
- Then `unRowOfSetText`, `unKeyAliasRow`, `isUNameKeyAB`'s no-type fallback, the
  adopt's `i64 | i32` fallback, and the deletion of `canonUnionKeyOfName`.

Then the second slice (L6 log, 2026-10-20). `mintInlineUnion` and the declared-union mint key
their row by the arena type (`unKeyPushOfTy`), and the spelling's key finds it too. A nullable
type keeps the spelling's key, and so does a type key whose first row records another set. No
module changes.

**Decision: where `null` sits is not part of the box tag layout.** A scalar's tag is global
(`scalarTagOfKind`), and `null`'s is `nullBoxTag()` at every position. A probe that moved `null`
last in every name key changed 1 module of 11,083, with the same output and its tag-rank
constants each shifted by one. `nullpos.vl` (§7) and D3504's fixture build byte-identical under
it, and under a type key in `pushValueUnionRow`. Only the licence tells the two orders apart:
`unKeySweepPair` compares member-set strings in order. It should compare them with `null`'s
position ignored. That change is in `emit_union_registry.vl`.

`annParamKindTy`'s `$fnsig`: the type of `f(b: i32[] | K[])` with `K = 0 | 1` keys to the
twin-softened row `i32[]|i32[]`. The parameter lowers as a plain i32 list, so the spelling's
answer is right. Answering "union" by type turns a witness that runs into `union box atom test
on a union with no recorded members`. The seam moves only once such a row stops answering as a
union.

Then the third slice (L6 log, 2026-10-20). The licence compares member sets with `null`'s
position set aside (`unRowSetSameNullBlind`), and only that: the other members still compare
in order and by count. It reads the rows' recorded member columns, so it parses no spelling.
`pushValueUnionRow` keys its row by type too, through the same `unKeyPushOfTy`, now in
`emit_union_registry.vl`. The nullable exclusion is narrowed to a row whose `null` is not its
last member (`unRowNullLast`). The three mints record a row's member slice before they key it,
so both helpers read the slice. With the exclusion dropped outright, 1 module of
11,087 changes and prints the same: in `annotated-param-union-at-nullable-pin.vl`,
`string|null|Rec` takes the type key ahead of `string|Rec|null`. A later spelling's adoption
then compares where `null` sits (`unNameAdoptTyKeyRow`), refuses, and mints one more row, so
every scalar tag shifts by one. With the gate, no module changes.

`unionRowOf`'s two callers that hold the type they rendered the name from are A/B sites 52
(`anonUnionFieldName`) and 53 (`mvValUnionRow`), through `unionRowOfAB`. That seam tallies only;
the answer stays the name's. Over `tests/cases`:

| site | agree | differ | id-only | name-only | neither |
| --- | --- | --- | --- | --- | --- |
| 52 | 219 (17 files) | 4 (1) | 110 (11) | 42 (4) | 7,394 |
| 53 | 69,343 (125) | 290 (22) | 63 (19) | 561 (4) | 10 |

When the type answered, 7 modules changed codegen and printed the same, so the switch was not
made. Both callers go on to read the registry by the spelling they return. An id-only answer
skips the `unRowOfCanon` fallback that recovers the row's own name. The switch waits until those
readers key by type too.

Left:

- `annParamKindTy`, behind the twin-softened list row.
- Sites 52 and 53 answering by type, once their downstream readers do.
- The `isUName` / `unionRowOf` callers that hold no type.
- `isUNameKeyAB`'s no-type fallback. Its type-holding callers are in `emit_classify.vl`,
  `emit_collect.vl` and `emit_shape_rows.vl`.
- `unRowOfSetText`, whose caller holds no type, and `unKeyAliasRow`.
- The adopt's `i64 | i32` fallback at site 44 (`registerInferRetNominalUnion`), which needs the
  softened type key.
- The deletion of `canonUnionKeyOfName`. Four emit files still call it, 10 calls in all, and
  `check_nj_join.vl`, which defines it, calls it 3 times.

## 6. The risks

- **The member-set ABI.** The row's atom columns stay parallel and are never deduped. The KEY is a
  multiset over the row's own members and never changes a row's layout. A key collision between
  two spellings is a row merge. A row merge is safe only where both spellings' atom sequences are
  the same multiset, and step 5 must list every one of them.
- **Box tag positions.** Tags are global (§1), so a merge or reorder renumbers nothing. Minting
  FEWER variants does shift the rank constants that `assignTags` hands every later signature. That
  happens in step 3 (`K`/`L` atoms gone) and step 4 (twin boxes gone). It is the "tag-rank
  constants" module diff the fourth switch already saw. Expect it, and explain it per module.
- **Readers that index a row by a spelling's atom position.** If one spelling's row serves another
  spelling's order, a reader pairing `splitUnionAtoms(name)[i]` with column `i` reads the wrong
  member. Today `ord.vl` runs because each order has its own row. Run it again at step 5. The
  2026-10-19 change (`unionAtomTysOf` pairs non-null atoms with non-null canon members) removed
  one such reader.
- **Structural-record identity.**
  - Twin records share a member id: `A:1, B:1` at site 43, and `Rec2[]:10, Rec[]:10` in the
    nullable-fold fixture. A multiset key over `[10, 10, n]` and a set key over `[10, n]` then
    name different rows for one D3870 type. Step 4 resolves this by giving the twin-member
    spelling the record's (or the list's) own rep, so the duplicate never reaches a key.
  - The nullable-fold fixture's comment still calls `Rec[]` and `Rec2[]` "two types", which D3870
    contradicts. Its printed values do not depend on it.
- **The member id must be a type identity.** `repCanonId` folds literals to their base, which
  would merge `K | i32` with `string | i32`. Use the `tyCanonKey` grain.
- **The type a pin hands over is only as good as the binding.** The explicit-type-argument path's
  partial binding loses members (§4). Step 2's gate is the shadow reading 0 NE, not "a type
  exists".

## 7. Witness programs

`t43.vl` / `t43d.vl`: the site-43 rep pair (`print(f(a))` prints `3` at both).

```vl
type A = {x: i32}
type B = {x: i32}
function f(v: A | B): i32 { v.x }     // t43d.vl: f(v: A), const a: A
const a: A | B = {x: 3}
print(f(a))
```

`lit2.vl`: the literal-union arm at both spellings (prints `false` three times).

```vl
type K = "a" | "b"
type L = "c" | "d" | "x"
function H<A, B>(a: A, _b: B): A | B { return a }
function Hd(a: K | L | null, _b: string): K | L | null | string { return a }
function Kd(a: K | L | null): K | L | null { return a }
const kl: K | L | null = "d"
print(H(kl, "q") == null)
print(Hd(kl, "q") == null)
print(Kd(kl) == null)
```

`ord.vl`: member order (prints `B`, `B`, `3`, `B`).

```vl
type A = { a: i32 }
type B = { b: string }
function f(v: A | B): string {
  if v is A { return "A" }
  "B"
}
function g(v: B | A): string {
  if v is B { return "B" }
  "A"
}
const x: A | B = { b: "s" }
const y: B | A = x
print(f(y))
print(g(x))
const n1: boolean | null | i32 = 3
const n2: boolean | i32 | null = n1
print(n2)
const lst: (B | A)[] = [x, y]
print(f(lst[0]))
```

`nullpos.vl`: one nullable value union in two orders of `null`, delivered into each other (prints
`b false b 7 i false 7 i n true n 2.5 true 4 true true`, one per line).

```vl
// Two orders of one nullable value union in one program, delivered into each other.
function mk(k: i32): boolean | null | i32 {
  if k == 0 { return true }
  if k == 1 { return 7 }
  return null
}
function take(v: boolean | i32 | null): string {
  if v is i32 {
    print(v)
    return "i"
  }
  if v is boolean { return "b" }
  "n"
}
function back(v: boolean | i32 | null): boolean | null | i32 { v }
const xs: (boolean | null | i32)[] = [mk(0), mk(1), mk(2)]
for x in xs {
  print(take(x))
  const y = back(x)
  print(y == null)
  print(take(y))
}
const a: null | i32 | f64 = 2.5
const b: i32 | f64 | null = a
if b is f64 { print(b) }
const c: i32 | null | f64 = null
const d: f64 | i32 | null = c
print(d == null)
const e: i32 | f64 | null = 3
const f: null | f64 | i32 = e
if f is i32 { print(f + 1) }
print(F(0, true, 4))
print(F(2, true, 4) == null)
function F<A, B>(k: i32, a: A, b: B): (A | null) | B {
  if k == 0 { return a }
  if k == 1 { return b }
  return null
}
```
