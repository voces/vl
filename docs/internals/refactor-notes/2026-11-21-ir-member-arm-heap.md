# IR: a nullable arm field read at its heap, and a parenthesised receiver, 2026-11-21

`buildMember` missed a record receiver's field read as `member record` whenever neither
`structFieldPlain` nor `variantFieldPlain` took it: 38 corpus functions (26 alone) on master
`5d2c2b81f`, none in the self-compile.

A probe labelling each miss by the check that refused it split the class into two IR-only causes:

- **A union arm stored as `nulstruct`.** A field `o: O | null`, where `O` is a union arm, is stored
  at the arm's own heap (D15095's twin row), but the read records `nulvariant`, or `variant` once
  recovered. `fieldStoresRead` compares storage kinds, so it refused. Legacy writes a plain
  `struct.get` of a slot already typed `ref null $O`.
- **A parenthesised receiver.** `memberReadPlain` allows a receiver owing a recover only when it is
  a field read or a name. `(w.inner).r` was refused, although legacy's paren is transparent.

## The change

- `fieldStoresArmRead` (in `structFieldPlain`) admits a `nulstruct` slot read as `X | null`, or
  recovered as `X`, when its target struct's heap is the arm's `variantHeap`.
- `memberReadPlain` unwraps parens before asking whether the receiver recovers in its own read.
- Both predicates serve only the IR. The variant rows' twin of the first case would ask
  `uFieldTgtStructIdx`, which can mint a row at claim time, so it stays a miss.

## Readings (merge-base `5d2c2b81f`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 43,118 | 43,142 (+24) |
| corpus `member record` (alone) | 38 (26) | 8 (0) |
| `tests/cases` shadow covered = matched | 57,480 | 57,535 (+55) |
| self-compile functions with no blocker | 19,245 | 19,245 |
| L2 self-compile fuel | 104,385,711,979 | 104,401,277,626 (+0.015%) |

The 8 left are narrowed reads off a union receiver, `length` reads, the variant-row twin and an
`i32`/`str` row; none blocks a function alone.

Legacy lines deleted: 0. Moved to `@ir`: 0.
