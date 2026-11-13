# Step 7, lane H: two `declTyIxOfName` callers stop running the annotation grammar, 2026-11-13

`declTyIxOfName` has three rungs: the declared-name table (`cUserTypes`), the
primitive leaf, and `resolveAnnot` — the annotation grammar, which mints arena
types from a spelling. B's triage asked what its emit-side callers hold when
`cUserTypes` misses. A probe answered: a generic application or an interface,
neither of which is a declared record.

## What each caller held

A throwaway compiler tagged every `resolveAnnot` rung reached from a wrapped
caller with that caller's id, whether it resolved, and the shape of the
spelling, over 24,217 programs.

| caller                                                | programs reaching the rung | what it held                                                                                                                       |
| ----------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `declIsVariantArm` (emit_collect)                     | 309 + 14                   | 309 unresolved generic applications (`Box<T>`, `Pair<A,B>`); 14 resolved, all interfaces or applications (`Showable`, `NulId<Id>`) |
| `registerValueUnionNameAB`'s name route               | 288                        | `i32\|null` and its three siblings, rebuilt from a spelling the caller's type already spells                                       |
| `collectDeclaredUnion` / `declArmsMatchRow` (3, 4, 5) | 681                        | union member spellings; left alone, see below                                                                                      |

## The two changes

- **`declIsVariantArm` reads `cUserTypes` directly.** The question is whether a
  record declaration is stored at a variant row, and a row holds a declared
  record's checked type. A generic declaration has no one checked type and an
  interface is no record, so neither can be at a row — the rung could only mint
  a type that answers `exactArmRowOfTy` with -1 anyway. The caller's rung goes
  to 0 programs.
- **A function-set nullable's box row is keyed by its scalar's nullable.**
  `nulNumScalarUnionRowTy` answered -1 for a non-primitive inner, so
  `registerNulScalarBox` fell to the name route and re-parsed `i32|null`. The
  name is built from `valueRowKind` — so the row's type is `mkNullableTy` of
  that kind's scalar, which the function now answers. Sites 57 and 59 stop
  parsing (288 programs → 0), and the mint's name route halves, 600 programs
  → 312.

Dropping `site == 55 &&` from `registerValueUnionNameAB`'s flat-type condition
rides along: the probe counts no site it moves (site 55 is the only one that
passes a flat type), so it is a uniformity change, not a behaviour one.

## What is left, and why

The 312 remaining name-route mints are site 55's, whose type
`valueUnionTyIsFlat` rejects — a literal member the spelling softens to its
base, or a nested union alias it flattens. The `collectDeclaredUnion` callers
are a declared union's member spellings, which the CHECKER resolves through the
parser's spelling tree (`udTsRootAt`, `annotResolve`) and the emitter
re-resolves from text; closing those means banking the checker's resolution, not
swapping a reader, so it is left for its own change.

## Measurement

- **Sweep** (`sweep.vl diff`, fixpoint seeds, master against this): 24,218
  programs, 0 runs lost, 0 output movers, 2 bytes-only movers —
  `tests/cases/generics/type-param-shadows-transparent-alias.vl` and
  `type-param-shadows-alias-through-constructors.vl`, both of which hold an
  alias `declIsVariantArm` used to resolve. Only the type section's numbering
  moves.
- **Census:** the render-parse census does not move; `declTyIxOfName` is not a
  graded site.
- Comment-only follow-up to the seam's header: byte-identical seed.
