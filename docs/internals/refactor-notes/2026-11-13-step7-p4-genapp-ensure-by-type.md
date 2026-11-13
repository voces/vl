# P4, second cut: `gaeEnsure`, `nameIsGenAppDecl` and `gaeParamShadowed` ask the type, 2026-11-13

Lane A, the last three P4 render sites of the render-parse census (#7748); the first cut is
#7751. Emit only. E and F cleared the functions in their files before the cut.

**The change.**
- `gaeEnsure(name, ty)` becomes `gaeEnsure(ty)`. Its guard `annGenAppSpanEnds(name)` asked
  whether the walk's key was an application spelling (`Box<i32>`). The shape walk now asks
  the same question of the type and the walk: `kn != "" && tyIsGenAppInstance(ty)`, that is a
  fresh walk (keyed by the nominal name) of a registered application. The collect-side caller
  keeps its `genAppNameOfTy(...) != ""` gate and passes only the type.
- `nameIsGenAppDecl(tyToNominalName(ty))` (render, then parse the head and scan the
  declarations) becomes `genAppRowOf(ty) >= 0` at both callers (`shapeFieldsRideTyParam`,
  `fieldIsConcreteGenApp`). The checker records an application only when it applies a
  declared generic alias. `nameIsGenAppDecl` is deleted.
- `gaeParamShadowed` asked `valueAtomKind(name)` of a declared parameter name; it now asks
  `primTyIxOfName(name)`, the checker's own leaf resolution its comment names as the bound.

**Probe** (old answer vs new answer, `emitFail` on a disagreement, master, the full sweep
population of 24,207 programs).

| site | disagreeing programs |
|---|---|
| `gaeParamShadowed` | 0 |
| `shapeFieldsRideTyParam`, `fieldIsConcreteGenApp` | 0 |
| the shape walk's `gaeEnsure` guard as `tyIsGenAppInstance(ty)` alone | 259 sites |
| the shape walk's `gaeEnsure` guard as `kn != "" && tyIsGenAppInstance(ty)` | 0 |
| the collect caller's `genAppNameOfTy != ""` vs `tyIsGenAppInstance` | 6 (cyclic applications) |

The 259 are re-entries of an application's walk under its structural key (`{v:i32}`): the
type is a registered application but the key is not its application name. A guard that fired
there would re-enter the same walk without end, so the walk tests the fresh-walk key, not the
type alone. The 6 are cyclic applications `genAppNameOfTy` declines; the collect caller keeps
that gate, so they are unchanged.

**Sweep** (fixpoint seeds both sides, 24,207 programs): 24,207 same, 0 bytes-only movers,
0 output movers, 0 runs → not-runs, 0 new compiler traps.

**Ratchet.** render-parse 63 → 60 `ty-string-parse` and 19 → 15 `ty-source-parse`; the seven
origins rows for the removed sites are dropped. With #7751, P4's render sites are at zero.
