# Step 7 L6: where the union registry is keyed by a spelling, measured against the type, 2026-11-11

The mono key census (`2026-11-10-step7-l2-mono-key-census.md`, cut order item 4) and the render
classification (`2026-11-10-step7-l2-render-classes.md`) both leave their last rows to the union
registry. This census lists every place a union's registry row is created or looked up by a
spelling. For each one it records the type in hand and asks whether a canonical type key gives
the same partition. It explains D4320 and proposes the cut order.

The base is master `68fd81f7`, with a fixpoint seed. The population is the whole sweep: 23,873
programs. 23,863 were graded. The 10 left out share one batch with D12131, which exhausts the call
stack on master as well. 18,394 programs reach the end of emit and are counted below. The other
5,469 stop earlier: 5,173 at check, 145 in emit, and 151 report nothing.

## Method

The method is the mono census's: a probe in a scratch compiler that was never refreshed into a
seed. At the end of `emitProgram`, every program that emitted fails with its tallies, so one
`vl check --batch --json --codegen` pass reads all of them. The probe records three things:

- **Every lookup by a spelling.** Each of the 36 name-taking registry entries records the
  spelling, the row the spelling's `unRowBySid` slot names at that moment, that row's canonical
  key, and the type the caller handed over (-1 when the entry takes none).
- **Every typed lookup.** At `unRowOfTyAB`, the funnel every typed A/B seam takes, the probe records
  today's answer, `unRowOfKey(ty)`, beside the canonical key's row, `unRowOfTyKey(ty)`.
- **The final rows.** Each registered row is grouped by its canonical key and by its name key.

The canonical key is `unTyKey` (`emit_union_tykey.vl`). It is the sorted, never-deduped multiset
of the type's canonical members. Literals are kept, a record is spelled by its shape, and a union
or list already on the walk's path is a back-reference. The name key is `unKey`. It is
`canonUnionKeyOfName`'s text: the members are flattened and kept in order, and literals are
softened to their base.

## The registry has three keys

| key | column | minted from | read by |
| --- | --- | --- | --- |
| the spelling | `unRowBySid` | `unNamesPush`, `unNameBindRow`, `unNameShareTyKeyRow`, the type-key adopt | every name-only entry, through `unRowOfName` |
| the softened key | `unKey`, `unKeyFirstRow` | `canonUnionKeyOfName(name)`, or `canonUnionKeyOfTy(ty)`, which renders the type and keys the text | `unionRowOf`'s fallback, `nameKeyRow`, and **every typed lookup** (`unRowOfTyAB` → `unRowOfKey`) |
| the canonical type key | `unTyKey`, `unTyKeyFirstRow` | `unTyKeyPushRow` at all three mints | the mint-time adopts only: `pushValueUnionRow`, `collectDeclaredUnion`, `registerInlineUnionGo`, `unNameShareTyKeyRow` |

A typed lookup therefore asks by a key that is still a render: `canonUnionKeyOfTy` renders the
type and keys the text. The canonical key decides which row a new spelling joins, but no lookup
reads it.

## Creation sites

Rows are pushed at three sites, and a spelling is bound to an existing row at four:

| site | file | type in hand | how it joins an existing row |
| --- | --- | --- | --- |
| `mintInlineUnion` | `emit_collect.vl` | yes (`ty`) | `registerInlineUnionGo` asks `unRowOfTyKey` first |
| `collectDeclaredUnion` | `emit_collect.vl` | the declared type | binds by type key when the alias is a value or literal union, or its arms are records and scalars that match the row (D14742 excludes a list, map or function arm) |
| `pushValueUnionRow` | `emit_union_atoms.vl` | yes, or `declTyIxOfName(name)` | binds by type key to a row with no variants |
| `unNameBindRow` | `emit_union_atoms.vl` | no | binds the spelling's sid and its softened key |
| `unNameShareTyKeyRow` | `emit_union_atoms.vl` | yes | binds the spelling to the type key's row |
| the type-key adopt (`unNameAdoptTyKeyRow`) | `emit_union_tykey.vl` | yes | binds by type key, confirmed by where `null` sits |
| the softened adopt (`unNameAdoptKeyRow`) | `emit_union_tykey.vl` | no | binds by the spelling's softened key |

