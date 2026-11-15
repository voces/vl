# Hash-consed types with binder identity: design note, 2026-11-14 (lane H)

Review item "medium 1" (`engineering-review-2026-11.md` §6): hash-cons the type arena and give type
variables binder identity. Then equality is id `==`, `assignable` gets a persistent memo, the depth
caps and `tyMutEpoch` go, and instance keys become id vectors. L1 (the typed IR) and L2 (inferred
interfaces) both need this.

This note is docs only and changes no compiler code. It was measured at master `58c5e37b`, against
a fixpoint seed (two `refresh-compiler.sh` runs gave byte-identical output, sha256 ``8857fc27…``).
Every count comes from a command in §A, not from reading. The coordinator checks the note before
stage 1 starts.

## 0. Summary

- **The arena is about 90% duplicates.** The compiler's self-compile ends with **147,421 rows**, and
  at most **15,979** of them are structurally distinct (§4.2). Lists go from 25,395 rows to 62,
  nullables from 21,236 to 332, and unions from 25,884 to 2,736.
- **Four structural comparers, three modes and one string key** answer "is this the same type".
  They have 633 call sites (§1.1).
- **Index identity carries data.** 26 sidecar tables (371 references) attach a name, a brand, a
  function set or an owner to an arena index. Interning would merge two indices that the sidecars
  keep apart, so these must fold into the intern key first (§1.4).
- **Rows are written after they are minted** at 43 `tyMutEpoch` bumps in 13 files, and 40
  epoch-stamped memo reads depend on that. 33 of the 43 bumps pin an empty collection's element,
  key or value (§1.2). In the self-compile, **all 25,648 bumps happen before emit begins, and none
  during emit** (§4.2). On the distilled corpus, monomorphizing re-checks do pin during emit (lane
  E counted 107 moves in 103 programs), so the seal is scoped per instance (§2.2).
