# P4: the generic-alias gates read the node and the type, 2026-11-13

Lane A, P4 of the render-parse census (#7748): generic-application spelling. This cut takes
the two `emit_collect` render sites and the six `emit_collect` declaration-name source sites.
P4's other three render sites (`gaeEnsure`, `nameIsGenAppDecl`, `gaeParamShadowed`) are the
next cut. Emit only.

**The change.**
- `collectAnnShapes` and `collectNestedFieldShapes` asked `nameMentionsGenAliasParam(spelling)`:
  does the annotation's text mention a generic-alias parameter name as a whole token. They now
  ask `annMentionsGaParam(node)`: does the annotation's declared type (`declAnnTyOf`) or its
  recorded type (`nodeTyIxOf`) mention a type variable with that name.
  `nameMentionsGenAliasParam` has no other caller and is deleted.
- `gaeCollectDecls`, `typeDeclMintsRow` and `collectNestedFieldShapes`'s `ownsRow` split
  `s.tdName` (`annGenAppSpanEnds`, `gaeLtAt`, `gaeHeadNameOf`, `gaeArgsTextOf`). They now read
  the parser's record of the declaration's own parameters (`declGpBaseOf`, `declGpParamsOf`).
  `gaeParams`, the raw parameter text, was written and never read, and is deleted.

**Probe** (old answer vs new answer, `emitFail` on a disagreement, master, the full sweep
population of 24,207 programs).

| site | disagreeing programs |
|---|---|
| `gaeCollectDecls`: generic or not, base name, parameter count and names | 0 |
| `typeDeclMintsRow`, `ownsRow` | 0 |
| the parameter gate, declared type only | 98 |
| the parameter gate, declared or recorded type | 13 |
| the parameter gate, compared on the root it interns (same index or `tySame`) | 13 |

The 13 remaining are two kinds:
- A **phantom parameter** (`type Rows<T> = { base: i32, count: i32 }`, 9 programs): no type
  can carry `T`, so only the spelling mentions it. The old gate then read `declAnnTyOf` of a
  node that has none and interned nothing (root -1). The new gate interns the recorded type.
- A **parameter named for a builtin** (`type Box<i32> = …`, 4 programs): the old gate matched
  the token `i32` and read the declared type; the new gate reads the recorded one.

**Sweep** (fixpoint seeds both sides, 24,207 programs): 24,206 same, 1 bytes-only mover
(`tests/cases/generics/type-param-shadows-alias-through-constructors.vl`, a builtin-named
parameter), 0 output movers, 0 runs → not-runs, 0 new compiler traps.

**Ratchet.** render-parse 69 → 65 `ty-string-parse` and 25 → 19 `ty-source-parse`. The four
render falls are this cut's two plus two that #7747 removed without lowering the baseline.
`nameMentionsGenAliasParam` leaves `EXTRA_PARSERS`, and the eight origins rows for the removed
sites leave `render-parse-origins.txt`. `docs/internals/render-parse-sites.md` still lists the
eight sites, so the orchestrator's next regrade drops them.
