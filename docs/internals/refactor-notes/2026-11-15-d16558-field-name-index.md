# D16558: a record type's field lookup reads a first-position name index (lane H), 2026-11-15

**The cost.** A field was found by name with a linear scan of a `TyObj`'s names, and about six
passes ask once per field. Each pass was therefore F² string compares per record literal. At
F = 800 (`--names` seed, 203 samples), `__str_eq__` was 67% self. `scripts/perf/profile-callers.vl`
charged it as follows:
- 27.6%: `objFieldType`;
- 14.8%: six type-side private scans;
- 22.2%: scans over an `ObjLit`'s fields or the emitter's struct layout;
- 1.5%: the parser's `recFieldSeen`.

**The change.** `objFieldIndexOf(o, name)` in `check_types.vl` is the one by-name reader over a
`TyObj`:
- **Two paths.** A row of up to eight fields scans, as before. A wider row reads `objFieldIx`, a
  name → first position map carried on the value and built on the first ask.
- **Growth.** `objFieldIxLen` stamps how far the map was built, so a row whose names grew in place
  is extended from there on the next ask.
- **First match.** A name is inserted only when absent, so a refused duplicate answers the first
  field of that name.
- **Callers.** `objFieldType` answers through it, so all 112 call sites move with no caller
  change. The six private scans call it too: `recObjLitBuild`, `bareBraceDeliverFields`,
  `recordRepTyAdopt`, `listFieldWidenDst`, `recordElemRepArrayLit` and `recFieldTyOf` (now
  `tyFieldTyOf`).
- **Distinct names.** `objRowNamesDistinct` becomes "every name's first position is its own", and
  its per-row memo and reset go.

Before, the six scans took the first, the last or every match on a repeated name. They agree on a
row whose names are distinct, and a row repeats a name only when a duplicate field was refused.

**Stale-index audit** (every write to a `TyObj` names or types array after `mkObjTy`):
- **Appends only.** A names array is only ever appended to: the hole shape gains a field
  (`check_type_shape.vl`), and an alias application's placeholder is filled
  (`check_relate_core.vl`, `fnames.push`). No row's names are popped, spliced, sorted,
  index-assigned or reassigned.
- **Shared arrays.** 19 sites mint a row over another row's names array. An append through either
  row is seen by the other, because each compares its own stamp with the shared length.
- **Helpers.** No helper a names array is passed to writes its parameter: `strListIndexOf`,
  `rrNamesKey`, `holeFieldKey`, `strListSameMembers`, `strListHas`, `recSameNames`,
  `objLitNamesAre`, `noteNullReadCstr`, `objLitFieldExpr`, `objFieldVal`.
- **Types arrays.** There are two writes, `rec.objFieldTypes[i] = tied` and the hole shape's push.
  Neither moves a position.

**Phase-state census.** `--check` ok at master's baseline. The census counts a module's top-level
`let` and `const` declarations (`declOn`). The map is a field of a type-arena value, like
`objFieldTypes`, so it is not module state. The removed `objDistinctLen` and `objDistinctAns` were
module state.

## Measurements

The base is master `5ea626748` built to its own fixpoint; the branch seed is at fixpoint.

| reading | value |
|---|---|
| identity, threshold 8 | 19,867 of 19,867 files byte-identical: all of `tests/cases` outside `modules/`, `distilled/cells`, `distilled/named`, `compiler/entry.vl` and this PR's two fixtures |
| identity, threshold 0 (every row on the map path) | 19,867 of 19,867 byte-identical (scratch seed, never committed) |
| files that mint a row of more than eight fields | 5 of 19,867: `compiler/entry.vl`, two corpus cases (`structs/`, `eval-order/`) and the two fixtures. This is why the threshold-0 run is the map path's proof |
| guest fuel, F = 25 / 50 / 100 / 200 / 400 / 800 / 1600 | 5.12M / 10.9M / 31.1M / 86.9M / 334M / 1,367M / 4,407M → 4.49M / 7.89M / 17.3M / 43.9M / 137M / 484M / 1,657M (−62% at 1600) |
| CPU, interleaved median of 10 | F = 400: 0.055 → 0.040 s; F = 1600: 0.615 → 0.220 s; `scripts/phase-state-census.vl`: 0.2745 → 0.2625 s (noise) |
| fuel, small programs | `phase-state-census.vl` 802.49M → 802.51M; `emitter-state-audit.vl` 1,020.99M → 1,020.99M; `objects/declared-nested-struct-field-equality.vl` 4.019M → 4.002M |
| net compiler lines | −27 |
| pin helpers (`emit_mono.vl`) | untouched |
| phase-state census | ok, baseline unchanged |

**What remains quadratic.** The curve still rises about 3.4× per doubling at the top. That is the
`ObjLit` and struct-layout scans (`objFieldVal`, `objFieldSrcOrder`, `objLitDropsField`,
`objLitEarlierKey`, `objLitFieldExpr`) and the parser's `recFieldSeen`, which the follow-up takes
with the same primitive over the literal node.