- **The design** is one intern table (the emitter's existing `hcIntern`, moved down) and holes as
  first-class rows with a solution column, so no row is ever written after it is minted. A nominal
  id becomes part of each row's key, and each old comparer becomes `proj(a) == proj(b)` over a
  small set of memoized projections.
- **Restarts stop re-minting the arena.** `checkRestart` re-mints the arena today, which is the D16215
  class: a type id held across a restart goes stale, and 236 type-holding tables (lower bound) rely
  on hand-kept resets. Interned ids survive a restart (§1.7, §2.7).
- **Six stages, each deleting code:** binder identity, holes leave the rows, interning, epoch-free
  memos, id-vector instance keys, depth caps. The estimated net is **about −2,000 compiler lines**
  (§5), with emit_mono's pin-helper count down by about 10 at stage 5.

## 1. Inventory

### 1.1 Type-equality functions

| comparer | def | calls (files) | notion |
|---|---|---|---|
| `tyEq` (+`tyEqGo`, `unionEq`, `unionMembersInto`, `tyEqMemoTag`) | `check_types.vl:1358` | 125 (39) | render equality: field order matters, union layers flatten, every open hole equals every other, brands must match |
| ↳ mode `tyEqSameHoles` | `check_types.vl:1334` | 23 (10) | `tyEq` with each hole equal only to itself and parameters split by `tvNestOf` |
| ↳ mode `tyEqSoftLits` | `check_types.vl:1349` | 3 (4) | `tyEq` with a lone literal equal to its base |
| `tySame` (+`tySameAt`, `tySameMembers`) | `check_types.vl:3995` | 432 (56) | structural: records compare as field **sets**, parameters compare by declaration (#8036), and an error, literal or negation is equal only to its own index. **Capped at depth 24, and answers `false` when the cap runs out.** |
| `tySameSpelled` (+4 helpers) | `emit_ty_canon.vl:283` | 14 (5) | `tyEq`, plus a nested Set spelled as its boolean map, with the alias wrapper peeled; `TY_WALK_DEPTH`, plus a walk budget |
| `tySameSet` (+4 helpers, `mapTwinExact`) | `emit_ty_canon.vl:464` | 15+5 (6) | union members compared as a set, at every depth |
| `tyCanonKey` | `emit_ty_canon.vl:630` | 16 (3) | a **string** structural key, with a 100,000-type budget; past the budget, or on a cycle, it falls back to `tyToStr` |
| `sameVariantTy` | `check_relate_core.vl:984` | 19 (4) | mutual assignability, which is a relation, not an identity. It stays. |

Total: **633** call sites for the identity notions in the first six rows (125 + 23 + 3 + 432 + 14 +
15 + 5 + 16).

Two more groups sit beside them:
- **Derived comparers.** 60 functions pass the name filter in §A.2 and read the arena. Examples are
  `mapTwinPair`, `fieldStorageEq`, `monoSameTyCtor`, `jrSpelledAlike` and `unMemberSameShape`. Most
  of them ask a **rep** question (do two types store alike?), which is medium 2's domain
  (`2026-11-14-rep-adt-design.md`). This design gives them an id to compare. It does not delete
  them.
- **String comparisons of renders.** These are small: 12 `render == …` tests and 13 render-into-key
  concatenations (`tyToStr`, `tyToEmitName`, `tyToNominalName`). They are the destringify program's
  remainder, and stage 5 removes those that are keys.

The emitter already runs a structural hash-cons of its own, `hcIntern` (`emit_rep.vl:1517`).
`repIdOf` (`:1630`) walks the non-interned arena once per mode (`canon`, `elem`, `mv`, `row`). It
keeps a stack per mode, uses de Bruijn back-edges (`HC_BACK`) for cycles, and tracks "impure"
answers, all because the arena below it is not interned. Those 16 functions are 453 lines.

### 1.2 In-place mutation and `tyMutEpoch`

`tyMutEpoch` (`check_types.vl:199`) is the contract that "an existing row changed". There are **43
bumps in 13 files**, and each one marks a write into a row that was already handed out:

| cause | bumps | where |
|---|---|---|
| an empty collection's element, key or value is pinned (`aElem`/`mKey`/`mVal` from `-1`) | 33 | narrow_flow 9, member_call 7, operators 6, relate_core 3, hole_links 3, leaf_steps 2, demands 2, access 1 |
| a function type's parameter or return is patched (solved parameter, inferred return, fixpoint reset to `-2`) | 3 | `check_fn_decl.vl:356`, `check_inferred_return.vl:1153`, `check_side_rows.vl:582` |
| a declared alias's placeholder is filled (the recursive-declaration knot) | 3 | `check_relate_core.vl:2981`, `:10477`, `:10766` |
| a null-fold record's fields are re-pointed (`nulFoldTieRecordGo`) | 1 | `check_relate_core.vl:10868` |
| a hole's demanded shape gains a field (`st.objFieldNames.push`) | 1 | `check_type_shape.vl:710` |
| a null hole is filled (`t.nInner = inner`) | 1 | `check_relate_core.vl:695` |
| a per-program reset | 1 | `check_core_state.vl:946` |

Some writes escape the epoch:
- `tyVarRenameRow` (`check_types.vl:352`) is an emitter-side rename with its own counter,
  `tyVarRenames`.
- Writes through an alias of a row's array (for example `bpt[k] = sv`, where `bpt` is
  `bt.fnParamTypes`) are counted only by the bump beside them. The field-write grep finds 45 writes
  and misses those.

**Readers.** There are **40 epoch reads in 11 files**:
- 27 are emit-side: `emit_rep` 15, `emit_union_tykey_text` 4, `emit_classify` 3, `emit_shape_rows`
  3, `emit_nullable_rets` 2.
- 13 are checker-side: `check_types` 4, and `check_subst`, `check_relate_core`, `check_fit_rules`
  and `tyquery` 2 each, plus `check_emit_queries` 1.

Each reader is a memo that drops everything when the epoch moves. `cUserTypesVer` (3 bumps) does the
same job for the name registry. It is a different table, and this design keeps it.

Arena pins are **not** rolled back. `check_rollback.vl` never touches `T.tys`, so a pin made under a
quiet probe outlives the rollback. The hole column below keeps exactly that behaviour, with no trail.

### 1.3 Depth caps

**322** functions take a `depth`-named `i32` parameter and read the arena (§A.3). Of these:
- 134 have a guard that answers on exhaustion: `false` 64, `0` 25, `-1` 16, `true` 8, `""` 6, other
  15. An exhausted `false` or `true` is a verdict, not an "unknown".
- 188 only pass the depth on, or guard it some other way.

**695** call sites pass these functions a literal or named cap. The common values are 8 (173 sites),
`REC_STORE_DEPTH`=8 (102), 6 (58), 4 (45), `FT_HOLD_DEPTH` (34), 16 (15), 64 (11) and 24 (7). The
caps serve two purposes:
- **termination on cyclic rows.** Cycles exist only through declared aliases.
- **cost on shared sub-types,** because a DAG walked as a tree is exponential.

Interning plus a memo per id removes the second purpose, and a nominal cut removes the first.

### 1.4 Index identity that carries data: the sidecars

Today the arena index *is* a type's identity, and 26 tables (**371 references**) hang non-structural
facts off it:

| family | tables | refs |
|---|---|---|
| declared structs | `cStructTyIxs`, `cStructTyIxSet`, `cStructNames`, `cStructFirstPos` | 57 |
| declared unions | `cUnionTyIxs`, `cUnionTyIxSet`, `cUnionNames` | 44 |
| variant members | `cVariantMemberTyIxs`, `cVariantMemberTyIxSet` | 33 |
| generic applications | `gaAppTyIxs`, `gaAppTyIxSet`, `gaAppHeads`, `gaAppArg{Flat,Start,Count}` | 94 |
| newtype brands | `nwTyIxs`, `nwNames`, `nwBaseTyIxs` | 41. `nomNameOfTy` scans `nwTyIxs` linearly: 0.42% self time in the profile |
| function sets | `elabFnSetTy` | 57. `check_elab_cap.vl` copies a `TyFunc` row (12 direct `T.tys.push`) so that a set can be attached to the copy |
| literal-union aliases | `luHiddenTyIxs`, `annPendingVariantTyIx{s,Set}` | 14 |
| type-variable owners | `tyVarOwner`, `tyVarDeclOwner`, `tvNestOf`, `tyVarRenames` | 31 |

Each of these means "two rows that are structurally equal are different types". A declared
`type P = {x: i32}` and the literal `{x: 1}` are equal under `tySame`, but only the first is in
`cStructTyIxs`. Interning the structure alone would give both the name `P`. So **the nominal fact
becomes part of the key** (§2.3).

### 1.5 Type variables

A type variable is `TyVar{tvName: string}`. Its identity is a name plus a sidecar:
- An inference hole is named `"?" + fn + "." + i`. The 7 `"?" +` constructions are listed in §A.6;
  `paramHoleName` has 23 call sites; `solvedParamTys` is keyed by that string.
- 65 tests read the prefix, as `tvName[0] == '?'`.
- A declared parameter is told apart by `tyVarOwner`, `tyVarDeclOwner` (#8036 compares by it in
  `tySame`) and `tvNestOf`, and in the emitter by renaming the row in place (`tyVarRenameRow`).

Three mint sites, `mkTyVar` and `mkTyVarOwned` (`check_subst.vl:82`, `:92`), produce all of them.

### 1.6 Instance keys

Mono's registry key is a **string**. There are 16 builders, 430 lines, in `emit_mono.vl` and
`emit_inst_key.vl`:
- `monoMakeInstanceKeyOf` (`:9346`, 75 lines) and `monoTypedInstKey` (`:9425`, 56) assemble a head,
  then a pin segment.
- `monoKeyPinSeg` (`:8354`) adds, per pin, the pin's **spelling** (`pin_spell.vl`, 23 functions, 376
  lines) and three discriminators: `monoAnonPinDiscrim`, `monoSetPinDiscrim` and
  `monoLitUnionPinDiscrim`.
