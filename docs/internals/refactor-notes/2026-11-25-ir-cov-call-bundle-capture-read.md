# COV-CALL: a captured bundle parameter handed on (2026-11-25)

Lane COV-CALL, class `bundle parameter read`.

## Mechanism

A function parameter called at two signatures is a bundle: a record of its instances
(`bundleParamOfRead`). `identRead` read one as the frame's own parameter variable and missed when
no such variable existed. That is every read from a closure that captures the parameter, such as
`fw(a) { const k = () => take(a); k() }`. Such a read is now the closure's capture of the record
(`bundleCaptureRead`, the reader a bundle callee through a capture already used). Legacy's bytes
are those of that capture read.

## Census (`CENSUS_CLASS=classes/bundle-parameter-read.txt`, rows)

| row | before | after |
|---|---:|---:|
| `bundle parameter read` | 18 | 0 |

Every function of the class's 8 programs is claimed and matches.

## Proof

- **Q58 sweep:** `tests/cases/closures/bundle-parameter-captured-handed-on-positions.vl` hands on the
  captured parameter as an argument, a second argument, through a `const` copy, from a nested
  closure and from an `if` arm. On master the IR leaves 5 of its functions uncovered on this row;
  with this change none.
- The return position (`const h = () => f; take(h())`) is refused by legacy and by `vl check`,
  with an internal key message. It is filed as D17620 (clause 2), not swept.
