# Step 7 L2: the anonymous-pin discriminator reads the pin's type, 2026-11-13

`monoAnonPinDiscrim` is the last named floor in the typed instance key. The coordinator ruled
(a): convert it to a typed rule and grade the change by sweep.

Where a pin cannot tell two argument types apart, it appends the argument's canonical key. It
used to decide that from the pin's text, with two rungs:

- **twin:** `cUserTypes[pin]` names a declared record that differs from the argument only in
  function fields (D988, D3177);
- **shape:** the pin starts with `#` (an anonymous row) or `{` (an inline record or a map).

It now decides from the pin's own type: `pinOwn`, or the argument's type where there is none.
That is the type `monoPinRespell` spells the pin from. The key is extended when either:

- the type holds a record that no declared name spells, or a map, at its top or as a list,
  nullable or union member;
- the argument differs from the type only in function fields.

## Measured

A probe compared the old and new decision at every call, over 24,070 programs:

| | typed key | spelled key |
| --- | --- | --- |
| both append | 903 decisions, 334 programs | 1,058 |
| old appends, new does not (a merge) | **0** | **0** |
| new appends, old does not (a split) | 7 decisions, 7 programs | 10 |

None of the five classes in which the earlier test disagreed with the text merge:

- lists of records;
- a union whose first spelled member is a map;
- mono's `#anon` spelling on a nominal record (D15447, which the coordinator asked to be checked
  hardest);
- a row-named inline record.

A list of records and a union are now walked. The D15447 class is caught by the
function-field rung.

The splits are:

- `generics/hole-param-literal-then-declared-null-row.vl` and D3205;
- `maps/nullable-single-map-is.vl`;
- `generics/pin-same-rep-maps-union-pattern.vl`;
- `unions/is-twin-arms-lone-literal.vl`;
- the d2781 distilled cell.

The rejected alternative was to append wherever the argument is a record holding a function. It
split 89 decisions.

All 37 programs the change or the earlier disagreements touch were built with a base compiler
and with this cut's. All are byte-identical. The seed is 549 bytes larger.

## Counts

- Named floors in the typed instance key: **0**. The open-binding text in `monoTypedExtra` cites
  §3.4's type-parameter contract (#7708).
- `monoAnonPinDiscrim` no longer takes the pin's spelling.
- pin-helper: 908, unchanged.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`: all rows pass;
  - `mono-tyaram-grid.sh`: 0 BAD.
- **CI's sweep** should report no output movers. Bytes-only movers from a split are acceptable
  under the ruling.
