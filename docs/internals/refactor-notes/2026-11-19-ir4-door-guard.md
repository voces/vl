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
| `lhOpen` | non-empty | the loop-hoist frames |
| `uBoxNewEnd` | `== wLen()` | the union-sink pair: a box construction the sink's peephole could still take |

The union-sink pair's two slots are per-function frame slots and are never "held". A fragment
carries no `return`, so it never writes them. What is ambient is the peephole cursor, so the
guard checks that cursor.

The box-dst shadow depth (`bdsDepth`) is not on the list. It is instrument state and only acts
while that shadow is armed.

`irLowerNodeIn` runs the guard first when `probe` is false and misses
`legacy context live: <entry>`. The probe at `emitArr` (`irNodeInShadow`) remains exempt, as
§10.2 says. Under the armed shadow it now also counts `node-in context live: <entry>` for every
site it finds live, so the gap a shipping caller will face is measured where it lands.

## Failing control

A throwaway seed, built in the scratchpad and never refreshed into `build/`, has the armed
probe call the door non-probe at each site where the guard is live. It was run over the 64
corpus cells where the armed shadow reported a live context:

```
38	node-in control: legacy context live: coerceHeld
38	node-in context live: coerceHeld
24	node-in control: legacy context live: union sink cursor
24	node-in context live: union sink cursor
1	node-in control: legacy context live: list build region
1	node-in context live: list build region
```

The `coerceHeld` rows are §10.2's own example. A list literal inside a held coercion, for
example `named/d1629_literal_fill_annotated.vl`, misses at the door. The guard does not fire at
ordinary sites. A two-loop program with four list literals counts four `matched` and one
`context live` (the literal inside an open `push` region).

The shadow takes its reading after legacy has written the node, so its `union sink cursor` count
can include legacy's own construction. A shipping caller asks before writing, so the count is an
upper bound for one.

## Measured

BARS