- `monoMakeInstanceKey` (`:8430`) appends `"~" + name + "=" + tyCanonKey(…)` for type-testing bodies.
- The canonical shadow key, `instKeyCanon` and `instKeyNote` (`emit_inst_key.vl:81`, `:110`), is
  `tyCanonKey` per pin, joined with `,`.

There are 9 `tyCanonKey` calls in `emit_mono.vl` and 2 in `emit_inst_key.vl`. Each key's equality
is string equality over renders of types, which is the destringify program's last large key.

### 1.7 Restarts re-mint the arena: the D16215 class

`checkRestart` (`check_core_state.vl:1360`) runs `initChecker`, which empties `T.tys` and re-mints
it from the builtins. There are 3 calls, all in `check_pins.vl`; the pass after `fnTagEtaAgain` is
one of them. So every type id a table holds across a restart then indexes a different type.
- **D16215** (#8061) was exactly this: `fnTyFactsReset` (`check_elab_cap.vl:3383`) did not clear
  `fnSlotCallAt`, `fnSlotCallArgs` or `fnSlotAnnTys`.
- **The reset list is kept by hand.** `fnTyFactsReset` clears 35 tables directly and calls 16
  resetters. `check_elab_cap.vl` and `check_fn_tag*.vl` alone declare 150 `i32`-valued module
  tables, and nothing records which of them hold type ids or which reset clears each.
- **One survivor is deliberate.** `elabHoleRowsKeepStable` (`:3314`) keeps a banked row only when
  "every type it names is … an index below the fresh arena", meaning a builtin. That filter is a
  hand-written guard against this same class.
- **The population.** By name alone, 236 module tables hold type ids (145 checker-side, 91
  emit-side): `rg '^(export )?(let|const) \w*(Ty|Tys|TyIx|TyIxs)\w*: (i32[]|{[…]: i32…})'`. That is a
  lower bound, since a table whose name does not say `Ty` is not counted.

## 2. The design

### 2.1 One intern table

`hcIntern(tag, args) → id` (`emit_rep.vl:1517`) is already a correct open-hash table over
`(i32 tag, i32[] args)` with FNV-1a, chains and growth. **Move it** into its own module, which
imports nothing, and give it two instances:
- `TY`, for the arena;
- `HC`, for the emitter's rep modes, until lane E's stage 1 replaces them with its `RepNode` arena.

`addTy(row)` (`check_types.vl:4530`) is the one push today, apart from `check_elab_cap.vl`'s 12
direct pushes, which go through it as their first step. `addTy` becomes:

```
addTy(row, nom) = TY.intern(variantTag(row), childIds(row) ++ scalars(row) ++ [nom])
                  → existing id, or append row and return the new id
```

- **Scalars** are `aRead`, `mSet`, the literal's kind, text id and `litWide`, the primitive's name
  id, and each record field's name id. A name id comes from one checker-lifetime string table, so
  each field name costs one string hash per mint. `internLitTy` (`:4654`) and the pinned `TY_*`
  primitives are already this table for their two variants, and they delete into it.
- **Children** are ids, so they are already canonical. The shallow compare in the bucket chain is
  the whole equality: no recursion, no depth, no stack.
- **`nom`** is 0 for a structural row and a nominal id otherwise (§2.3).

### 2.2 Holes are rows; solutions live in a column

Interning needs rows that never change, and the 33 collection pins are the main obstacle. Today an
open element is `aElem: -1`. The pin writes the row, and every holder of the index sees the write.
That is a mutable cell spelled as a sentinel. Instead:

- **An open position is a hole row.** It is `TyVar` with binder kind `hole` (§2.4), minted fresh per
  empty literal, per un-annotated parameter and per pending return. Two holes are never equal,
  because each is its own binder.
- **A pin is `holeSolve(h, ty)`.** It writes a `holeSol: i32[]` column (union-find, with path
  compression), and "both sides open" in `check_relate_core.vl:757` becomes a link. The 43 bumps
  become one counter, `holeGen`, which only `holeSolve` advances. The existing re-pins (a later
  `.push` that joins function sets, `check_member_call.vl:1125`) re-solve the same hole. The hole
  table records them, so nothing about the containing row changes.
- **Readers see the solution without being edited.** `tyAt(x)` returns the row of `zonk1(x)`.
  - For a row with no hole child, which is a bit computed at mint, that is the row itself.
  - For a row with a solved hole child, it is the interned row with each solved child replaced,
    memoized per `(x, holeGen)`.
  - So a reader that reads `t.aElem` and compares ids sees the solved id, as it does today after an
    in-place write. The 246 `aElem < 0`-style open tests become `tyOpen(child)`. That is one call
    in place of one comparison, so the line count does not change.
- **The other causes.**
  - The 3 function-type patches solve the declaration's parameter and return holes.
  - The 3 placeholder fills are not mutation once nominal rows are keyed by their declaration
    (§2.3). The body is attached to the nominal id before anyone can intern against it.
  - The null-fold tie (1) re-points fields by minting the tied record and solving the wrapper
    holes.
  - A hole's demanded shape (1) is the hole's state (`holeShape[h]`), not a row. The `TyObj` is
    minted when the shape is read for a solution. This is the row variable L2 wants: an open record
    `{fields… | ρ}`.
- **Freezing.** All bumps in the self-compile happen before emit (§4.2), so at the end of checking
  `holeSealAll()` zonks every node type once and closes the column. Emit then runs over an arena in
  which every id it holds is final. Mono's instance re-checks mint their own holes (their own
  binder), so solving those never changes a sealed id. The one emit-phase bump measured, in
  `scripts/dup-census.vl`, is stage 2's first acceptance check.
