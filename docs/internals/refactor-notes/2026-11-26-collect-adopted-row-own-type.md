# Family B, mechanism 3: a literal's hole-holding own type denotes its adopted row (2026-11-26, lane COV-START)

D17180: `function get() { return m["b"] }` over an un-annotated map holding `{ f: half }`, with
`half` un-annotated. The literal is stored at the map's value type (its adopted rep), and
`anonMintLiteral` minted only that row. `get`'s result is the literal's own type, which still
holds the hole function, and it had no row. So a global cell or a local of that type, or a result
typed `{ f: <hole fn> } | null`, refused with `ref valtype with no interned shape`.

## The mechanism

Where the literal mints at its adopted row and its own record type has none, the own type now
denotes that row (`structTyIxAlias`, by exact id). This applies only when the own type holds an
inference hole: no declared type can share such a type.
- A first version without that guard lost a run in three distilled cells: `ckb_bound_wider`,
  `d15172_viafield` and `d15172_listviafield`.
- There `{ r: null }`'s own type is the same structural type as a declared `K`, which is stored
  at its own row.

## Measured

- D17180's four refused spellings print the right value: inline, bound, without the `??`, and in
  a function. The control `if r != null { r.f(…) }` runs as before. Legacy and
  `$VL_IR_STRICT=1` agree.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- Fixture `tests/cases/records/hole-fn-record-read-at-adopted-row-positions.vl` refuses on master
  (`8:11`) and prints `2 3 4 5` on head.

## Not this mechanism

D17114 was grouped here as "a literal adopted at another rep", but the alias does not reach it.
`function pick(m) { return m["k"] }` alone refuses, at a `nulstruct` valtype written outside any
function body (a signature). The recorded-result path (`criColsFromRecorded`) is not what
writes it. Its row stays open, with this narrowing recorded.
