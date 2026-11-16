# L2 (c) PR 1: the write narrowing admits a parameter hole, 2026-11-16

The first of the two PRs the coordinator approved for the D3299/D3436 pin-model change
(2026-11-16 ruling: an un-annotated parameter written into a `T | null` place stays pin-generic,
as `<T>` does).

`tvPlaceWrite` (`check_leaf_steps.vl`) decides whether a write leaves its place reading at the
pin's member (`HD_TVW`, D3240). It admitted only a declared type parameter. It now also admits
an un-annotated parameter's hole (`tyIsParamHole`).

Alone this moves nothing. The parameter-solve flow (`noteHoleFlow`) answers the hole with the
place's type, `T | null`, before the body is checked. So by the time the write is judged, its
value is that concrete type, not the hole. PR 2 stops that answer at write positions.

## Measured

- Fingerprint (rc plus a hash of diagnostics and emitted bytes) over `tests/fixtures`,
  `tests/cases` and the distilled `cells/` and `named/`, against a fixpoint master seed:
  **0 of 20,741 programs move**.