- **Emit-phase pins are not rare on generic programs.** The self-compile has no type parameters.
  Lane E's stage-0 count on the distilled corpus found 107 `tyMutEpoch` moves in 103 programs, all
  in the monomorphizing phase. So stage 2 does not seal globally. Instead:
  - Each mono instance re-check gets its own hole binders, scoped to that instance.
  - The seal covers ids minted before emit.
  - A pin during emit solves only instance-scoped holes.
  - Stage 2's acceptance is that the 103 programs' bumps all land on instance-scoped holes. A bump
    that lands on a pre-emit row is a named finding, fixed before stage 4 drops the epoch.

### 2.3 Nominal rows are keyed by their declaration

One dense column, `tyNom: i32[]` (indexed by id, 0 for structural), replaces the 26 sidecars in
§1.4. A nominal id indexes one table: `nomKind` (struct, union, variant member, generic
application, brand, function set, literal-union alias), `nomName`, `nomDecl` and `nomArgs`.
- **Recursive aliases.** A declared alias's row is keyed by `(variant, nom)` alone, so its key does
  not depend on its fields. The 0a placeholder is minted with the nominal key and its body is
  attached once. A cycle then always passes through a nominal id, and no structural row is ever
  cyclic. Any walk can cut at a nominal id it has already met, with a visited bit per walk instead
  of a depth.
- **Generic applications** (`Box<i32>`) are keyed by `(head decl, arg ids)`. This is today's `gaApp*`
  triple, as a key instead of a side list.
- **Brands and function sets** are nominal ids over the base row's key. `nomNameOfTy` becomes a
  column read, and `check_elab_cap.vl`'s copies become `addTy(row, fnSetNom(s))`.

### 2.4 Binder identity for type variables

`TyVar{tvKind: "param" | "hole", tvBinder: i32, tvIdx: i32, tvName: string}`:
- A parameter's binder is its declaring `FuncDecl` or `TypeDecl` node. `tvIdx` is its position, and
  `tvName` is only for rendering.
- A hole's binder is its own hole id. `tvName` keeps `_`.

The intern key is `(kind, binder, idx)`, so a parameter has exactly one id however many annotations
mention it. What this deletes:
- The D16150 sentence in `tySame` ("one declaration's type parameter is one type, however many
  annotations minted a row for it") becomes true by construction.
- `tyVarOwner`, `tyVarDeclOwner`, `tvNestOf`, `tyVarRenameRow` and the owner-by-name scan at the top
  of `callFtyPinCstrs`.
- `solvedParamTys` and the other hole-name-keyed tables become `i32`-keyed.

Substitution (`substTyDeep`, `check_relate_core.vl:9858`) maps `(binder, idx) → id`, and the
binding environment is an id vector.

### 2.5 Equality: one identity plus memoized projections

After §2.1 to §2.4, two ids are equal exactly when the rows are the same type, nominal identity
included. Each old comparer is a projection:

| old | new | projection rule (per variant, memoized `id → id`, permanent) |
|---|---|---|
| `tyEqSameHoles` | `a == b` | none: this is exact identity |
| `tySame` | `same(a) == same(b)` | record fields sorted by name; union layers flattened; struct, variant-member and generic-application `nom` erased; brand kept |
| `tyEq` | `render(a) == render(b)` | union layers flattened; every open hole goes to one `_` id; nominal kept only as a brand (`nomNameOfTy`) |
| `tyEqSoftLits` | `soft(render(a)) == …` | a lone literal goes to its base |
| `tySameSpelled` | `spelled(a) == …` | `render` plus a Set as its boolean map, alias wrapper peeled |
| `tySameSet` | `set(a) == …` | union members sorted and deduped, at every depth |

- **One walker.** A single function, `tyProject(id, mode)`, maps children, applies the mode's rule
  at each variant and re-interns. Each mode is a `match` arm table, not a comparer.
- **Persistent results.** Because ids are immutable after sealing, a projection's memo never
  invalidates.
- **Cycles.** A projection that erases a nominal id on a recursive declaration meets a cycle. It
  emits the `HC_BACK` back-edge that `repIdOf` uses today.
- **Known limit.** A rolled and an unrolled spelling of one recursive type are bisimilar, but they
  need not get the same back-edge id. Where stage 3's shadow finds such a pair, that projection
  keeps a coinductive pair compare, memoized per id pair. It is the only stack guard left.
- **`tySame`'s self-only arms** (error, literal, negation) do not change under interning.
  `mkErrTy` has one call site (`TY_ERR` in `initChecker`), so there is one error row anyway.
  Literals are already interned, and negations intern structurally, which matches `tySame` once
  their inners are ids.

**Unions keep their order.** Rendering and box tags are positional ("box tags stay positional",
`emit_ty_canon.vl`), so a union is interned by its ordered member list, exactly as minted. Order
and dedup are the `set` projection's job. Normalizing at mint is a later decision, made only on a
zero-disagreement shadow.

**`assignable` gets a persistent memo** keyed `(src, dst, nomLitRelax)`. It records a result only
when:
- both ids are ground (no open hole);
- `holeGen` did not move under the walk (the walk pinned nothing);
- no other ambient flag was set.

This lifts today's restriction (only a nested `TyObj` pair, cleared after each outermost call by
`pairMemoClear`, 0.49% of self time). How many of `assignableGo`'s ambient flags a ground pair can
see is medium 3's measurement, since that item splits the pure `relate`. This stage memoizes only
under the flags that are in the key.

