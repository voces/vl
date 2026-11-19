# IR door: the context-clean guard (2026-11-19, lane IR4)

ir-design §10.2: before `irLowerNodeIn` has a caller that ships bytes, the door must miss
`legacy context live` unless legacy's lowering context is at rest. This step adds that guard. It
deletes nothing and moves nothing. It is a precondition for the first shipping slice, and it adds
40 compiler lines and removes 3.

## The list

`legacyContextLiveWhy(): string` (`wasmEmit.vl`, beside `globalCtxNow`) is the one function the
door calls. It answers `""` at rest, and otherwise names the first live entry:

| entry | live when | §10.2 item |
|---|---|---|
| `coerceHeld`, `armSeat`, `boxSeat`, `atomSeat`, `armServed` | ≥ 0 | the coercion seats (`numSeat` no longer exists) |
| `storageReadOpen()` (new, `emit_elab.vl`) | `storageReadIx` ≥ 0 | storage-read mode |
| `knownArmDecl` | non-empty | the narrowing frames around a guarded arm |
| `isRecvStagedIx` | ≥ 0 | the staged `is` receiver, the same frame's other half |
| `listGetIdxStagedIx`, `listGetRecvStagedIx`, `listFitStoodIn` | ≥ 0 | the lazy list frame's operand staging |
| `lbEnd[r]` | some region ≥ 0 | the lazy list frame's open build regions (a count held in a local, not in the header) |
| `listCastForPush` | true | the push receiver cast (IR-REV, on #9159) |
| `lhOpen` | non-empty | the loop-hoist frames |

The union-sink pair is not on the list, and §10.2 now says so. Its two locals are per-function
frame slots, and a fragment carries no `return`, so it never writes them. Its peephole cursor
(`uBoxNewEnd`) is a fact about bytes, not a plan input. A fragment's bytes either move the write
head past a stale cursor, which costs the peephole but is still correct, or end in the fragment's
own box construction, which really is last. A first draft guarded the cursor and fired at 24
shadow sites. The shadow reads after legacy has written the node, so those 24 are not evidence of
a hazard either way. The check was dropped with the doc's item.

The box-dst shadow depth (`bdsDepth`) is instrument state. It acts only while that shadow is
armed.

`irLowerNodeIn` runs the guard first when `probe` is false and misses
`legacy context live: <entry>`. The probe at `emitArr` (`irNodeInShadow`) remains exempt, as
§10.2 says. Under the armed shadow it now also counts `node-in context live: <entry>` for every
site it finds live, so the gap a shipping caller will face is measured where it lands.

## Failing control

A throwaway seed, built in the scratchpad and never refreshed into `build/`, has the armed probe
call the door non-probe wherever the guard is live. Over all of `cells/` and `named/` (12,304
cells, 14,743 list-literal sites):

```
7041	node-in array: matched
38	node-in context live: coerceHeld
38	node-in control: legacy context live: coerceHeld
1	node-in context live: list build region
1	node-in control: legacy context live: list build region
```

The `coerceHeld` rows are §10.2's own example: a list literal inside a held coercion, such as
`named/d1629_literal_fill_annotated.vl`, misses at the door. At every other site the guard stays
quiet. So 39 of the 14,743 sites are the gap a shipping list-literal caller would face.

## Measured

BARS
