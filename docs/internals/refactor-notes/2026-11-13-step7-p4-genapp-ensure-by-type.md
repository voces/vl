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

**What `kn != ""` stands for.** The guard still reads `kn`, the key hint `shapeWalkKeyOf`
renders from, so that render cannot be deleted while the guard needs it. As a fact rather than
a spelling, `kn` is `""` exactly when the type is already on `shapeWalkStack` from an outer
frame (`shapeWalkName`): the walk is a re-entry under the structural key. Otherwise `kn` is
the type's nominal name, which for a registered application is its application name and is
`""` only for a cyclic one (`genAppNameOfTy` declines). The third source, the function-type
walker's union delegate, hands its own non-empty key. So whoever deletes `shapeWalkKeyOf`
replaces the guard with: `ty` is a registered, finite application and is not already on
`shapeWalkStack` below this frame.

**Sweep** (fixpoint seeds both sides, 24,207 programs): 24,207 same, 0 bytes-only movers,
0 output movers, 0 runs → not-runs, 0 new compiler traps.

**Ratchet.** render-parse 61 → 58 `ty-string-parse` (this cut's three) and 52 → 46
`ty-parse-unclassified`: `nameIsGenAppDecl`'s four declaration-name scans, which #7756's origins
regeneration left ungraded, plus two that #7758 removed. The origins rows for the removed sites
are dropped. With #7751, P4's render sites are at zero.
