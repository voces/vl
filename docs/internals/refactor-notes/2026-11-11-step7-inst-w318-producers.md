# Step 7 inst: a re-associated `??` link carries its instance's type; w318's other three gaps measured, 2026-11-11

Lane w321, for lane w318's handoff. Four emitter readers met an open type inside an instance. A
scratch probe recorded, at each, the node's column type, `nodeTyAt`, and every instance record
`elabNodeTys` holds for the node (directly or through `nodeSrc`). It read all 7,732 `tests/cases`
programs and every distilled `named/` cell, on master `1d517770`.

## Changed: `emitCoalesceGo`'s minted links

`a ?? b ?? d` is re-associated at emit time into two minted `??` nodes. Each emission mints its
own, so a link can hold its instance's type in the column. It carried the template's raw type
instead (`nodeTyCarry`). The links now take `nodeTyAt(exprIx, fnIx)` (`coalLinkTyAt`), and still
note `exprIx` as their source.

| at the re-association | reaches | programs |
| --- | --- | --- |
| in an instance, the raw type is open and `nodeTyAt` closes it (`_` → `AB \| null`) | 47 | 46 |
| in a function, the raw type is closed and equals `nodeTyAt` | 77 | 45 |
| at module scope | 14 | 4 |

The 93 reaching programs, built with an L1 seed of master `1d517770` and with this candidate's,
both from the same seed: 93 of 93 byte-identical. The links' readers do not yet decide by the
closed type; w318 converts them.

## Measured, no producer change

- **The empty `[]` at `emptyArrHoleElemSlot` and `emptyArrHoleKind`.** It is reached 302 times
  with an open `T[]`. In 286 reaches (64 programs) every instance already holds a closed record,
  such as `i32[]` or `K$m…[]`. So `nodeTyAt(ax, fnIx)` answers once the reader has its `fnIx`;
  the reader takes no `fnIx` today. The other 16 reaches (3 programs) have no record. One is an
  unbound type parameter (`generics/empty-list-arg-at-unbound-type-param.vl`). The other two are
  `generics/is-list-arm-push-through-literal-pinned.vl` and
  `generics/is-list-in-literal-pinned-instance-tests-emptiness.vl`.
- **`cloCallSigKey`'s minted capture-cell read.** It is reached 103 times, in 19 programs. Every
  reach is a cell holding a hole lambda (`((_) => _)[]`, `((_) => string)[]`) in a function that
  is no generic instance. The node has no `nodeSrc` and no instance record, and no instance
  exists to record one. Its closed type is the hole lambda's pinned signature, which is the hole
  pin's fact, not a per-instance node type.

## Proof

- Bytes as above. **Locally,** on master `1d517770`: one refresh. `cases_wasm` passes (7,440).
  `regress.vl` reports no runs lost. These pass: lint-self with its budgets, dead-export,
  render-parse, kind-ladder sets, `mono-tyaram-grid.sh`, check-filed-witnesses `--strict`,
  seed-size (+0.5%) and late-demands (6).
