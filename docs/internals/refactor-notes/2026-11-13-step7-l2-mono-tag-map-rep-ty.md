# Step 7 L2: the tagged-set stored-type speller answers the type, 2026-11-13

Lane F's mint cut needs the arena type a tagged-set container is stored at (`tagRepTyOf`), so the
ref-list row is found by type and `rlElemStructRow`'s name rung can go.

Since #7692, `monoTagMapRepName` built that type and only spelled it at the end:
`mapStoredTyOf(t)` for a map, or `mkObjTy(names, sts)` for a record of its fields' stored types.
It is now `monoTagMapRepTy`, which answers the type, or -1 wherever a record answered `""`. A map
always answers its stored type, even one the naming rule cannot spell. Each of the 6 callers
spells the type with `monoPinSpellShaped`, which answers `""` for -1 and for an unspellable type,
so every spelling is what it was. The arena calls are made in the same order.

The function walks one level deep, as before:

- **A field that is a tagged function** is stored as `i32`.
- **A tagged list** is stored as its list of ids.
- **A map of a set's ids** is stored as the map's stored type.
- **A nested record holding a set** makes the whole answer -1.
- **Any other field** keeps its own type, as long as the naming rule can spell it.

The pin-helper count stays at 908: the function is renamed, not added.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - 35 tagged-set and map programs under `tests/cases/functions/`, built with a base compiler and
    with this cut's: 32 are byte-identical and 3 refuse with the same message;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`: all gates pass.
- **CI's sweep** should report no movers.
