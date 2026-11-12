# Step 7 L2 §7: `monoAnnPinName`'s untyped bare-map leg is deleted; `parenUnionArrElemName` and `monoTagMapRepName` are measured floors, 2026-11-12

These are the last two emit_mono callers on w310's list of emit_base spelling predicates, plus
the record pin of tagged-set ids (`monoTagMapRepName`). w324's layout-row reader was the typed
answer that pin was waiting on.

The base is master `5211c279`, with a fixpoint seed on both sides. The population is the whole
sweep: 24,026 programs.

## Deleted: `nameIsBareMap` in `monoAnnPinName`

The bare-map rung read `(ty >= 0 && tyIsBareMap(ty)) || (ty < 0 && nameIsBareMap(name))`.
w310's probe found the untyped leg reached in 635 programs and true in none. The callers that
pass no type hand a name that is never a map, by contract:

- a nominal struct name;
- a variant row's name (`uVariants`);
- a record row's name with `|null`;
- the literal `i32[]|null`.

The leg is deleted. emit_mono no longer calls `nameIsBareMap`.

## Floor: `parenUnionArrElemName` in `monoPinMintedUnion`

The predicate answers whether a list annotation's element is a boxed value union, spelled as an
inline parenthesised group. A typed form (the element of `ty` is a `TyUnion`) was probed over
5,865 reaches. It differs where the spelling is the cause:

- an alias-named union list (`K[]`, `AB[]`, `Shape[]`) is excluded by the spelling alone, though
  it reps as the same box list;
- the niche elements (`(string|null)[]`, `(boolean|null)[]`, `(K|null)[]`) are excluded by name.

Taking the type routes alias-named union lists through the registered-list path, a behaviour
change for the union registry's keying (w316). It waits on a ruling that an alias-named union
list registers as its inline twin does.

## Floor: `monoTagMapRepName`'s record pin

w324's no-filter layout row (`layoutFirstRowOf`, a split of `annShapeLayoutRowOf`'s bucket walk)
agrees with the field-set scan's row in 46 of 46 reaches. But naming the pin by that row
(`#anon0` in place of `{f: i32}`) builds invalid modules in 5 programs:

- D15640;
- D15651;
- `closures/hole-fn-inline-list-record-stored.vl`;
- `functions/named-function-in-record-beside-hole-record.vl`;
- `functions/named-function-record-beside-hole-handed-two-functions.vl`.

The pin becomes the instance parameter's synthesized TypeRef. Its readers resolve it by name
(`structIndexOfTypeName`, `shapeRowScanK`) and parse its fields (`shapeFieldTypeCompatK`,
`nameIsLitSpelling`), and an `#anon` name names no type to them.

The conversion is those readers taking the row by the TypeRef's type, via `layoutFirstRowOf`.
That goes to w324, after their row-identity cut, with the patch. Nothing is changed here.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: same 24,026, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - the comment-only fix leaves the seed byte-identical;
  - render-parse 13 / 55 (`--findings`);
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-helper and pin-spell shadow tests: 7,495 passed.
