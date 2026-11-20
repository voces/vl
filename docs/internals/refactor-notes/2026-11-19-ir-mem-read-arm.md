# IR decision modules 3b-1: the member read's arm (2026-11-19, lane IR6)

§10.1(a) stage 3, the first mirror retirement after the union move (#9151). Legacy's member read
picks an arm in `emitMem`:
- a box receiver narrowed to one variant (`emitNarrowedMem`);
- a bare variant receiver;
- a nullable variant receiver;
- the shared-field dispatch, with the struct read under it.

The IR re-derived that choice in each of its three plain-read predicates (`structFieldPlain`,
`variantFieldPlain`, `narrowedFieldPlain`), and `tagIsArmOf` re-derived its narrowed arm.

## The shared arm

`memReadArmOf(memIx, fnIx): MemReadArm` (`narrowed | variant | nulVariant | shared`), in
`emit_plan_union.vl`, asks `emitMem`'s three receiver tests in `emitMem`'s order:
- **legacy:** `emitMem` is an exhaustive `match` on it, and `emitMemVariantRead`'s two inline
  receiver tests become the `variant` and `nulVariant` arms (`emitMemNulVariantRead` is the
  second);
- **the IR's plain-read predicates:** each asks for its arm, then adds only its own plain-read
  terms (`memberReadPlain`, the field's storage and union-box terms);
- **`tagIsArmOf`:** its `memNarrow` arm asks `memReadArmOf(r) == "narrowed"`.

Each replacement is the same predicate:
- `structFieldPlain`'s `!union && !variant && !nulVariant` is `shared && !union`, since
  `narrowed` implies a union receiver;
- `variantFieldPlain`'s `!narrowed && variant` is `variant`;
- `narrowedFieldPlain`'s `union && narrowedIndex >= 0` is `narrowed`.

`MemReadArm` is registered in `lint.vl`'s closed sets.

The nullable arm adds a bound test on its variant index, which fails loudly. That arm is chosen
only when the index is non-negative, so no byte moves, and the sentinel lint can now see the
guard.

## Lines

| | lines |
|---|---|
| compiler | +72, −62 |
| removed | the four parallel receiver-test copies, and `emitMem`'s inline tests |
| added | the decision and its type, two arm functions in place of one, the lint row |
