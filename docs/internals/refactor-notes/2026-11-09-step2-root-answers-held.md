# Step 2: open arguments take the type their place holds; `monoOpenArgDefaultPin` is deleted

Base: master `fc235519` (#6914), built to a fixpoint (6,570,153 bytes). Population: the 23,744
programs of `scripts/sweep.vl -- list`. The probe counts answers at `monoArgPinTyAt` where
`elabNodeTyOrChecked` answers −1. It was built by a scratch seed that was never committed.

## Deleted

`monoOpenArgDefaultPin`, the unbound-default fallback at an annotated generic parameter. Base
against the deletion: 23,744 the same, 0 bytes-only movers. `ELAB_TP_DEFAULT` had no other reader,
so it is deleted too. Pin-helper budget 919 → 918.

## The arm: an open argument takes its place's held type

`elabNodeTyOrChecked` gains a last arm, after `elabRootArgParamTy`. It answers the closed type the
argument's place holds it at (`elabHeldValTy`), in any frame. It declines a list of records,
because the record solve decides that row (step 7). A first candidate without that decline lost
2 runs: `d15203_run_param` and `list-of-untagged-records-returned-beside-a-called-set-runs`, at a
row that does not resolve and at invalid wasm.

| no-answer at `monoArgPinTyAt` | base | after |
|---|---|---|
| root, a record holding a generic (`{f: (T) => T, g: i32}`) | 48 | 4 |
| root, a list of hole functions (`((_) => _)[]`) | 21 | 3 |
| root, a list of records holding hole-function lists (`{fs: ((_) => _)[]}[]`) | 6 | 6 |
| root, a list of generics (`((T) => T)[]`) | 6 | 3 |
| root, an open function (`(U) => U`, `(_) => _`) | 4 | 3 |
| inside an instance | 49 | 33 |
| total | 134 | 52 |

The note for #6914 counted 54 records. In this table, 6 of those are `((T) => T)[]` lists.

## What stands at the root, and why

- **4 records** (D6702, D15447, the two `*-read-under-is` cases). The generic field is called only
  through the callee's `is`-narrowed read, so no place holds it at a signature.
- **6 lists of records**. They are declined on purpose, because the row is a rep decision (step 7).
- **3 `((T) => T)[]`** (`both([id])`). The generic is called at two types through the list, so no
  single closed type holds it.
- **3 `((_) => _)[]`** (`hole-helper-pushes-listed-member-onto-uncalled-list`). A list that is
  pushed onto and never called. No signature exists, and any instance builds a correct program.
- **3 `(U) => U`** (`fn-value-generic-nullable-fn-param`). The parameter is a nullable function, so
  `elabRootArgParamTy`'s shape match declines. A candidate that answered the nullable's function
  closed these 3, but the module gained a function (66 → 67), most likely a second `dbl` at `i32`
  beside the one the name cascade keys (1 bytes-only mover). It was not taken.

## Inside an instance (33)

| class | answers |
|---|---|
| a minted function node with no type, key 0 (#6897's class (b)) | 15 |
| `{[_]: _}` call result, key −1 | 4 |
| `(U) => U` read, key −1 | 3 |
| `{fs: ((_) => _)[]}[]` read, key −1 (declined, as at the root) | 3 |
| `_` read, keys 0, −1, −3 | 6 |
| `{f: (T) => T, g: i32}` record, key −1 | 2 |

## Graded

Sweep, base against candidate: 23,743 of 23,744 the same, 0 bytes-only movers, 1 output mover.
D14887 goes from `emit_reject` (`unsupported argument type for f in a call to fw`) to `runs` and
prints `1`, its Want. Its row is closed. Fixpoint: a second refresh is byte-identical. Seed
6,570,153 → 6,569,789 bytes (−364).

Late demands 4 → 6, recorded in the baseline. Two `@emit-error` cases
(`error-record-field-of-generic-called-under-shadowing-name`,
`error-written-record-field-of-generic-called-and-read-under-is`) now key `show(r)` at the record's
held row, which demands `show` after the elaboration has finished. Both are refused as before.
