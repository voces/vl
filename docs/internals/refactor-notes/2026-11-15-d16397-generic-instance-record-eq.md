# D16397: a generic instance's record `==` compares per field pair, 2026-11-15

Lane B. Fixpoint seeds on both sides: before is master `0a3dabd9b`, after is this branch.

## Why the checker cannot do it

D16394 rewrites a record `==` over fields stored apart in the checker, in place. A generic body
is one node tree that every instance shares. The elaboration re-checks it at each instance
(`monoRecheckBegin`), but quietly and with a rollback, so rewriting a node there would rewrite it
for every instance. The only nodes that belong to one instance are mono's per-instance clone.

## Change

- **`check_operators.vl`: `recEqTypedChain`.** This is the D16394 per-field-pair compare as a
  builder that returns a node. Because nothing checks the nodes it makes, it types each one
  itself (`nodeTySetGrow`):
  - one `==` per field pair at the instance's field types;
  - a pair stored apart is split in turn;
  - a nullable side gets `(l == null && r == null) || (l != null && r != null && …)`;
  - each operand is read once per field, so both must be names.
- **`emit_mono.vl`: an arm inside `monoPinBin`.** This is the existing `BinExpr` rung of
  `monoMakeInstanceBodyRewrite`, not a new function.
  - It takes each operand's type at the instance: the pinned parameter's type, else the
    elaboration's type for the node, else the node's own concrete type.
  - It applies the builder when the instance differs from the template.
- **Census compensation.** The import adds one checker symbol to `emit_mono`. To keep
  `phase-state-census` unchanged, `emit_mono`'s one use of `tyquery.tyStepElem` now calls its
  own byte-identical `monoListElemTy`, and that import is gone.

Net compiler lines: +118 (`check_operators.vl` +96, `emit_mono.vl` +24 / −2). Pin-helper count:
**908**, unchanged (`emit_mono.vl` has as many functions as before). `phase-state-census --check`:
ok.

## Measurement

`record-eq-generic-instance-fields-stored-apart.matrix.vl`, every cell a generic body proving
`==` and `!=`, true and false:

| | graded | runs | SILENT | owed refusals |
| --- | --- | --- | --- | --- |
| before | 64 | 2 | 4 | 2 |
| after | 64 | **64** | 0 | 2 |

- **The built-in delivery positions:** `v = {f: 1}` against a `{f: f64}` through `eqT`/`neT`.
- **The cells:** widths, a literal union beside `string`, nested records, two mixed fields, a
  `{f: T}` parameter against a concrete record, a local copy of a parameter, and a one-row
  instance.
- **Nullable records, both sides and one side:** these were SILENT invalid wasm before. That is
  the clause-1 face; the fixture covers it too.
- **Different field sets:** the owed refusal of D16395.

## Filed

**D16470**, the first id of my newly reserved block: an operand that is a field read (`a.v == b.v`), a
call or an element read still reaches the emit refusal. The arm compares only names. The
`live-sites.json` row moves to D16470's probe.
