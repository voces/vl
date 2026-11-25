# Legacy: a `??` over a call's `K | null` niche joined into a value union stashes the atom once (2026-11-25, lane IR-N11, D17182)

D17182: `g() ?? 2`, with `g(): K | null` and `K = "a" | "b"`, joins into a value union
(`K | i32`). `coalNulRefsArmOf`'s `atomJoinIf` writes that join as `if l != null { l } else { d }`,
reading `l` twice. So it takes a re-readable operand only, a bound local or a field. A call
reached `none`: "`??` over this nullable value is not supported yet".

- **`atomJoinStash` (wasmEmit.vl, `emitCoalesceNulAtomJoin`)**: for a `K | null` operand whose
  result is a box, the operand is evaluated once and tee'd into `widenTmpSlot(4001)`. Its `-1`
  opens the box `if`, and the default is boxed by `emitUnionBoxAtRecord`. A present atom is boxed
  under the union's string arm as its member string, decoded by the tower from the slot
  (`emitAtomToStrChain`). That is the plan the re-readable join's then-arm takes
  (`atomAsStr`). This is `emitCoalesceNulBoolJoin`'s shape for `boolean | null` (D2383).
- `coalNulAtomJoinWhy` refuses a union with no row, no string arm, or no arm for the default,
  with sentences naming each.
- **IR**: the builder's `coalNulRef` already misses an arm it does not build by its name, so this
  one is `coalesce nulRef atomJoinStash`.
- The refusal literal keeps its one site (`none`). D17301 (`??` over an assignment of `null`) and
  D17200 (`??` over a value `if` joining an inferred-null binding with a record) still reach it.

## Measured

Base bf61bf50, both seeds fixpoints, each census arm built in a tree at its own commit.

- Legacy and shipped A/B over 8252 tests/cases and probe programs: the only movers are this PR's
  two pins, refused (exit 1) → run (exit 0); 8177 identical.
- Claimed functions, base → head:
  - Corpus: 46958 functions, 46929 covered/matched, unchanged.
  - tests/cases: covered 88318 → 88320 and matched 88307 → 88309, the pins'.
  - `self ir misses`: 0 → 0.
- Census: no existing function changed class. The new rows are the pins' own functions: `coalesce
  nulRef atomJoinStash` ×2 and `start: coalesce chain unminted`.
- Matrices, `--before`/`--after`, 0 `runs → not-runs`, 0 silent, 0 wrong:
  - `coalesce-call-litunion-niche-boxed.matrix.vl`: 66 of 66 run, 64 cells refused → RUNS. A
    counting call proves one evaluation on null and on present, in chains of two calls too, with
    each member against the default and defaults equal to the members' atom ids.
  - `coalesce-chain-litunion-links-boxed.matrix.vl` (the row's grading list): 98 of 98 run, 88
    refused → RUNS.

## Legacy tails the IR calls

None new.
