# IR: a returned record literal at its result's row (2026-11-24, lane IR-D1)

`return coercion`, the `d15214` family. Seven distilled cells missed as `return coercion`.

## Population, by origin grid

- `named/d15214_plain_inner.vl`: this mechanism, now matched.
- `named/d15293_bound_returned.vl`: a `const`-bound list of records holding un-annotated
  functions, returned from a generic (list rows differ); its own PRE-REVIEW follows. Its
  non-generic spelling is [D17384](../inventory/D17384.md), a loud emit reject.
- `cells/b000017`, `b000057`, `b000058`, `b000418`, `b000498`: blocked first on
  `object variant field box` / `object variant field i64` (lane N5). Their return is a BOUND
  literal (`const cc = { r: null }; return cc`); N5's fix types the binding at the variant row
  legacy stores it at, so on N5's seed the first four match with no `return coercion` left, and
  `b000498` stops at `array element coercion`. Re-graded once N5's branch lands.

## Mechanism

Legacy's plain return (`emitReturnPlainValue`) writes a struct literal at its layout row
(`objLitLayoutRowOf`); where that row is the function's result row (`fRetStructIdx`, an inferred
twin result having no `structIndexOfTy`), the literal is the result's value, one wasm struct type.
The builder built it at the row's recorded type, another rep, and no retag rule covered a twin
that differs only in a record field's nullability. `retDelivered` now builds such a literal at the
result's rep and type at that row. A struct literal among its fields at another rep of its own row
(`retLitFieldsAtTheirReps`) would take a retag the verifier refuses, so the return misses as
`return coercion nested twin` ([D17385](../inventory/D17385.md)).

## Readings

Fixpoint seeds both sides; each census arm in a tree at its own commit (base master `864119c9`).

- Census: 0 claimed functions lost in self, cases, distilled, probes or witnesses. `return
  coercion` misses: distilled 2 → 1 (`d15214_plain_inner` claimed; `d15293` left), cases 4 → 5 and
  witnesses 2 → 3 (the committed nested-twin cell and D17385's witness, both the named miss).
- The matrix (`tests/cases/functions/return-literal-twin-*.vl`, 13 files): `record` and `generic`
  move from `return coercion` to matched; `nested` is the named miss; `map`, `closure`, `list`,
  `in-list` and every `: K`-annotated control are unchanged. Claimless-identical, `identical 13`;
  `cmp` and `wasm-dis` identical, claimed against legacy, on `record`, `generic` and `nested`.
- A returned literal at another row than the result's takes the existing path, unchanged
  (`maps/wider-record-fn-result-set-with-own-record-declared.vl` and its sibling stay matched).
- Identity: names `identical 9433, differ 0`, self-compile identical; cases `identical 8128,
  differ 0`; claimless `identical 14502, differ 0` (claimless compiler sha256 `2e06ea2d…921a`,
  built in `fe4da73d`, `compiler/` clean); legacy A/B `8195 same`, empty.
- The compiler diff is `ir_build.vl` alone; no legacy file moves.
- Fuel: per PR −0.00%; the pair is L2 128574676074 against base 128598744269.

## Legacy tails the IR calls

None new.