### 2.6 Instance keys are id vectors

`instKey = TY.intern(INST, [template, ek, pinId(p₁)…, frame, cbDecl…])`.
- `pinId` is the projection the key's equivalence needs. Today that is `tyCanonKey` plus the three
  discriminators. After lane E's stage 4 it is the pin's `RepId`.
- `instKeyFirst` and mono's registry are keyed by `i32`.
- `tyCanonKey`, the string assembly in `monoKeyPinSeg` and `monoMakeInstanceKey`, and the
  spellings that exist only to feed a key are deleted.
- Instance **names** in the module stay spelled. Only the key changes.

### 2.7 Ids survive a restart

Once interned, an id names its content, not its position in a pass. So a restart no longer clears
the intern table:
- **Structural ids** mean the same type in the next pass. Nominal ids are keyed by declaration
  nodes, which a restart keeps, since the parse is kept.
- **Hole binders** are `(node, slot)`, interned, so the next pass mints the same hole ids. Only
  `holeSol` is cleared, which is the right meaning for a fresh walk: same holes, nothing solved yet.
- **`initChecker`** clears the intern table only between programs (`check_core_state.vl:946`'s
  per-program case), as `hcReset` does today.

What this removes, and what it does not:
- **Index staleness is impossible by construction.** A type id held across a restart cannot point
  at a different type. So D16215's three tables, and `elabHoleRowsKeepStable`'s "below the fresh
  arena" filter, are no longer needed for correctness. The filter deletes at stage 3.
- **Fact staleness is not affected.** A table can still hold an answer that the previous pass
  decided and the next pass must decide again. That is a per-walk reset, and it needs one registry
  of per-walk tables instead of a hand-kept list. That registry is L5's session value and the
  review's small item on `RB_*` masks. It is not proposed here.

Stage 3's acceptance: D16215's witness still runs, and the fix's three lines are reverted in the
shadow PR. If the witness still runs, the restart-staleness class is shown closed for type ids.

## 3. Migration order

The gate for every stage:
- `refresh-compiler.sh` twice (fixpoint) and the full gate.
- **Output identity**: the candidate and its predecessor emit byte-identical modules for the corpus
  and for the L2 compiler build, which is the merge queue's identity diff. A byte that moves is a
  named mover with its witness.

Each stage PR reports five things: net compiler lines, the pin-helper delta, L2 and plumb guest fuel,
peak RSS, and every byte mover with its witness.

Each stage that changes an answer runs first as a **shadow**. The old and new answers are compared
at every call through the existing `repABNote` channel, over the corpus and the self-compile. The
switch is made only at zero disagreements, or with each one explained. The shadow is deleted in the
same PR as the switch.

