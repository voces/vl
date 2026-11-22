# IR coverage: `o.v ?? d` over a global receiver re-reads it as it was read (2026-11-22, lane IR-N1)

`print(wideJ.f ?? 0)` at module scope, a `??` over a value-union record field whose receiver is a
global (or a global's field, `wideO.j.f`), is legacy's `emitCoalesceUnionField`, which re-emits
the receiver in the present arm (`emitCoalArmRecv`). The IR's `coalField` took only a variable as
the receiver it re-reads, so a global's read, a temp, left it `coalesce field place`.

## What landed

- **The lowering** writes the present arm's receiver again as the builder read it, through the
  loop hoist's `irHoistRecv` (a variable, a global's read, or a plain field read of one of those).
- **The builder** admits a temp receiver only where that read can be written again
  (`recvReadsAgain`, over the builder's own `irReadVar`, `irReadAgain` and `irReadField`).

## Coverage

Measured on fixpoint seeds of this branch and of master `a00578d1`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,712 | 19,712 |
| corpus with no blocker (45,678) | 44,857 | 44,858 |
| `tests/cases` covered / matched (armed shadow) | 67,575 / 67,574 | 67,579 / 67,578 |
| `tests/cases` start bodies covered / matched | 5,514 / 5,513 | 5,590 / 5,589 |

`coalesce field place` falls from 95 start rows to 9 and from 11 function rows to 7; the rest
reach their next blocker. The armed shadow adds no fail, differ or mismatch row (the one fail row,
`generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,606, differ 0, witnesses same 60;
  `--claimless` identical 14,018, fail under both 3,267, differ 0; `tests/cases` A/B same 8,720,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.01% on master `a00578d1`.
