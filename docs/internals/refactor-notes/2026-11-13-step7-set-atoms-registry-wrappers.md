# The registry's `unionSetAtomsOf` wrappers: callers read member sets, unreached splits are floors, 2026-11-13

Lane A, for lane G's `unionSetAtomsOf` retirement: the five emit_union_registry call sites
(G confirmed them free). Emit only. `memReadBoxedAtomKinds` (emit_value_sites) is lane B's #7695.

**Census** (probe compiler, the full sweep population). Which `unionSetAtomsOf` site split a
spelling, and through which caller:

| site | reached | via |
|---|---|---|
| `unionMemberAtomsOf`'s no-row branch | 23 / 11 programs | only wasmEmit's atom-into-`K \| null` string-arm test (spelling `"a"`) |
| `unionSetAtomsOfTy`'s no-type branch | 45 / 16 | `njKindsOfUnionName`, `wideRetagPairs`' fallback, the staged union `==`, `unionArmTys` |
| `unionSetNonNullCountTy`'s uncovered branch | 6 / 3 | the `??` join's non-null count |
| `unionSetAtomsOfTy`'s final split | 0 | — |
| `unionArmsOfSetTy`'s alias branch | 0 | — |

The typed answer against each reached caller's old one (probe, same population):
- **Non-null count** by `msSetOfTyAny`: 6 / 6 agree.
- **String-arm test** by banked kinds: 78 / 78 agree.
- **Staged `==`'s right-operand kinds** by `msSetOfTyAny(unionEqOperandTy)`: 19 / 19 agree.
- **`njKindsOfUnion`**: the row answered all 49 calls.
- **`wideRetagPairs`' spelling fallback**: reached 9 times, never yielding a variant row (row-less
  value unions have no record arm), so never a retag pair.

**The change.**
- `unionSetNonNullCountTy` takes only the type and counts over `msSetOfTyAny`.
- The atom-into-`K | null` string-arm test reads the union type's banked kinds.
- `wideRetagPairs` returns no pairs where the expression's arms do not resolve by type.
- The staged union `==` reads the right operand's kinds from its member set.
- `emitNumUnionRebox` takes the destination's type and reads its kinds. `njKindsOfUnion`'s
  spelling fallback becomes a floor, and `njKindsOfUnionName` is deleted.
- `unionMemberAtomsOf`'s no-row branch, `unionSetAtomsOfTy`'s final split and `unionArmsOfSetTy`'s
  alias branch are loud floors.

**Left.** With lane B's #7695 merged (`memReadBoxedAtomKinds` by type), `unionSetAtomsOf` keeps
one caller: `unionSetAtomsOfTy`'s no-type branch. It is still reached through `unionArmTys`
(emit_union_atoms, three programs), which has nine callers across lanes F and G and is not in this
cut.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,204 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.
