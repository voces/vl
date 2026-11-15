# Type hash-cons stage 3b: a type's canonical id, shadowed beside the emit comparers (lane H), 2026-11-15

Stage 3b of `2026-11-14-type-hashcons-design.md` §3.2, on top of 3a (#8203). This is the
intern-at-seal canon, run as a shadow first. The emit side switches to it in stage 4.

**What lands.** `compiler/emit_ty_seal.vl` gives every type an `i32` id, interned bottom-up
through its own `intern.vl` table, under three equalities:
- **`tyCanonSet(ty)`** is `tySameSet`'s equality. Alias wrappers are peeled. Union members are
  flattened (a nullable's `null` included), keyed, sorted and deduplicated, and a union that
  dedups to one member is that member. A map is keyed by (`mSet`, key, value), a list by its
  element, and a record by its newtype brand, field names and field ids. Every other kind (a
  primitive, function, literal, negation, type variable or error) takes its `tyEq` id.
- **`tyCanonSpelled(ty)`** is `tySameSpelled`'s equality: union members in order, and a Set as
  its boolean map.
- **The `tyEq` id** (private, `CF_EQ`) mirrors `tyEqGo` structurally, with no render:
  - a newtype brand over its base;
  - a union's members flattened and in order, with a nullable opaque and a one-member union
    standing for its member;
  - a list with its `aRead` view bit;
  - a function as its return then parameters;
  - a literal as kind and text, and a primitive as its name;
  - a declared type parameter by name, and every inference hole as one id, as `tyEq` compares
    them.

  The walk stack carries each row's equality, so a back reference never crosses from one
  equality into another.

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
and 814 generic files). The population is outermost comparisons in those compiles:

| comparer | agree | of them "unequal" | of them on one row | comparer true, ids differ | comparer false, ids match |
|---|---|---|---|---|---|
| `tySameSet` | 1,319 | 622 | 354 | 0 | 0 |
| `tySameSpelled` | 646 | 613 | 25 | 0 | 0 |
| `tyCanonKey` (one key ⇔ one set id) | 7,315 | — | — | 2 | 27 |

That leaves 343 `tySameSet` "equal" answers on two distinct rows, but only 8 for
`tySameSpelled`. The corpus barely exercises `tySameSpelled`'s equal side, so stage 4 adds probes
for it before it switches that comparer.

The first cut keyed the leaf kinds by `tyToStr`. Switching to the structural `tyEq` id moved no
reading.

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

**Measurements**, against 3a's head seed (4fe55ff0; seed size and identity re-read after the merge with master, against 0ab1b2a2):

| reading | value |
|---|---|
| seed | fixpoint (two refreshes byte-identical; the gate's native fixpoint leaves it unchanged) |
| corpus identity, shadow off | 1,833 of 1,833 files, same module and diagnostics |
| seed size | 6,369,690 → 6,379,037 bytes (+0.15%), merged |
| net compiler lines | +474: `emit_ty_seal.vl` +434 (the three equalities about 280, the shadow's tallies about 110, imports about 40); `emit_ty_canon.vl` +38 (three outermost wrappers and their import); `emit_sections.vl` +2 |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |

**L2 fuel**, crossed seed by tree, after the merge with master:

| seed | 3a tree (0ab1b2a2) | 3b tree |
|---|---|---|
| 3a seed | 87,058,870,687 | 87,366,789,713 |
| 3b seed | 87,058,933,408 | 87,366,852,434 |

The seed's own change costs 63k fuel, so the shadow-off wrappers are free. The whole +307.9M
(+0.35%) is the compiler compiling 474 more lines. 3a's merged head was already at +0.74% on the
86.42G baseline, so this PR writes the baseline at 87.37G with a ledger line. The stage 4
deletions take it back.

**Ratchets.**
- **Phase-state census.** The new module's `surface` is 22: `Ty` and the eleven kinds its
  matches name, `T`, `tyToStr`, `nomNameOfTy`, the three name readers, `tyReachesSelf`, the two
  generation counters and `flattenVariantsInto`. `hidden` is 0: the cycle bookkeeping is a
  column beside the walk (`canonOpenAt`), not a saved and restored global.
- **Render-parse.** One `ty-render-display`, `canonShowTy`, which spells a disagreement for the
  shadow's report. It goes with the shadow in stage 4. No id is built from a render.
- **Emitter-state audit.** `canonStrIds` is a text intern (CINSTANCE): an id is a pure function
  of its text. `canonOpenAt` is pushed and popped in one function (SCOPED). The id table persists
  across compiles on purpose, since an id names content, and the per-row memo is stamped.

**Next (stage 4, emit side).** Switch the emit memos and instance keys to the ids, and lane E's
`repOf` with them. Then delete `tySameSet`, `tySameSpelled` and `tyCanonKey`'s walks (pair
stacks, budgets, depth caps, pair memos) and the emit-side `tyMutEpoch` reads.