| stage | change | deletes | byte movers |
|---|---|---|---|
| **0. Move `hcIntern`** | Pure move into its own module, shared with lane E (§6). | 0 net (a move) | none: same code |
| **1. Binder identity** | §2.4. `TyVar` gains `tvKind`/`tvBinder`/`tvIdx`; hole-name keys become `i32`. | `tyVarOwner`/`DeclOwner`/`tvNestOf`/`tyVarRenameRow`/`tyVarRenames`, the owner arms of `tySame`/`tyEq`, and the owner scan in `callFtyPinCstrs`. About **−150 to −250**. | Expected none. Named risk: `tyVarRenameRow` exists to tell two parameters' instances apart. If a name it produced reaches a module name, `--names` output moves. That is checked with `--names` on both arms. |
| **2. Holes leave the rows** | §2.2. Hole rows, `holeSolve`, `tyAt` reads through `zonk1`, `holeSealAll` at the end of checking. | 43 bumps become 1; the in-place-write comments; `nulFoldTieRecordGo`'s rewrite. About **−50 to −100** (it adds about +80 for the column). | Expected none. Named risk: code that compares two children by raw index where both were pinned to one id. `zonk1` covers reads through `tyAt`, but a direct `T.tys[x]` read does not. The 175 such reads route through `tyAt` first, which is a mechanical rewrite at no line cost. |
| **3. Interning and projections** | §2.1, §2.3, §2.5, §2.7. The shadow runs each comparer against its projection. A restart keeps the intern table. | `elabHoleRowsKeepStable`'s arena filter; the `tyEq` family (194 lines), the `tySame` family (154), the `tySameSpelled`/`tySameSet` families (about 250 of `emit_ty_canon.vl`'s 325), and the sidecars' maintenance code. About **−500 to −700**. | Named risk: **arena order**. Interning removes about 90% of rows, so every later index shifts. Any output ordered by arena index (`emit_type_order.vl` and anything sorting by `ty`) moves the type section. The shadow stage first logs every ordering that reads an index, and those orderings move to first-ask order **before** the switch. A second risk: `tySame`'s depth-24 `false` and `tyCanonKey`'s budget fallbacks. Each disagreement the shadow finds there is a case where today's answer is wrong, and it is filed as a row. |
| **4. Memos lose the epoch** | The 40 epoch reads become id-indexed arrays. Emit-side memos (27) are unconditional after the seal. `assignable` gets its persistent memo. | `tyMutEpoch`, the stamp columns (`tdStamp`, `hhStamp`, `utkShapeStamp`, `utkMemoStamp`, …) and `memoMoved` plumbing on the epoch. About **−150**. Lane E's `rtSync` epoch goes in its own stage (§6). | None: memo hits return what a recompute would |
| **5. Instance keys** | §2.6, with the string key and the id key in shadow. | The key builders (430 lines down to about 80); `tyCanonKey`; key-only spellings in `pin_spell.vl`. About **−400 to −500**, and emit_mono's pin-helper count goes from 908 to about 898. | Expected none: the instance order is the first-demand order, unchanged. A merge that the string key prevented and the id key allows, or the reverse, moves bytes, and the shadow lists each one. |
| **6. Depth caps** | Remove the `depth` parameter from the 322 walkers. The order is guards that answer a verdict (72) first, then the 188 that only pass the depth on. A per-cap counter tells which caps ever fire on the corpus and the self-compile. | About **−600 to −700** (guard line, parameter, cap constants) | A cap that never fires deletes byte-identically. A cap that fires is a mover: a deep type got today's exhaustion answer. It is filed with its witness, and is usually a clause-1 bug. |

The order is forced:
- 2 precedes 3, because only immutable rows can be interned.
- 3 precedes 4, 5 and 6, which all key on canonical ids.
- 1 can go before 2 or after it, but it must precede 3, so that a parameter's key is its binder.

Stage 0 is a separate small PR so that lane E can build on it the same day.

### 3.1 Amendments after the first stages

- **1e is deferred to L1** (coordinator ruling). Mono binds type-parameter *names* to spellings:
  49 functions take the `tvN`/`tvV` lists, with 334 references in `emit_mono.vl`. So
  `tyVarRenameRow` and the `__sh` shadow alias retire only when mono instantiates into IR.
- **Fit with L5** (`2026-11-14-phase-products-design.md` §3–4):
  - **Intern resets.** From stage 3, the intern table has exactly two entry points,
    `internSessionReset` and `internProgramReset`, and no other code clears it.
  - **`DeclKey`.** Nominal keys (stage 3) and type-parameter binders (stage 1's `tvBinder`) go
    through one `declKeyOf(node)` function. Stage 2b routes the existing binders through it. L5's
    step 6 re-points it from `NodeId` to `SymId`.
  - **Order.** Stage 2 precedes L5 step 3 (`CheckRun`), and L5 step 1 (`InstReq`) precedes stage 5,
    so the id-vector instance key reads `InstReq`.


### 3.2 Status, and the revised stages 3–5 (2026-11-15)

**Landed**
| stage | PR | what |
|---|---|---|
| 0 | #8076 | `compiler/intern.vl` |
| 1 (1a–1d) | #8098 | binder slots |
| 2a | #8109 | the three pin writers |
| 2b API | #8155 | `tyOpen`, `declKeyOf` |
| 2b | #8162 | the hole column |
| 2c-1 | #8197 | hole union; three D16301 traps run |
| 3a | this PR | every arena read goes through `tyAt` |

Stage 1e is deferred to L1, as §3.1 records.

**Why the 2c-2 deletions moved to stages 3 and 4.** The 10 bumps that remain sit on in-place
writes to `nInner`, `fnRet`, `fnParamTypes`, `objFieldTypes` and `objFieldNames`. Each of those
fields has 400–835 reads, so moving one into the hole column, as 2b did for collection children,
costs about +250 lines. Even with every write gone, the 40 epoch-stamped memos keyed by row index
would still need the epoch. So the bumps cannot delete before the memos re-key.

**Forwarding is not immutability.**
- `tyFwd`, forwarding an old index to a newly minted row, was considered and dropped.
- The old id keeps its old content as its intern key while `tyAt` shows the new content, so it is
  in-place mutation under another name.
- Truly freezing a patched row means re-pointing every table that holds its id.

**Revised plan: intern at seal, not at mint.**
- **3b, the canon pass.**
  - When checking ends, and per mono instance, one pass computes `tyCanon[ix]`.
  - That is a content-addressed id for every row, built bottom-up through `compiler/intern.vl`,
    with nominal cuts for cycles.
  - It runs first as a shadow beside today's emit-side comparers (`tySameSpelled`, `tySameSet`,
    `tyCanonKey`), with an agreement count.
- **3c and the emit side of stage 4.**
  - The emit memos switch to `tyCanon` ids, which never change after the seal.
  - That deletes the 27 emit-side epoch reads and their stamp columns, and the emit-side comparers
    and string keys.
  - Lane E's `repOf` keys on `tyCanon`.
