# D16365: records written to a hole receiver's element link their open list fields, 2026-11-15

Lane G, after lane H's stage 2c hole union (#8197), following the coordinator's ruling: keep
the per-call derived element and do the link where two records meet it.

## Mechanism

`a.push(r)` on an un-annotated `a` checks against `mkArrayTy(HD_ELEM of a)`, so each pushed
record meets a type variable, not the first record. Each `{ ys: [] }` keeps its own element hole.
The first is pinned `f64` by `a[0].ys.push(0.5)`, the second defaults to `i32`, and the instance
builds two record rows.

## Change (net compiler lines +51; pin-helper delta 0)

- `holeElemRecLink` (`check_hole_rows`) records the first record written to a derived `HD_ELEM`
  hole. It is keyed by the base's `arrayDemandKey` in the map rows, under a key no hole name
  spells, so it rolls back with them. A later record has each list field linked to the same
  field of the first by `tyLinkElem`, which links only two open elements.
- Called from `checkListPushArgs` (a push) and from the index-store arm of `=` (`a[i] = r`),
  the two writes that deliver a record into the derived element.

## Grading

`--before`: a two-level master seed.

- The witness prints `0.5`. `hole-param-record-empty-list-field.matrix.vl`:
  - Every annotated cell and 7 un-annotated cells move from SILENT to runs.
  - The cells `push_index_write`, `returned_element` and `second_pinned` run.
  - The 17 un-annotated cells left are filed as D16421: an un-annotated binding of the call
    reads the nested element at the default, with one push and no record too.
  - `index_writes` is filed as D16422: the argument holds the records.
- `regress.vl`: 0 runs→not-runs. `d16365_els_argument_unann` moves to runs, and only its line is
  rewritten. Master's baseline is behind the master seed on 11 `dord*` cells, the same on both
  seeds.
- `check-filed-witnesses --strict`: all as filed.
- 445 templates (hole, inferred, record, empty): 0 runs→not-runs. 35 cells move SILENT→runs: 34
  in `hole-param-record-empty-list-field` and `argument` (un-annotated) of
  `empty-list-shared-record`, the cell D16365 was found in.
- `decl-order-ab.vl` on the merged tree: master's baseline, unchanged.
