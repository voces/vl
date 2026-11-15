# D16558, the literal side: a record literal's and a layout span's by-name reads index (lane H), 2026-11-15

This follows #8460 (`2026-11-15-d16558-field-name-index.md`), which indexed the `TyObj` side.
On #8460's seed at F = 1600 (236 samples), `__str_eq__` was charged to scans with three shapes:
- `objFieldSrcOrder` 17.0%, `objFieldVal` 14.0%, `objLitFieldExpr` 6.8%, `objLitEarlierKey` 5.1%,
  `objLitDropsField` 4.7%, `recFieldSeen` 4.2%.

**One primitive per shape.**
1. **A record literal's field by name.** `objLitFieldAt(o, name)` (`ast.vl`) is the first
   position in `o.objFields` of an initialiser named `name`.
   - **The index.** Past eight fields it reads `objFieldIx`, a name → first position map carried on
     the `ObjLit` value, built on the first ask and extended past `objFieldIxLen`.
   - **The read check.** Each read checks that the slot it names is still that initialiser, and
     scans otherwise. A slot a rewrite overwrote in place (`arenaSetNode`, `arenaReplaceNode`)
     therefore cannot answer stale.
   - **Readers.** `objLitFieldValue` wraps it. `objFieldVal` (emit) and `objLitFieldExpr` (check)
     are one-liners over that, and `objLitEarlierKey` asks whether the first position comes before
     `i`.
2. **A literal's fields matched against a struct layout span** (`names[start .. start + cnt)`):
   `objFieldSrcOrder`, `objFieldSrcPairs` and `objLitDropsField`. Past eight slots, `spanSlots`
   builds a name → first slot map for the one call. Nothing is kept, so there is no module state.
3. **The parser's duplicate-field check.** `recFieldSeen` keeps one map (name to first start) where
   it kept two lists.

**Repeats.** `objFieldSrcOrder` pushed every slot a repeated layout name took; it now takes the
first, as the other two span readers did. A span or a literal repeats a name only after a refused
duplicate.

**What can make an index stale.**
- **Field lists.** An `ObjLit` is minted at two sites, `mkObjLit` and `parse_bank`'s copy. No code
  writes an `objFields` array, an `ObjLit` value's `objFields`, or a `fiName`.
- **Slots.** A slot can still be overwritten in place: 69 `arenaSetNode` sites and 10
  `arenaReplaceNode` sites. None builds a `FieldInit`, and the one generic replace turns a `Paren`
  into an `Ident`. The read check covers the rest.

**Phase-state census.** `--check` ok, baseline unchanged. The index is a field of an AST value. The
span map is a local. `SPAN_SCANNED` is a module `const` that nothing writes.

## Measurements

The base is master `93ad5a25c` built to its own fixpoint; the branch seed is at fixpoint.

| reading | value |
|---|---|
| identity, threshold 8 | 19,928 of 19,928 files byte-identical: all of `tests/cases` outside `modules/`, `distilled/cells`, `distilled/named`, `compiler/entry.vl` and this PR's two fixtures |
| identity, both thresholds 0 (every literal and span on the map path) | 19,928 of 19,928 (scratch seed, never committed) |
| files on the map path at threshold 8 | literal index 5, span map 4 (of 19,928) |
| guest fuel, this PR alone, F = 25 / 50 / 100 / 200 / 400 / 800 / 1600 | 5.13M / 10.9M / 31.1M / 87.0M / 334M / 1,367M / 4,407M → 4.88M / 9.65M / 25.1M / 66.8M / 244M / 974M / 3,095M |
| guest fuel, with #8460 (scratch merge, fixpoint) | 4.25M / 6.61M / 11.4M / 23.7M / 47.4M / 90.7M / **344M**, −92% at 1600 |
| CPU, interleaved median of 10, this PR alone | F = 400: 0.0645 → 0.049 s; F = 1600: 0.586 → 0.411 s; `scripts/phase-state-census.vl` 0.273 → 0.277 s (median of 20, noise) |
| fuel, small programs | `phase-state-census.vl` 801.11M → 801.14M; `emitter-state-audit.vl` 1,019.82M → 1,019.85M; `objects/declared-nested-struct-field-equality.vl` 4.023M → 4.027M |
| net compiler lines | +45 |

**What remains.** With both PRs, `__str_eq__` is 1.6% of samples at F = 1600, and the curve is
linear to F = 800. The last doubling (3.8×) is two insertion sorts over field names:
`fieldNameOrder` (`check_obj_shape.vl`, 23% self) and `ralSigOf` (`check_bind_adopt.vl`, 19%).
