# STORE record-row producer: a re-pointed record holding a list of lists (2026-11-19)

This closes D16920's list-of-lists spelling, handed over by F2 from family C. Its witness:
`let r = { f: [[inc0, dbl]] }; r = { f: [[dbl]] }; r.f[0][0](3)`.

## Mechanism (two changes, each needed)
1. **`recFnFieldsWiden`** (check_fit_rules.vl) compared a list-of-functions field one level deep
   (D16916). It now peels every closed list level to the leaf (`recListLeafOf`), so
   `recAsgFnWidenedTy` builds the re-point literal at the binding's record. Alone, this turns the
   witness from a loud refusal into an invalid module: the re-point record is restamped at the set
   type `{f: ((_) => _)[][]}`, while the binding's held rep is `{f: i32[][]}`. A flat list's
   set-typed record shares the rep's row; a list of lists does not, which is why D16821 builds the
   initialiser at its rep.
2. **`ftRecListsAtRep`** (check_fn_tag.vl, new plan list `fieldWhole`): a record literal holding a
   list of lists, written whole over a held binding, is built at that binding's rep. Each of its
   list-of-lists fields is built at that field of the rep (`fnTagHeldWrittenInner`). This runs after
   the generic written-literal restamp.

Rejected on the way: growing the inner list literals' check types inside `recLitFnFieldsAt`. That
broke 5 corpus programs (`runs → not-runs`), including D16834's re-points. Their inner lists are
built by the rep pass, at `i32[][]`.

## Measured (master 894554dda fixpoint vs this branch's fixpoint)
- Late tag rows: unchanged (317).
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical over the existing corpus.
- The new fixture `closures/record-list-of-lists-repointed-at-smaller-set.vl` (7 spellings,
  including three deep, which master refused too) runs.
- `check-filed-witnesses --strict`: 5,519 graded, 0 moved; D16920 runs as filed, D17008 refuses as
  filed.
- Full @run A/B over 6,763 programs: 1 mover, the new fixture (RC 1 → 0); 0 wasm or output movers.

## Left
D17008: the nested-record spelling `{ a: { f: [inc0, dbl] } }` → `{ a: { f: [dbl] } }`.
