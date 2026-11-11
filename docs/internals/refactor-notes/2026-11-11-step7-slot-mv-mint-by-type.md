# Step 7 slot layer: the map-value mint is keyed by type, and its spelling floor deleted, 2026-11-11

This is the step #7134 left (`2026-11-11-step7-slot-mv-kind-of-ty.md`, "What is left"):
`mvSlotOfValNameFindK` was name-keyed because the mint it fell to, `mvNameMint(spelling, keyK,
ty)`, was keyed by a spelling. Base is master `5edb783b` (#7136). Its fixpoint seed is 6,615,486
bytes.

## What changed

- **The mint hook takes the type.** `mvNameMint(nm, keyK, ty)` becomes `mvTyMint(ty, keyK)`,
  armed with `mvShapeOfValTyMint(ty, keyK)`. That entry names the value the way the mint keys a
  declared value (`mvDeclNameOfValTy`), passes `ty` as its own row type, arm hint and kind type,
  and runs under the same nesting guard.
- **`mvSlotOfValNameFindK(spelling, valTy, keyK)` becomes `mvSlotOfValTyFindK(valTy, keyK)`.**
  Its two callers, `sFieldMapShape` and `uFieldMapShape`, stop reading the field's element
  spelling.
- **No spelling floor stays.** A value with no type, or one the arena cannot name, gets no slot
  and fails loudly with the message it already had.
- **Deleted:** `mvNameMint`, `mvNameMintOn`, `mvNameMintNone` and `mvShapeOfValNameRowTy`. The
  hook was the only caller of `mvShapeOfValNameRowTy`.

## Measurement

The probe compiler was built by the base seed into scratch and never refreshed into `build/`. It
minted by type wherever `valTy >= 0` and the arena names it. Every other call kept the name mint
behind an `emitFail` marker. Over the whole population (`scripts/sweep.vl`, 23,882 programs):

- 23,881 same;
- 0 bytes-only movers;
- 1 output mover: the marker, in `D3919` only.

So the type mint is byte-identical wherever it was reached. The one floor reach is D3919: a map
field over an unbound type parameter, inside a record annotated in a generic body. Base refuses
it already with `map value type has no interned slot`, because the name mint fails there as well.
The floor answered nothing in the population, so it is deleted, not kept.

This is not D1748's hole face. A field whose type still reaches a hole answers `-3` in
`sFieldMapShape` before the find is asked, and that rung is unchanged.

## The price, measured

`sweep.vl diff`, master's fixpoint seed against the candidate's (23,882 programs):

- **23,882 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

D3919 still refuses as filed.

## Rulings checked

- **No mint-on-miss in a question reader.** The mint is still reached only from the two
  row-table finds, after `mvSlotOfValTyK` missed. The question readers answer `-3` on a miss.
- **Literal unions never mint.** The mono test runs first and is `mvValKindOfTy`, unchanged.
- **No walk replaced by a walk.** The spelling classifier on the untyped path is deleted, and no
  walk is added.

## Proof

- Refresh ×2 is a fixpoint at 6,615,452 bytes (−34). The comment edits after it gave a
  byte-identical seed (`cmp`).
- `scripts/gate.sh`: all 23 rows pass. That covers deno test, ci-native, lint-self + fmt, seed
  size, late demands, plumb-shape cost, dead-export and render-parse budgets, scaling shape,
  rep-fuzz, filed witnesses, inventory refs, capability probes and the distilled corpus.
- The ladder, comment and sentinel budgets (`vl check --budget`) all exit 0.

## What is left

`vkind-census.vl --slots`: the map-value bank's name producers go from 1 to 0. The spelling
residue (`mvValNamesCompat`'s render side, `mapValKindLowerable`, `mvValKindOfSpelling`) is
unchanged. It stays by design while its callers hold no type.

The mint's body still carries its value as a spelling internally: `mvValName`, the ref-list
interns keyed by that spelling, and `variantIndexOf(valName)`. That spelling is now always
derived from the type (`mvDeclNameOfValTy`), never handed in. The bank's codecs,
`mvScalarValKind` and `mvListValKind`, read the second stored encoding (`mvValKind`'s MVK code).
They go when the bank stores a rep record, which is the next slice.