- **Stage 5.** Instance keys become `tyCanon` id vectors, as §2.6 describes.
- **The checker side waits for L2.** The checker keeps structural `tyEq` and `tySame` while it is
  still constructing types. The `tyEq`/`tySame` families and the checker's 13 epoch reads delete
  when L2's inferred interfaces end in-place patching.

**Expected deletions**
- Emit side, stages 3–5: about −400 to −600 lines.
- Checker side, with L2: about −350.

## 4. Measured cost

### 4.1 Today

The seed is `58c5e37b`'s fixpoint, and the box has 4 cores.

| workload | guest fuel (`VL_FUEL=1`) | peak RSS | notes |
|---|---|---|---|
| L2 self-compile (`vl build compiler/entry.vl`) | 83,352,748,510 | 4,270 MB (host, GNU `time`) | peak live set 998 MiB (`self-compile-time.sh`) |
| plumb main unit (`plumb-shape-cost.vl`) | 9,231,899,118 | 322 MB | baseline 8,975,636,030 / 318 MB |
| plumb tail unit | 6,688,466,384 | 322 MB | baseline 6,567,138,555 / 317.7 MB |

Where the self-compile's time goes now: a `VL_PROFILE_GUEST` run of 23,852 samples on a `--names`
seed, ranked by `profile-rank.vl`, inclusive. This run, and the arena probe in §4.2, were taken one
master earlier (`b9d20e5c`, its own fixpoint). That commit differs from `58c5e37b` in 8 compiler
files. One of them is `check_elab_cap.vl`, which mints function rows (its 12 direct pushes are
unchanged), so the arena figures may differ slightly at `58c5e37b`. The §1 counts and §4.1 cost
were re-taken at `58c5e37b`. At `b9d20e5c` the same two cost runs read 83,197,734,339 fuel and
4,269 MB.

| function | incl % |
|---|---|
| `assignable` | 3.60 |
| `tyEq` | 1.37 |
| `tySameAt` | 0.62 |
| `repIdOf` | 0.60 |
| `pairMemoClear` | 0.49 |
| `flattenVariantsInto` | 0.44 |
| `nomNameOfTy` (linear scan) | 0.42 |
| `tyHasTyVar` | 0.37 |
| `tyAt` | 3.32 self |
| `addTy` | 0.03 |

### 4.2 Arena shape

These numbers come from an instrumented compiler that was never committed. It was built into a
throwaway worktree and run with `vl check --codegen`. It classifies the final arena bottom-up by a
shallow key over children's classes. A forward reference counts as its own class, so "distinct" is
an **upper bound**. Every row reaching a `-1` hole counts as distinct.

| program | rows | distinct (≤) | rows at emit start | epoch at emit start → end |
|---|---|---|---|---|
| `compiler/entry.vl` | 147,421 | 15,979 | 147,083 | 25,648 → 25,648 |
| `scripts/dup-census.vl` | 3,470 | 920 | 3,346 | 243 → 244 |
| `scripts/plumb-shape-cost.vl` | 2,086 | 464 | 2,085 | 95 → 95 |

For the self-compile, broken down by variant (rows / distinct):

| variant | rows / distinct |
|---|---|
| function | 69,047 / 11,770 |
| union | 25,884 / 2,736 |
| list | 25,395 / 62 |
| nullable | 21,236 / 332 |
| map | 4,173 / 21 |
| record | 805 / 271 |
| literal | 866 / 772 |
| primitive | 14 / 14 |

9,262 rows reach an open hole.

### 4.3 Expected movement

- **Fuel.** Stage 3 makes the comparers (`tyEq` 1.37%, `tySame` about 0.8%, and part of
  `flattenVariantsInto`) a `==` or one memo read, and turns `nomNameOfTy` into a column read.
  Stage 4 removes `pairMemoClear` and makes repeated ground `assignable` pairs memo hits. Against
  that:
  - `tyAt` gains one bit test, and `tyAt` is 3.32% self. A hole-bearing row pays `zonk1`.
  - Interning costs a hash per mint: 147k mints at tens of instructions is about 0.01% of L2 fuel.

  So the expected movement is **L2 −2% to −4% after stage 4**, with stage 2 alone flat to +0.5%.
  `self-compile-time.sh` grades each stage. **Plumb** spends proportionally more in emit, so most of
  its saving comes at stage 4 (epoch-free emit memos) and stage 5 (no string keys). Expected −1% to
  −3%, graded by `plumb-shape-cost.vl --check` at each stage.
- **Peak RSS.** About 131k redundant rows go, and the per-mode memos shrink with them. Against a
  peak live set of 998 MiB that is **about −1% to −2%**. It is not the reason to do this. The bar is
  only that no stage rises past `plumb`'s +10%.
- **Seed size.** It falls a little with each deleting stage, and `seed-size.vl --check` grades it.

## 5. What it deletes

| stage | net compiler lines (est.) |
|---|---|
| 0 | 0 |
| 1 | −150 to −250 |
| 2 | −50 to −100 |
| 3 | −500 to −700 |
| 4 | −150 |
| 5 | −400 to −500 |
| 6 | −600 to −700 |
| **total** | **about −1,850 to −2,400** |

Beyond the line count, the stages remove:
- four equality notions and three modes, in favour of one identity and a mode table;
- 26 sidecar tables, in favour of one column;
- `tyMutEpoch` and its 83 lines of bumps and reads;
- every depth cap on a type walk;
- the last string-keyed instance registry.

The pin-helper budget (`emit_mono.vl` 908) is unchanged by stages 0 to 4 and falls by about 10 at
stage 5.

