# IR door guard: each context by its rule (2026-11-19, lane IR4)

This is ir-design §10.2.1, step 1. The §10.2 guard (#9167) made the door miss whenever any legacy
context was live, so no legacy arm behind a door could ever become unreachable. This step replaces
that rule with one rule per context, as §10.2.1 sets out.

## The rule

`legacyContextLiveWhy(root)` (`wasmEmit.vl`) takes the fragment's root:

| context | misses when |
|---|---|
| `coerceHeld` | the mark is the root (`coerceHeld on the root`); on an ancestor it is never read |
| storage read | the root is the operand being read at its storage (`isStorageRead(root)`) |
| `isRecvStagedIx`, `listGetIdxStagedIx`, `listGetRecvStagedIx` | the staged node lies in the root's subtree (`nodeContains`) |
| open list-build region | a counted push (`lbPush`) of an open region lies in the root's subtree |
| `listCastForPush` | live; it is kept for step 2 |
| an identifier root | always, until the door writes `listFitStoodIn` as its output |
| `boxSeat`, `armSeat`, `atomSeat`, `armServed` | never; they are spent or inert below `coerceKindAt` |
| `knownArmDecl`, `lhOpen`, `listFitStoodIn` as an input | never at an expression door |

`storageReadOpen` was only read by the old guard, and is deleted.

## Measured

The armed shadow's `node-in context live` rows at the one door, `emitArr`. The populations are
the 12,305 cells in `distilled/cells` and `distilled/named`, the 7,298 non-`@error` programs under
`tests/cases`, and the self-compile.

| | before (#9167's guard) | this step |
|---|---:|---:|
| `coerceHeld` | 38 corpus | 0 |
| open list-build region | 1 corpus | 0 |
| `push receiver cast` | 3 | 3 (2 `tests/cases`, 1 self-compile) |

That is the 115 of 118 that §10.2.1 predicts.

## Controls (`tests/vl_ir_door_guard_test.ts`)

- **Dropped contexts.** Each of these is matched byte for byte, with no live row:
  - a held coercion on an ancestor (`named/d1629_literal_fill_annotated`);
  - an open list-build region around a literal;
  - a literal in a loop over a string that reads `s.length`.

  Against the previous seed the test fails on the first: `coerceHeld` was live.
- **Kept contexts** still miss by name:
  - a staged `.get` receiver that is the literal itself (`[f(), 2, 5].get(i)`);
  - `[[]][0].push(2.5)` (`push receiver cast`).
- **Held root.** No list literal is ever held on its own root, because `recordListCopy` records a
  literal's copy on its elements. So this control is synthetic: `irShadowCorrupt(6)` has the probe
  read the guard with the mark forced onto the root, which must miss with
  `coerceHeld on the root`, and onto the enclosing function, an ancestor, which must stay clean.
- **`lhOpen` cannot be live at this door.** `hoistSafeExpr` declines a loop whose body holds a list
  literal, so §10.2.1's hoisted-loop control has no program at an expression door rooted at a
  literal. The loop test pins that the literal in such a loop still matches.

## Shipping the door at `emitArr` (option A): not shipped

Routing every list literal through the door with legacy as the fallback is byte-identical on
matched fixpoints at 2845744c0 (`--names` differ 0, self-compile identical). But it costs
**+0.53%** L2 fuel (101,159,025,556 against 100,621,372,401). The cost is the eager fragment
build: an IR fragment is built and verified at every literal, including the roughly 2,400 that
then miss (`fragment outside a body` alone). A shipping door should decide its misses before it
builds. The branch `ir4-door-ship` keeps the attempt.

## Measured bars

BARS
