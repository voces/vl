# IR coverage step: `print` of a value-union box, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10; measured on fixpoint seeds of this
branch's change and master `3fcca855b`.

## Why this class

The corpus census put `print union` at 110 functions it alone kept uncovered, and 168 more paired
with `coalesce niche identBox`.

## What landed

- **One shared tail.** `printUnionTail(slot, kinds)` is `emitPrintValueUnion` after the box is on
  the stack: the stash into `slot` and the tag dispatch over `printUnionPlan`'s kinds. Legacy ends
  through it.
- **The stash slot's order.** `sharedFieldRecvSlot` is taken before the box is written, as legacy
  took it, by legacy and by the IR's lowering alike, so the lazy local keeps its index.
- **The IR.** `printStmt` builds the `union` arm with its argument at a box rep (plain or nullable);
  an `if` argument, which legacy coerces into the box, is a named miss (`print union if`).

## Coverage

| population | before | after |
| --- | ---: | ---: |
| corpus functions covered (45,678) | 35,273 | 35,332 |
| self-compile functions covered | 15,665 | 15,668 |

All covered functions verified and matched (shadow mode 1); the mode-3 self-compile is byte-identical
to the shipped build. `ir-identity.sh --names` against master's seed: identical 9,037, differ 0,
self-compile identical; `--cases`: identical 7,516, differ 0. Many of the 110 now stop at a later
miss (`array ref`, `pre-path coercion`, `argument coercion`), and `coalesce niche identBox` alone
rises with the 168 it shared. Compiler lines: +23 net (24 added, 1 deleted); legacy's dispatch lines are moved into the tail.
