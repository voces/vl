# IR coverage: a list read that may be a view (2026-11-22, lane IR-N1)

A read of a scalar or ref list that may be a view of its source (D3028, D3041) reads through the
view. Legacy's shared read tails already write it: `scalarListGetTail` takes `emitSvIndexRead`
where `svDstOfKind` names a view pair, and `refListGetTail` takes `emitRvIndexRead` where
`rvMayView` holds. The IR's lowering writes both tails, but `listIdxPlainWhy` refused either list
first (`index view`, `index ref view`).

## What landed

- **`listIdxPlainWhy`** no longer refuses a list that may be a view; the shared tail writes the
  read through the view's source as legacy does. A ref list with no slot is still a miss.

## Coverage

Measured on fixpoint seeds of this branch and of master `ff45578a`, each building this branch's
source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,723 | 19,723 |
| corpus with no blocker (45,678) | 44,967 | 44,967 |
| `tests/cases` covered / matched (armed shadow) | 67,856 / 67,855 | 67,884 / 67,883 |
| `tests/cases` start bodies covered / matched | 5,584 / 5,583 | 5,589 / 5,588 |

`index view` (26 rows, 5 start) and `index ref view` (3, 4 start) are gone; the functions that do
not yet build reach their next blocker (`box receiver`, `top-level bare block`, `coalesce
listGetOr`). The armed shadow adds no fail, differ or mismatch row (the one fail row,
`generics/hole-map-tail-value.vl`, is on master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,608, differ 0, witnesses same 60;
  `--claimless` identical 14,018, fail under both 3,267, differ 0; `tests/cases` A/B same 8,722,
  differ 0.
- **Fuel:** L2 self-compile per PR +0.00% on master `ff45578a`.
