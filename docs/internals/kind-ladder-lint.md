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
`scripts/seed-size.py`'s +3% bar; `scripts/native-fixpoint.sh` holds.
