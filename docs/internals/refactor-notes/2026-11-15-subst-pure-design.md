# `substTyDeep` without a mode: design note, 2026-11-15

Review medium 3, stage C (`2026-11-15-relate-c1-quiet-brackets-measured.md` §4). Three fit-question
brackets in my lane stay only because `substTyDeep` behaves differently under `inferQuiet`:
`dstTyParamAdapts`' type-level bracket, `callArgRepTy` and `callRetRepTy`. This note lists
everything the substitution writes, finds the writes that depend on the mode, and says what each
should become: pre-banked, sealed in the arena, or moved to the caller.

Docs only. Lane H confirmed that none of these writers is in its stage 4 (4a–4d are emit-side). The
checker-side seal, H's old 2c-2, is open, and this note claims it.

## 1. What substitution writes

### 1.1 Statically reachable

On the compiler's call graph at master `7c948348`, `substTyDeep` reaches 1,083 functions. 176 of
them write some module state, 266 states in all. The graph has a cycle through the checker, so
every direct callee reaches the same 266. The static number does not discriminate.

### 1.2 Actually executed

This ran in a scratch worktree, never pushed; the patch is kept in the session scratchpad. Each of
the 176 writers noted itself while `substTyDeep` was on the stack. That was measured over 20,415
programs (`tests/fixtures`, `tests/cases`, the distilled `cells/` and `named/`), with the census
from `probe-rollback-census.ts`.

**82 writers ran.** By what they write:

| class | writers that ran | states | what to do |
|---|---:|---|---|
| memo, guard and walk scratch | 35 | `shMemo*`, `stSeenStack`, `asg*`/`bg*` stacks, `asgGuardHits`, `etcMemo`, `tyHasTyVar*`, `hh*`, `tyEq*` stacks, `tyToStr*` scratch, `trhPath`, `vloMemo`, `nestEscapeMemo`, `objDistinct*`, `onwNo`, `lam*Depth`, `holeFnArgDepth`, `luIx*` | nothing: each is idempotent or restored |
| arena interning | 12 | `T` (`addTy`), hole mint (`openChild`), `tyVarOwner`/`tyVarRowsMinted` (`mkTyVarSlot`), the derived-hole rows `hd*` (`hdMint`), the application bank `gaApp*` (`genAppCarry`, `gaBrand`), `cUserTypes`, `nw*`, `luHiddenTyIxs`, `v128Seen` | nothing: the same input gives the same id in either mode |
| type-keyed facts and monotone flags | 14 | `tpJoinUnions`, `tpParamLitJoins`, `apartHoleJoins`, `joinHoleUnions`, `paramNullJoins`, `njNoFieldwise`, `tpRetJoin*`, `pinMapReadTy`; the flags `numUnionMinted`, `tyWideUnionMinted`, `tyMapMinted`, `recordJoinMinted` | the arena's sidecars in all but module: written where a union or map is minted, keyed by the minted id. Mode-independent, and left as they are |
| out-channels read back by the caller | 12 | `njApart`, `njApartRet`, `njFix*`, `njRejoinApart`, `tpApartConcrete`, `collapsedTy`, `unkTy*`, `joinClashMsg`, `bgWiden*` | mode-independent. They are a second return channel, but not this note's subject (§5) |
| products recorded by the walk | 9 | the elaboration pin logs (`elabPinBind*`, `elabHoleRow*`, `elabFnJoin*`, `fnRetRecSrc*`, `fnWidenSrc*`), `holeTpJoin*`, `holeSetEarlyLams`, `sameTypePairs`, `nodeTyIx` (`nodeTySet`, 16 runs in 3 programs), and `applyGenAliasTys`' own (`tpEnv*` and `gaOpen*`, scoped and restored; `cUserTypes`; `tyMutEpoch`) | **§2**, **§3** |

Never executed inside a substitution, on any of the 20,415 programs:
- `holeSolve`, `holeLink`, every `tyPin*`/`tyLink*`, `constrainEmpty`;
- the in-place fills `fillObjDeclFields`, `fillUnionDeclMembers`, `nulFoldTieRecord`.

`applyGenAliasTys` itself ran 465 times in 6 programs, and it bumps `tyMutEpoch` (§3).

## 2. Where the mode enters

15 functions reachable from `substTyDeep` read `inferQuiet`. Five of them (`f32LitTailsAdopt`,
`litTreeAdoptDst`, `tailParensSync`, `numLitRetype`, `stampsStand`) sit behind `binCstrPairRefusal`,
which brackets itself and is literal re-typing, not substitution. One more is inert:
`holeSetCallRetOf` reads it three times, always as `note && !inferQuiet`. Its three callers that
substitution reaches (`holeOpenFnRetAt`, `holeSetPinRetAt`, `holeCallInstOf`) all pass
`note = false`.

What remains is every way the substitution's effect depends on the mode:

