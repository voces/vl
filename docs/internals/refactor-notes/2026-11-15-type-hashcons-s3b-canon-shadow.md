# Type hash-cons stage 3b: a type's canonical id, shadowed beside the emit comparers (lane H), 2026-11-15

Stage 3b of `2026-11-14-type-hashcons-design.md` §3.2, on top of 3a (#8203). This is the
intern-at-seal canon, run as a shadow first. The emit side switches to it in stage 4.

**What lands.** `compiler/emit_ty_seal.vl` gives every type an `i32` id, interned bottom-up
through its own `intern.vl` table, under two equalities:
- **`tyCanonSet(ty)`** is `tySameSet`'s equality. Alias wrappers are peeled. Union members are
  flattened (a nullable's `null` included), keyed, sorted and deduplicated, and a union that
  dedups to one member is that member. A map is keyed by (`mSet`, key, value), a list by its
  element, and a record by its newtype brand, field names and field ids. Every other kind (a
  primitive, function, literal, negation, type variable or error) is keyed by its render, as
  `tyEq` compares it.
- **`tyCanonSpelled(ty)`** is `tySameSpelled`'s equality: union members in order, and a Set as
  its boolean map.

An id names content, not a row, so the table persists across epochs and compiles. The per-row
memo is stamped with (`tyMutEpoch`, `tyVarRenames`) and drops when either moves. A hole union
needs no stamp, because linking two open holes leaves both views at `TY_OPEN`.

**Cycles: a nominal cut.** A row that has a declared name (a struct, a generic application or a
union alias, which are the readers a render names it by) and reaches itself (`tyReachesSelf`) is
keyed by that name. Every recursive type in the corpus re-enters such a row. Outside a cycle, a
named row stays structural, because `tySameSet` compares a named record with its anonymous twin
as equal. A cycle that passes through no named row is keyed by its distance back
(`CK_BACK`), and a row under a back reference to an outer row is not memoised.

The first cut keyed every cycle by distance alone. It split
`tests/cases/unions/narrowed-place-arm-delivery.vl`'s `type M = f64 | {[string]: M}` four times:
the alias's own `{[string]: M}` row and a second `{[string]: M}` row come out one unrolling apart.
Distance back-references are not canonical for a regular tree. The nominal cut removed all four.

**The shadow.** Under `$VL_ID_SHADOW` (the identity shadow's host channel, so no host change),
each outermost call compares its answer with the ids:
- `tySameSet` and `tySameSpelled` compare against `==` on `tyCanonSet` or `tyCanonSpelled`.
- `tyCanonKey` checks that one key is one set id, and one set id is one key.

`emitProgram` writes `canon <comparer> agree N true-ne N false-eq N` rows, plus up to 24 spelled
examples per compile. Recursive calls inside a walk skip the check.

**Shadow readings, 1,833 corpus files** (`all2a`: the 596-cell sample, 465 empty-collection files
and 814 generic files):

| comparer | agree | comparer true, ids differ | comparer false, ids match |
|---|---|---|---|
| `tySameSet` | 1,319 | 0 | 0 |
| `tySameSpelled` | 646 | 0 | 0 |
| `tyCanonKey` (one key ⇔ one set id) | 7,315 | 2 | 27 |

The 29 `tyCanonKey` rows come from 13 files and fall into two classes. In both, the canon agrees
with `tySameSet`, and `tyCanonKey` is the outlier:
- **27: a record keyed by its render.** `tyCanonKey` keys a record by `tyToStr`, which names a
  declared struct. So `Rec` and `{x: i32}`, `[Rec2]` and `[Rec]`, or `A` and `B` get two keys,
  while `tySameSet` and the canon call them one type.
- **2: a Set inside a generic application's render.** `Box<Set<string>>` and
  `Box<{[string]: boolean}>` render alike, so they get one key, while `tySameSet` ("a Set is never
  its boolean map") and the canon keep them two.

Stage 4 decides per `tyCanonKey` caller which equality it needs, and switches it to the matching
id.

**Measurements**, against 3a's head seed (4fe55ff0):

| reading | value |
|---|---|
| seed | fixpoint (two refreshes byte-identical) |
| corpus identity, shadow off | 1,833 of 1,833 files, same module and diagnostics |
| seed size | 6,883,890 → 6,891,201 bytes (+0.11%) |
| net compiler lines | +351 (`emit_ty_seal.vl` +317, the new module with its shadow tallies; `emit_ty_canon.vl` +32, three outermost wrappers; `emit_sections.vl` +2) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |

**Phase-state census.** The new module's `surface` is 21: the eleven `Ty` kinds its match names,
`T`, `tyToStr`, `nomNameOfTy`, the three name readers, `tyReachesSelf`, the two generation
counters and `flattenVariantsInto`. `hidden` is 0: the cycle bookkeeping is a column beside the
walk (`canonOpenAt`), not a saved and restored global.

**Next (stage 4, emit side).** Switch the emit memos and instance keys to the ids, and lane E's
`repOf` with them. Then delete `tySameSet`, `tySameSpelled` and `tyCanonKey`'s walks (pair
stacks, budgets, depth caps, pair memos) and the emit-side `tyMutEpoch` reads.
