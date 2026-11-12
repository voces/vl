# Step 7 L6: a recorded union's row is its widened spelling's bound row, 2026-11-12

Cut E of the `unKey` retirement (`2026-11-11-step7-union-reg-unkey-dead-readers.md`).

## Changed

- **`unRowOfRecordTy`** asks the type key, then the row bound to the type's widened spelling
  (`unionSpellingOfTy`). Its `null`-position loop over softened keys and its spelling's softened
  key are gone, along with a second ask of the type key that had already missed.
- **`regUnionNameGo`** (`emit_anon_fields.vl`) asks the type key, then the same bound row. Its
  softened rung, a second ask of the type key, and the value-union guard #7332 put on the bound
  row are gone.
- **`canonUnionKeyNullAtOfTy`** is deleted; it has no callers left. `softUnionKeyTextOfTyIn` is
  no longer exported.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each hit of
the three softened rungs and the row the widened spelling is bound to. It read every
`tests/cases` file and every distilled `cells/` cell (9,202):

| rung | hits | programs | bound row agrees |
| --- | --- | --- | --- |
| `unRowOfRecordTy`, spelling's softened key | 957 | 39 | 957 |
| `unRowOfRecordTy`, `null`-position keys | 148 | 9 | 148 |
| `regUnionNameGo`, softened key | 119 | 36 | 119 |

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master:
  see the PR.