Every root that mints a row holds a type, so **the canonical key exists at every mint.** The
spelling a row is minted under is still the name (`registerInlineUnionAt`'s 9 callers,
`registerValueUnionNameAB`'s 24, and `mintInlineUnion`).

### Rows, grouped by the canonical key

18,394 programs register 20,607 rows in 9,976 programs. Three rows have no canonical key.

| finding | rows | programs |
| --- | --- | --- |
| a row whose canonical key an earlier row already holds | **75** | 67 |
| — with the same atoms in the same order | 71 | 64 |
| — with the same atom multiset in another order | 0 | 0 |
| — with other atoms | 3 | 3 |
| — of these, a variant slice that differs | 1 | 1 |
| a softened key holding two canonical keys | **219** | 207 |

The 71 same-atom pairs are all one family, D14742: a recursive alias beside its expansion.
`boolean|f64|string|Json[]|{[string]:Json}|null` is registered first, then `Json` mints its own
row (43 pairs from `std:json`, plus `J`, `P`, `KL`, `KM`, `T` and `V`). `collectDeclaredUnion`
does not bind an alias with a list or map arm, because the alias's `Json[]` and map arm register
under its name. The refutation pin is D14742's.

The three other-atom pairs are one canonical type under two spellings:

- `V` / `W` in `maps/recursive-alias-map-into-union.vl`, and `A` / `B` in
  `types/self-recursive-map-arm-declares.vl`. These are two recursive aliases of one structural
  type.
- `U = Cat | Kot` / `V = Cat | {m: i32}` in `unions/variant-twin-scalar-spellings.vl`, twin
  records. This is the one pair whose variant slices differ (`Cat`, `Kot` against `Cat`, the
  anonymous row). Both records rank under one tag signature, so the tags agree.

The 219 softened-key splits are literal sets, every one. In 218, two string-literal-set rows soften
to one key: `K` / `L` (103 pairs), two inline runs such as `"x" | "y"` / `"p" | "q"` (61), and
other aliases (`J`, `R`, `K2`, `M`, `Color` and others). The last one is
`U = 1 | 9000000000` beside `i32|i64` (`hole-litunion-arith-base-scalar.vl`). Under the
literal-preserving ruling (DECISIONS.md, "Union-row identity preserves literals") the canonical
key is right to split them.

## Lookup sites

36 entries take a spelling. The calls are counted over the 18,394 programs. "Callers" is the
static count of call sites in `compiler/*.vl`, with comments and the definition left out.

### Entries that take the type beside the spelling

The buckets compare the row the spelling names with the canonical key of the type in hand:

- **same**: the same key;
- **split**: the spelling's row has another canonical key;
- **row is a duplicate**: the same key, from a row that is not the key's first row;
- **no spelling row**: the spelling names no row, and the type keys one.

| entry | callers | same | split | row is a duplicate | no spelling row |
| --- | --- | --- | --- | --- | --- |
| `isUNameABAt` (+ `isUNameAB`, `isUNameOwnAB`, `isUNameAnnAB`) | 3 + 8 + 1 + 3 | 57,650 | 286 (76 programs) | 4 | 11,466 |
| `isUNameKeyAB` | 4 | 927 | 150 (57) | 0 | 13,705 |
| `isUNameDeclAB` | 10 | 2,491 | **0** | 4 | 0 |
| `unionRowKeyAB` | 11 | 48,825 | 211 (42) | 20,469 | 31,685 |
| `unionRowOfAB` | 1 | 6,038 | 77 (13) | 19,374 | 1,232 |
| `unionRowNameAB` | 2 | 0 | 0 | 0 | 429 |
| `unionMemberTysOfAB` | 3 | 4,143 | 25 (5) | 0 | 160 |
| `unionHasAtomAB` | 3 | 204 | 4 (2) | 0 | 14 |
| `msSetOfNameTy` | 13 | 24,394 | 338 (95) | 57,954 | 3,638 |
| `unionArmsOfTy` | 5 | 109,067 | 1,072 (98) | 58,914 | 3,876 |
| `unionSetAtomsOfTy` | 5 | 6,387 | 119 (19) | 0 | 6,182 |
| `unionSetHasNullTy` | 3 | 5,499 | 18 (6) | 57,938 | 3,612 |
| `softKeyOrNameKey` | 3 | 0 | 0 | 0 | 1,584 |
| `registerValueUnionNameAB` | 24 | 35,882 | 390 (99) | 3 | 9,960 |
| `registerInlineUnionAt` | 9 | 11,253 | 143 (58) | 154 | 26,113 |
| `mintInlineUnion` | 1 | 2 | 0 | 0 | 2,661 |

`unionNameNonNullCountTy` and `unionSetNonNullCountTy` take a type, but no program hands them one.

**A split is not always a disagreement about one type.** Sorted by what differs, 1,215 recorded
splits:

| what differs | splits | programs |
| --- | --- | --- |
| the spelling softens a literal the type keeps (`i32\|null` for `(1 \| 2) \| null`) | 681 | 110 |
| a newtype member the row's key keeps (`NtI32 \| null`, `RowAddr \| string`, `EntityId \| string`) while the spelling names the base | 310 | 39 |
| the type in hand is not the named union's: `null` for `i32\|null`, the inner of a nullable, an arm | 140 | 60 |
| two literal sets under one softened spelling (`("a" \| "c")` for `("b" \| "d")`) | 70 | 24 |
| a recursive member's key text depends on the walk's origin (`[(^1 ; null ; string)]` against `[([^1] ; null ; string)]`) | 14 | 2 |

The first, second and fourth groups are the spelling's partition being coarser than the type's,
where the ruling sides with the type. The third group is a caller handing over the wrong type: a
re-key there needs the right type first. The fifth group is a defect of the canonical key itself:
a recursive alias's members key differently depending on where the walk enters the cycle
(`maps/recursive-alias-unfolded-list-is-alias-list.vl`, D4140).

**The partition.** One spelling's row reached with two canonical keys happens 264 times in 223
programs. One canonical key reached through two spellings' rows happens 114 times in 103
programs.

### Entries that take only a spelling

| entry | callers | calls with a spelling row | without |
| --- | --- | --- | --- |
| `unMemRowOfName` | 7 | 456,154 | 1,057,681 |
| `unionSetMemberCount` | 9 | 63,194 | 953,580 |
| `unionMemberSetOf` | 17 | 263,930 | 42,276 |
| `unNameBound` | 12 | 59,872 | 115,939 |
| `msSetOfUnion` | 15 | 116,776 | 4,797 |
| `unionSetAtomsOf` | 38 | 53,835 | 57,467 |
| `unionRowOf` | 5 | 82,911 | 5,010 |
| `unionMemberTysOf` | 9 | 46,723 | 3,462 |
| `unionMemberAtomsOf` | 6 | 11,378 | 173 |
| `unionArmsOf` | 12 | 9,985 | 1,030 |
| `unionArmTys` | 10 | 2,883 | 32 |
| `unionHasAtom` | 5 | 482 | 115 |
| `unMemHasAtom`, `unionHasAtomTy` | 1 + 21 | 1,462 | 120 |
| `unRowOfSetText` | 1 | 0 | 5,010 |
| `registerValueUnionName` | 1 | 39 | 15 |
| `unNameBindRow` | 2 | 0 | 237 |

Several of these are reached only from another entry. `unMemRowOfName` serves seven of the
others, so the calls overlap. The two biggest by calls, `unMemRowOfName` and
`unionSetMemberCount`, mostly ask about a spelling that names no row: a member set's own text,
whose answer is the spelling's split. Those are text questions with no row behind them. They go
when their callers stop holding text, not when the registry is re-keyed.

## Typed lookups: today's softened key against the canonical key

Every typed A/B seam reaches `unRowOfTyAB`, which answers `unRowOfKey(ty)`. At that funnel the
probe compares the answer with `unRowOfTyKey(ty)`, over 316,844 calls:

| outcome | calls |
| --- | --- |
| the same row | 145,440 |
| neither key finds a row | 148,075 |
| one canonical type, a different row (`dupkey`) | 20,746 |
| two different types | 1,131 |
| only the softened key finds a row | 297 |
| only the canonical key finds a row | 1,155 |

- **Different types** (1,131) are the literal sets. `K` / `L` in `D8200.vl`, `two-atom-list-arms-is.vl`
  and `D7041.vl`, and `CaseMap` / `"a" | "b" | "c"` in `D5590.vl`, at sites 79, 87, 102 and 103
  (`monoAnnPin/union`, `markValueUnionAtoms`, `markMapUnionArms`, `markRefArrayArms`). The softened
  key hands back the first literal set's row for the second set's type.
- **One type, another row** (20,746, 19,498 of them at site 102) is D14742's pair. The
  softened key finds the alias row, the canonical key the expansion's.
- **Only the canonical key** (1,155) finds the expansion's row for a recursive alias that the
  softened key misses (sites 40 and 42), and record unions spelled by shape (`Shape`, `C|S`, `A|B`,
  sites 10, 16 and 17).
- **Only the softened key** (297) finds `i32|null`, `f32|null`, `f64|null` and `i64|null` for a newtype
  member (`d341_nt_*`), at site 1.

These sites see only "same" or "neither": 2, 32, 34, 35, 36, 37, 39, 44, 67, 68, 80, 83, 85, 90,
96, 97, 101 and 105. On them the canonical key gives the same answer on every program.

## D4320, exactly

**A tag is not positional in a row.** `assignTags` ranks a struct variant's signature among all
variants, and equal signatures share a tag. A scalar's tag is `scalarTagOfKind`,
`uVariants.length` plus its kind. A ref-list, map or closure arm takes a slot band above
`uAtomBandTop()`. So reordering a row's members renumbers nothing, and neither does merging two rows of one
type. A tag is a module-internal constant, and no tag is printed. What moves bytes is the
variant count: one row fewer or more shifts every scalar tag constant by one. The sentence in
ARCHITECTURE.md §3.4 that calls tag numbering positional describes the row's parallel member
columns (atoms, types, kinds, variant slice). Those are positional and are never deduped. The
tags are not.

So the question D4320 asks is not about tags. It is whether a two-member type is a box at all:

- **One spelling, two types: the type must not split.** `i32[] | K[]` with `K = 0 | 1`. The emit
  spelling softens `K` to `i32`, so both members spell `i32[]`. The union is that list: no row is
  minted (`oneListUnionAliasName`, D4743) and `boxTagOfTy` answers 7. The canonical key keeps
  `[(0 ; 1)] ; [i32]`, two members, and `repCanonId` gives the members two ids. Neither type key
  says "one list". The question is a **rep** question, member equality after numeric-literal
  softening, and it is decided before any row exists.
- **One spelling, two types: the type must split.** `K[] | J[]` with `K = "a" | "b"` and
  `J = "c" | "d"`. Both arms ride the atom list under one tag (kind 7), and `is K[]` tests the
  elements (D4938). The rows `K` and `J` exist, and the softened key folds both to `string`. This
  is the 219-row split above and the 1,131 typed lookups where the softened key returns `K`'s row
  for `J`'s type. The canonical key keeps them apart, as the literal-preserving ruling requires.
- **One type, two spellings that stay apart today** is D14742's pair (71 rows): the expansion and
  its recursive alias. Nothing observable needs the second row. The alias's list and map arms are
  registered under its name, so the row cannot be dropped until those arms register off the
  row's type.

**What the canonical key must include** for the partitions to agree:

1. **No member order.** Tags are global, so order carries nothing. `unTyKey` already sorts.
2. **Literals and newtypes.** The ruling keeps literal sets apart, and a newtype is its own
   type. `unTyKey` already keeps both.
3. **A recursive member keyed the same whatever the walk's origin.** `unTyKey` does not do this
   yet: the back-reference text depends on the cycle's entry point (14 splits in 2 programs).
4. **Not the one-list collapse.** That is decided on the rep before minting, and it stays
   `boxTagOfTy`'s question: is every member the same list after numeric-literal softening? A key
   that folded numeric literals to answer it would merge `K | i32` with `i32` and break the
   literal ruling.

No observable change (a printed tag, or an ABI) blocks keying the registry by type. The cost of
a merge is bytes only, where it changes the variant count.

## Cut order

1. **Typed lookups on the 18 clean sites ask the canonical key** (this lane's next PR). The
   probe shows the same answer in every program, so the change is identity. It takes those sites
   off `canonUnionKeyOfTy`'s render.
2. **The canonical key's recursive text is made origin-independent.** It is a prerequisite for
   any site that meets a recursive alias. Expected identity, since the key is read only at the
   mint adopts.
3. **The literal-set sites (79, 87, 102, 103) ask the canonical key.** The 1,131 answers change
   from the first literal set's row to the set's own. The rows hold the same box (a string atom),
   so the expected movers are bytes-only. Grade by sweep. The `monoAnnPin/union` arm (site 79)
   is the mono reader `monoPinUnionNameOfTy` feeds.
4. **D14742: a recursive alias's list and map arms register off the row's type**, then the alias
   binds to its expansion's row. This removes 71 rows in 64 programs and the 20,746 `dupkey`
   answers, and lets sites 40, 42, 91 to 95, 102 and 104 switch. In each of the 71 pairs the two
   rows record the same variant slice, so the expected movers are bytes-only.
5. **The sites whose callers hand over the wrong type** (the 140 splits) get the right type
   threaded first. Then `boxTagOfTy`'s fallback gets its rep twin (item 4 above, member equality
   after numeric-literal softening). Then `monoSubstIsExpr` and `monoFoldLayoutAt`'s `is` arm ask
   the arm's row by type. They need the row the spelling names (#7117), which is the canonical
   key's row once items 1 to 4 have landed.
6. **The union-name renders** (`monoPinUnionNameOfTy`, `monoPinUnionBoxed`,
   `monoListUnionRowName`) stop being keys once minting and lookup read the canonical key. Each
   then keeps its product only as the row's display name.

## Proof

This is a docs-only change: no compiler source changes, and the seed is byte-identical by
construction. The probe compiler was built in a scratch worktree, and it was neither committed
nor refreshed into a seed.