**This PR** (the note) changes **0** compiler lines and **0** pin helpers.

## 6. Fit with lane E (Rep as an ADT, `2026-11-14-rep-adt-design.md`)

**Order** (the coordinator's ruling):
- H's stage 0 lands first.
- E's stage 0 shadow runs in parallel with it.
- E's stage 1 (the `RepNode` arena) builds on H's stage 0 module.

**One interning primitive.** It lives in `compiler/intern.vl`, which imports nothing. Its shape:
- an `Interner` record holding today's `hc*` columns (tag, argument start/count, flat arguments,
  hash, chain, buckets, mask);
- `internNew()`;
- `intern(t, tag, args) → i32`;
- the readers `internTag(t, id)` and `internArg(t, id, k)`.

There are no string keys. `hcLen` (a rendered-length column that only the rep key needs) stays in
`emit_rep.vl` beside its caller. The arena (`TY`, stage 3) and E's `RepNode` arena (`RP`) are two
instances of it. E's `rtIntern` string key goes in E's stage 1.

**The epoch.**
- After H's stage 2, `tyMutEpoch` is one counter, `holeGen`, which only `holeSolve` advances.
- At H's stage 4 it is gone. Emit runs over sealed ids.
- E §6.3 has stage 2 waiting on the epoch measurement, and §4.2 is it: in the self-compile all
  25,648 bumps happen before emit, and none during emit. So `rtSync`'s drop-on-epoch does not fire
  during emit there today. After H's stage 4, `repOf` is an array indexed by `TyId` and never
  invalidates. `cUserTypesVer` is a name-registry counter, not an arena one; it stays until E's
  `rtSync` stops reading it.

**Who owns what.**
- `hcIntern` and its table are H's to move, at stage 0.
- The rep **modes** built on it, `repIdOf`'s `canon`, `elem`, `mv` and `row` ids
  (`repCanonId`/`repRowId`/`repElemId`), and the string `repCanonKey`/`repKeyOf` family are rep
  keys. They are E's to replace with `RepId`. This note does not count their deletion.
- The type-side projections in §2.5 are H's.

**One cycle discipline.** After stage 3, a cyclic type always passes through a nominal id (§2.3).
Both the type projections and `repOf` cut a cycle at a nominal id they have already met, and
`HC_BACK` stays only for a projection that erases the nominal (§2.5). So a rep cycle follows the
type's own cycle.

## 7. Not claimed

- Whether the rolled and unrolled spellings of one recursive type always get one back-edge id. If
  not, the `render` projection keeps a pair compare (§2.5). Stage 3's shadow decides.
- How many of `assignableGo`'s ambient flags can change a ground pair's answer. That is medium 3's
  measurement.
- Whether normalizing union order at mint is byte-neutral. It is not proposed here.
- The 60 derived comparers in §1.1 are not deleted. They get an id to compare, and medium 2 owns
  them.

## A. Commands

All counts are over `compiler/*.vl` at `58c5e37b`. The two awk programs are in the lane's scratch
directory and quoted here so that any reader can re-run them.

1. **Comparer call sites.** For each `f`:
   `rg -o "\bf\(" compiler/*.vl | wc -l`, minus `rg -o "function f\(" | wc -l`.
2. **Function extents.** `awk -f fns.awk compiler/*.vl` emits one row per top-level function: file,
   line, name, whether it has a depth parameter, whether it reads the arena (`tyAt(` / `T.tys[`), and
   its line count. A function starts at a column-0 `function` and ends at the next column-0 `}`.
   The derived-comparer filter is a name matching `(Eq|Same|Twin|Equal|Alike)` that also reads the
   arena: 60 functions.
3. **Depth caps.** `awk -f caps.awk compiler/*.vl` restricts §A.2 to depth-parameter functions that
   read the arena, with the value their `depth <= 0` guard returns (322). The literal-cap call sites
   use `rg -o "\b(<those names>)\(…, *([0-9]+|[A-Z_]+DEPTH[A-Z_]*)\)"`, which gives 695.
4. **Epoch.**
   - Bumps: `rg -n 'tyMutEpoch = tyMutEpoch \+ 1'` gives 43.
   - Reads: `rg -n '\btyMutEpoch\b'`, less bumps, import lines, comments and the declaration, gives
     40.
   - Causes: each bump's comment and the field written in the three lines above it.
5. **Sidecars.** `rg -o "\b<table>\b" compiler/*.vl | wc -l` per table, which gives 371 in total.
6. **Type-variable spellings.**
   - `rg -n "tvName\[0\] == '\?'|tyAt\(\w+\) is TyVar"` gives 65.
   - `rg -o '"\?" *\+'` gives 7.
   - `rg -n 'paramHoleName\('` gives 23.
7. **Arena shape.** A probe in `check_types.vl` keys each row by variant, its scalars and its
   children's classes, in index order. It reports through `tErr` after `emitProgram`'s diagnostic
   pop, so `vl check --codegen` prints it. It was built to scratch only. The seed was never
   refreshed from it, and the worktree has been removed.
8. **Cost.**
   - `VL_FUEL=1 /usr/bin/time -v vl build compiler/entry.vl -o … --compiler build/vl-compiler.wasm`.
   - `scripts/self-compile-time.sh` for the live set.
   - `vl run scripts/plumb-shape-cost.vl --` for plumb.
   - `VL_PROFILE_GUEST` on a `--names` seed, ranked by `scripts/profile-rank.vl`.