| gate | writes | today | proposed |
|---|---|---|---|
| `notePinnedHole` → `elabHolePinNote` (`check_relate_core.vl`, `check_elab_cap.vl`) | the elaboration's pinned-hole rows, per substituted type variable or derived hole (1,115,994 notes in 9,636 programs) | skipped under quiet, so a quiet substitution banks no instance | **into the run.** A pin note is a row of a run family. A fit question forks the run and drops its rows, as lane Q's `CheckRun` (L5 step 3) does for the constraint families. That replaces the gate, and needs Q's step 3 |
| `fillObjDeclFields` ×2, `applyGenAliasTys` ×1 | `nodeTySet(fd.fdType, …)`: a field annotation node's resolved type | skipped under quiet. The application is memoised in `cUserTypes`, so the first context to apply a key decides whether the node is ever typed | **pre-bank at the declaration.** A field annotation belongs to its declaration. Type it once, when the declaration is first resolved, whatever the mode. Measure first: a node that today stays untyped (first application quiet) would gain a type, which can move bytes |
| `annSameTypeNote`, `fillUnionDeclMembers` | the redundant-member lint note (`sameTypePairs`) | skipped under quiet | **pre-bank at the declaration**, for the same reason: it is a lint of the union's spelling, decided once per declaration, not per application |
| `shMemoSync`, `shMemoStampSame` | none: the substitution memo keys on `inferQuiet`, because a hit skips the notes above | per-mode memo | **drop the key** once the three rows above are mode-independent |

## 3. The in-place write: a generic alias applied twice

`applyGenAliasTys` (465 runs, 6 programs) bumps `tyMutEpoch` when it completes a cyclic application.
The fills it can reach (`fillObjDeclFields`, `fillUnionDeclMembers` through `gaFillUnionInstance`,
and `nulFoldTieRecord` through `gaUnionUnwrap`) are 3 of lane H's ten non-pin in-place mutations.
None of them ran under a substitution on the corpus.

Proposed: **seal**. Mint the instance whole at first application, so a later application is a
pure `cUserTypes` lookup and nothing is written in place. Lane H notes that this also removes a
`tyMutEpoch` bump, which is the stamp H's id memo and every emit memo reset on. It is
mode-independent already, so the brackets do not need it.

## 4. Migration

Every step is byte-identical on fixpoint seeds, and the 20,415-program fingerprint must be unchanged.
A step that moves a byte lands its behaviour as an inventory row first.

| step | change | unblocks | net lines (estimate) |
|---|---|---|---:|
| P1 | lint note pre-banked at the union declaration; the alias application stops calling `annSameTypeNoteAt` | — | −5 to +5 |
| P2 | field annotation types pre-banked at declaration resolution; `fillObjDeclFields` and `applyGenAliasTys` stop writing `nodeTyIx`. Measured first with a counter of the nodes that today stay untyped | — | −5 to +10 |
| P3 | pin notes become a run family under `CheckRun`; the `elabHolePinNote` / `notePinnedHole` gates go | — | counted in L5 step 3 |
| P4 | `shMemo` drops its quiet key | — | −4 |
| P5 | the brackets in `callArgRepTy` and `callRetRepTy` delete. `dstTyParamAdapts`' type-level bracket also wraps `assignable` and `objShapeAdapterlessAt`, so it waits for those to be shown mode-independent too | 2 of the 4 C1 brackets; hidden scopes 13 → 11 | −10 |
| P6 | the generic alias instance is minted once (seal) | lane H's canon: a `tyMutEpoch` bump gone | not estimated before H reads it |

Order: P1 and P2 are independent and can go first. P3 waits for lane Q's step 3. P4 and P5 follow P3.
P6 is independent of all of them.

**Net estimate for P1, P2, P4 and P5: −24 to +1 compiler lines.** P3's lines belong to L5. The value
is mode-independence, not size:
- two brackets and a memo key go;
- 1.1M pin notes per corpus run become run rows that a fork can drop;
- a field annotation's type stops depending on which context applied the alias first.

## 5. Not claimed

- The out-channels (`nj*`, `tpApartConcrete`, `unkTy*`, `joinClashMsg`, `collapsedTy`) are a second
  return channel. They are mode-independent, so they do not block the brackets, and turning them into
  return values is a separate change.
- `binCstrPairRefusal`'s bracket is literal re-typing reached through `numBinPairRefusal`, not
  substitution. It stays.
- `dstTyParamAdapts`' type-level bracket needs `assignable` (and `objShapeAdapterlessAt`) shown
  mode-independent on function types. `genericFnAssignable` reaches `binCstrsHold`, so that is its own
  census.
- No fuel figure. P3 can only lower the 1.1M notes (a fork drops them), and P3 measures it.

## A. Commands

```sh
# Static: reachable writers and inferQuiet readers (the Node census in relate-recorder-design.md §B,
# extended with a BFS over the call graph from check_relate_core.vl:substTyDeep).
# Dynamic: the 176 writers instrumented with a note while a substTyDeep is on the stack, then
deno run -A scripts/probe-rollback-census.ts --seed <instrumented seed> \
  tests/fixtures tests/cases scripts/silent-sweep/distilled/cells scripts/silent-sweep/distilled/named
```
