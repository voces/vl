# `kind-ladder-incomplete` / `kind-ladder-split` — a dispatch that answers about part of a closed set

Rule in `compiler/lint.vl`, tree-wide census in `scripts/ladder-census.py`, ratchet in
`scripts/ladder-budget.py`, agreement pinned by `tests/vl_kind_ladder_test.ts`. The survey that
sized the population is `ladder-audit-2026-09.md`; the arena half's prior sweep is
`per-rep-ladder-audit.md`.

## The bar

**A ladder over a closed kind set is exhaustive over it, or its default NAMES what it
excludes** — an `emitFail`, a sentence, or a delegation to the ladder that owns the rest. A
fall-through to `-1` / `""` / `false` / `0` satisfies nothing: the kinds nobody handled take an
answer meant for a different case, and the program compiles.

Four defects in one week are the population it was built from: no `nulvariant` rung (#2400), no
`IfStmt` arm ([D981](inventory/D981.md)), no unbounded-`TyVar` arm
([D1004](inventory/D1004.md)/[D1221](inventory/D1221.md)), no module-block arm
([D1370](inventory/D1370.md)).

## The `match` half, and why it exists

A `match` over a closed set is exhaustive or it does not compile — **except through `_`**.
`_` covers every member the arms do not name and says nothing about any of them, so it is the
`if` chain's bare `-1` wearing a keyword, and the census's own walk reads no `match` at all.
Left alone, "rewrite the ladder as a `match`" would have been a way to make the ratchet's number
fall without the compiler getting safer.

So a `match` counts as an incomplete ladder, reported **at the `match` keyword**, when all of:

* it has a `_` arm (a `_`-less `match` is the language's own gate — never reported);
* its named arms are at least two, and are all members of one closed set;
* those arms do not already cover the whole set (if they do, the `_` is unreachable);
* and the `_` arm's body fails the same named-default test the `if` form applies — no refusal
  channel, no sentence of twelve characters or more, no call to another function of the module.

An or-pattern (`A | B => …`) contributes each alternative. The `_` arm's region is its own line,
plus the block it opens when the body is braced across lines — the shape `vl fmt` writes for
`_ => {}`.

**The compiler already held this invariant; it just was not enforced.** All 26 `match` sites in
`compiler/*.vl` are `_`-less, and two of them say why in their own headers — *"a new `VKind`
member without an arm must be a compile error, not a silent `0x7f` … no `_` arm, deliberately,
because a wildcard restores exactly the silent default"* (`ladder-audit-2026-09.md` §1.5). The
rule therefore lands at **zero new hits** and is a floor, not a debt discovery.

### Controls

Run on the fixtures the suite itself carries, so a control cannot drift from what is tested:

| program | reported |
| --- | --- |
| `_ => 0` after two literal arms | **fires** — 2 of 31 `VKind` |
| `_ => {}` (fmt's three-line empty block) after two type arms | **fires** — 2 of 11 `Ty` |
| `_ => 0` after an or-pattern arm | **fires** — 2 of 11 `Ty` |
| `_ => emitFail("no lowering for " + k)` | silent |
| `_ => { return emitFail("no rep for this arena variant") }` | silent |
| the same match with the `_` arm deleted (exhaustive by the checker) | silent |
| one named arm and a `_` (below the two-arm floor) | silent |

## The pilot that earned the `match` half

`emit_collect.vl`'s 39 held ladders were rewritten as `match` and the result measured, then
reverted. The numbers, so nobody has to pay for them again:

| | |
| --- | --- |
| mechanical rewrites | **31 of 39** — same arms, same order, bodies verbatim, fall-through as `_` |
| seed cost | **+129 bytes (+0.0059%)**, ~4 bytes per ladder |
| L2 self-compile CPU | **unmoved** — min 3.8 s on both arms over 20 interleaved pairs |
| emitted output | **unchanged** — 2,456 `tests/cases` modules byte-identical, 548 rejected by both with identical diagnostics |
| distilled corpus | no cell changed class |
| source lines | **+247** on the file, most of it the formatter (below) |

`desugarMatchAt` lowers a checked `match` back to the `IfStmt` chain the ladder already was, so
there is no lowering difference to price. **The cost is affordable and the benefit was not
there**: a ladder testing 2 of 37 `Node` kinds cannot be spelled `_`-less, so the mechanical
rewrite always ends in `_`, and the ratchet's number falls for nothing. That is the finding, and
this rule is the fix for it.

Eight ladders were not a `match` at all, in three shapes worth knowing before anyone tries again:

| shape | sites | why |
| --- | --- | --- |
| a `string`-typed scrutinee | `anonLeafAtomWidth`, `anonLeafAtomOfText`, `anonLeafFoldedAtom` ×2 | `match` needs a union; `string` is not one |
| an un-narrowed `VKind \| null` | `forceAnnLeafReps`, `collectMapFilterUse` | refused: `match over a union with literal members is not supported — compare them with ==` (a scrutinee narrowed by `if k == null { return }` types fine) |
| a chain that is not one dispatch | `funcRetUnrepresentable`, `collectMapFilterUse`, `declareForInLocals` | a non-kind rung between two kind rungs (`tyIsLitUnion(members[i])`), two subjects interleaved (`rk` then `rvk`), or `&&`-guarded rungs |

The third row is the one the rule buys something on: those chains are counted as clean two-arm
ladders today and are not dispatches at all, and `match`'s own arm checking — a pattern that is
not a member, and a redundant arm, are both compile errors — is what would have said so.

## The rule a ladder is paid by

**Name the missing arms, or write a `_`-less exhaustive `match`. Never a `_`.**
`emit_rep.vl`'s `repCanonKeyGo` and `repElemKeyGo` are the model: every member gets an arm, the
do-nothing ones are empty arms carrying their reason, and a twelfth arena variant breaks the
self-compile. That is a compile-time gate no lint can give.

It is reachable over the small sets — `Ty` (11), `PrimName` (10), `MfKind`/`PushKind` (7),
`BtKind` (3) — and over `VKind` (31) where the sub-domain deserves its own litunion
(`ladder-audit-2026-09.md` §1.5). It is **not** reachable over `Node` (37) for a walker that
legitimately answers about twelve kinds; leave those as `if` chains with a named default until
someone has a better answer than `_`.

Two formatter costs make a bulk conversion worse than it looks, both filed and neither fixed:
a comment written between two arms migrates into the following arm's body
([D1646](inventory/D1646.md)), and an empty arm body expands to three lines where `if c {}`
stays on one ([D1647](inventory/D1647.md)).

## The first conversion that earned its fall

`emit_collect.vl`'s six `Ty` dispatches, rewritten `_`-less with all eleven members named and
the declining ones as empty arms carrying their reason (`cloResultMaybeMixed`,
`unionArmsMixed`, `collectTyReachRegister`, `collectTyMembersReach`, `funcRetUnrepresentable`'s
outer dispatch, `collectTyReachCloSigs`). The file goes **38 → 32**; the seed grows **+475
bytes (+0.020%)**, ~79 a ladder rather than the pilot's ~4, because the named empty arms are
real `if` rungs after `desugarMatchAt`.

**Both output populations are byte-identical**, which is what says a refactor happened and
nothing else: 2,629 `tests/cases` + `std` modules with 0 DIFFER and 0 LOST, and the compiler's
own 31 modules compiled by both seeds `cmp`-equal at 2,340,967 bytes. `vl fmt` round-trips the
converted file byte-for-byte — no third formatter defect beside D1646/D1647, and both of those
are avoided by construction: every comment lives INSIDE an arm body, never between two arms.

**Seven non-`Node` sites remain in that file and none of them is convertible**, which is the
more useful half of the result — the census's set attribution is not a conversion list:

| site | census says | why not |
| --- | --- | --- |
| `anonLeafAtomWidth`, `anonLeafAtomOfText`, `anonLeafFoldedAtom` ×2 | `MfKind` / `PrimName` | a `string` scrutinee; `match` needs a union |
| `funcRetUnrepresentable`'s member loop | `Ty` 6/11 | `tyIsLitUnion(members[i])` is a PREDICATE rung between two kind rungs |
| `forceAnnLeafReps` | `VKind` 5/31 | a chain of NAME predicates; the inner `nsk == "nulstrlist"` literals are what the census reads |
| `collectMapFilterUse` | `BtKind` 2/3 | TWO subjects interleaved (`rk` then `rvk`), both `VKind \| null`; the `BtKind` attribution is a coincidence of the literals `"f64"`/`"i64"`/`"f32"` |

The remaining 25 are `Node` (38 members), which the rule above already excludes.

## Where the `Ty` set ran out, and what an OR-PATTERN costs

`emit_classify.vl`'s twenty-six `Ty` dispatches followed `emit_collect.vl`'s six: **134 → 108**,
every one `_`-less with all eleven members named. The declining members are named together in
one **or-pattern** arm carrying the shared reason, rather than one empty arm each.

**That changes the price by twenty times.** Tranche 1 wrote a separate empty arm per member and
paid ~79 seed bytes a ladder; tranche 2's or-pattern pays **+101 bytes over twenty-six
conversions, ~3.9 each** — an or-pattern lowers to one rung for the whole group where separate
arms lower to one each. The safety is identical: the checker sees every alternative, so a
twelfth arena variant still breaks the self-compile. Prefer the or-pattern wherever the reason
really is shared, and separate arms only where each member's reason differs.

Byte identity held at every batch: 2,632 `tests/cases` + `std` modules (0 DIFFER, 0 LOST), and
master's own 31 compiler modules `cmp`-equal under both seeds at each of the four checkpoints.

**Of the file's 134 hits, 108 remain and the reason is the set, not the effort:**

| set | left | why not converted |
| --- | --- | --- |
| `Node` (38) | 78 | the rule above excludes a walker answering about a few kinds |
| `VKind` (31) | 17 | the sub-domain-litunion case: 28 empty alternatives for a site answering about three kinds is not honest. `retKindPri` (21/31), `fieldCodeOfVKind` (14/31) and `vkNulNicheOf` (12/31) may qualify on volume and need their own reading |
| `MfKind` / `PrimName` (7 + 10) | 10 | `string` scrutinees — `match` needs a union |
| `RtKind` (15), `EqCmpKind` (17) | 1 each | the same honesty question at a larger set |
| `Ty` (11) | 1 | `mvValLowersTy`'s member loop: `tyIsLitUnion(ims[m2])` is a PREDICATE rung between two kind rungs, so it is not one dispatch |

The `Ty` line is the useful one: **twenty-six of twenty-seven converted, and the twenty-seventh
is excluded by the same rule that excluded `funcRetUnrepresentable`'s loop in tranche 1.** The
census's set column names which closed set a chain's literals belong to, not whether the chain
is a dispatch.

## A LITUNION SET IS MATCHABLE — the refusal is about NULLABLE, not literal

Eleven of the thirteen closed sets are `lit` (`ladder-census.py --sets` says so in its second
column): only `Node` and `Ty` are declared unions of object types. The pilot recorded that two
`VKind` sites were refused with

    match over a union with literal members is not supported — compare them with `==` in an if-chain

and that sentence, read as written, retires every `lit` set from this campaign. **It is false at
the plainest spelling, and the message's own tail says so — it prints `got K | null`.**

Measured, one program per claim:

| spelling | outcome |
| --- | --- |
| a declared alias, `_`-less and exhaustive | **runs** |
| an inline `"a" \| "b" \| "c"` parameter | **runs** |
| a local bound from a call | **runs** |
| an or-pattern arm (`"b" \| "c" \| "d" => …`) | **runs** |
| a `match` whose arm returns the litunion | **runs** |
| arms covering a SUBSET, no `_` | `non-exhaustive match — missing "c" (add the arm or a `_`)` |
| `K \| null`, un-narrowed | refused |
| `K \| null` with an explicit `null` arm | refused identically |
| `K \| null` after `if k == null { return … }` | **runs** |

So the constraint is the NULLABLE litunion, not the literal one, and the checker's exhaustiveness
gate works over a litunion by name. The refusal is filed as [D1898](inventory/D1898.md).

### What the closed set is, and what a sub-domain may leave unnamed

The set is the `export type`'s members, derived exactly as `ladder-budget.py --check` derives it
— **31 for `VKind`, 15 for `RtKind`, 17 for `EqCmpKind`** — never the sub-domain a site happens
to answer about. A chain answering for twelve of `VKind`'s thirty-one is still a chain over
`VKind`.

**The honesty test is the DEFAULT, not the count.** With the or-pattern, the nineteen members a
site does not name cost one arm, so "twenty-eight empty arms" was never the real objection. What
decides it is whether the fall-through value is a real answer:

* **It is** — the site converts, and the or-pattern arm carries that answer with its reason.
  `retKindPri`'s `0` is the cheap-fallback TIER (three of its own arms exist because a kind
  reached the wrong tier: D937, D1562, D1622); `fieldCodeOfVKind`'s `-2` is "outside this
  vocabulary, ask the spelling ladder"; `vkNulNicheOf`'s `null` is "no nullable niche is owed".
  All three converted, `_`-less, 108 → 105.
* **It is not** — a bare `0`/`""`/`false` nobody chose — the site owes a NAMED default first,
  and that is a fix rather than a refactor.

A site whose scrutinee is `VKind | null` cannot convert at all until D1898 closes; that is what
still holds `forceAnnLeafReps` and `collectMapFilterUse` as `if` chains, and it is the reason to
record, not "litunions are not matchable".

## Agreement, and why there are two implementations

`compiler/lint.vl` grades one module from the source the driver hands it; the census grades the
tree for the ratchet. Nothing else ties them together, so a change to either that moves a count
silently un-ratchets the tree. `tests/vl_kind_ladder_test.ts` runs BOTH over ten fixtures and
compares the hit LINES, and `ladder-budget.py --check` re-derives every closed set from the
`export type` that declares it and refuses to run when the lint's copy has drifted.

## Running it

```sh
python3 scripts/ladder-census.py                      # the ladder table, by set and by ending
python3 scripts/ladder-census.py --sets               # every closed set, its members, its home
python3 scripts/ladder-census.py --split              # the split walks
python3 scripts/ladder-census.py --pred               # the form with no kind literal in it
python3 scripts/ladder-budget.py                      # the per-file table
python3 scripts/ladder-budget.py --check              # the gate: a file may only go down
python3 scripts/ladder-budget.py --list <code> [n]    # name the sites
python3 scripts/ladder-budget.py --why                # what LEFT since the baseline's commit
python3 scripts/ladder-budget.py --grade <file>       # one file's hits as JSON, the suite's input
python3 scripts/ladder-budget.py --write-baseline     # after a real fix, in the same PR
```

## Cost

One extra per-function pass, linear in bytes, sharing the line and function index the `if` half
already builds. The seed grew **+0.19%** (2,187,156 → 2,191,334 bytes), under
`scripts/seed-size.vl`'s +3% bar; `scripts/native-fixpoint.sh` holds.
