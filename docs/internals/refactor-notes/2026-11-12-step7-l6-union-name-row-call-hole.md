# Step 7 L6: a call's and a hole read's union name hand back their row, 2026-11-12

This is step B, part 5, of the `unNames` spelling readers. It covers the call rung, an
identifier read whose type is a hole (its declaration answers), and an index read of a
union-valued map. Three probe rounds tagged each return with a row candidate. Each candidate was
compared against the row the returned name is bound to (`unRowOfName`), tagging same, differ, or
no row. A control program fired the tags before each sweep.

| rung | candidate | reach | same | differ | no row |
| --- | --- | --- | --- | --- | --- |
| list `pop`/`get` | the element slot's row | 11 | 11 | 0 | 0 |
| annotated return | node type key, when it equals the annotation's folded row | 1,687 | 1,674 | 0 | 19 |
| annotated return | annotation's folded row alone | 1,687 | 1,681 | 7 | 0 |
| `$fnsig` value call | node type key | 77 | 71 | 0 | 8 |
| `$fnsig` value call | the old literal-alias-gated key | 77 | 7 | 0 | 71 |
| inferred return | inferred type key, or node type key | 80 | 73, 72 | 7, 7 | 3, 4 |
| `let` annotation (hole read) | annotation type key | 85 | 85 | 0 | 0 |
| `let` annotation (hole read) | annotation's folded row | 85 | 83 | 2 | 0 |
| unannotated `let` (hole read) | the initializer's own row | 9 | 4 | 0 | 5 |
| unannotated `let` (hole read) | the binding's type key | 9 | 7 | 0 | 2 |
| map index | the value slot's type key | 63 | 62 | 0 | 1 |
| map index | node type key | 62 | 38 | 27 | 18 |

The differs are literal unions. An annotation folds to its base's row, and an inferred literal
return (D3512, D3518, D9561) renders a name another row carries. Programs counted once per tag.

## Changed

- The call rung records the row for a list `pop`/`get`, an annotated return whose type key
  folds to the annotation's row, and a `$fnsig` call by its type key. `callUnionRowOfTy` goes.
- `letUnionNameOf` and the hole read take the hub's save-and-restore slots. An annotated binding
  records its annotation's type key. An unannotated one records its initializer's row, else its
  own type key. `unionNameOfRead` hands back the hole read's row, or the type-keyed one, so
  `unionReadRowOf` goes.
- The map index rung records its value slot's type key.

## Left

- The inferred-return rung, the instance hole-parameter rung, the checker-type fallback (102
  same, 2 differ) and the closure-array element rung record no row.
- The identifier rung's type-keyed row differs from the name's row in 14 programs. Each is a
  twin row under one spelling, with the same atoms; one lists two members in the other order.
  Both consumers of the row are order-blind.

The base is master `f7bef9195`, with a fixpoint seed on both sides. The population is the whole
sweep, 24,011 programs.

## Proof

- **Local full sweep.** PENDING
- **Checks.** `emitter-state-audit --check` is clean. lint-self is clean. The export budget, with
  findings, has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
