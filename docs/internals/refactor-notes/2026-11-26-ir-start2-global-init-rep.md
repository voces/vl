# START-2: `global initializer rep` (2026-11-26)

Graded on master 07aac37c with a probe-patched compiler:

| program | before | after |
|---|---|---|
| `arrays/empty-list-join-null-hole.vl` | global initializer rep | fully claimed |
| D6120 | global initializer rep | fully claimed |

Both reduce to `const x = if c { [] } else { null }`, typed `_[] | null`: no rep of its own. Legacy
gives the cell kind `nullist` (an `i32` list) and writes the join into it.

Two mechanisms:
- `openListCellRep`: a global whose type has no rep and whose cell kind is `list` or `nullist` takes
  that `i32` list, at its initializer (`globalInitValue`) and every read (`globalRep`). The cell is
  stored, and read, at that rep's type (`globalStoreTy`, `globalReadTy`), which the verifier checks
  a global read against. Cell kinds keyed to another element (`nulstrlist`, `nulf64list`, …) still
  miss.
- `deliver`: a value `if` whose own type has no rep is built at the destination's rep
  (`ifExprAt`), each arm delivered there.

Parity: `ir-parity --run-all` reports behaviour equal on all three programs (the sweep included).
The bytes differ only in the `null` arm: the IR writes the bottom `ref.null none`, legacy the cell's
typed `ref.null`. The programs are listed in `ir-divergence-baseline.txt`.

Left open: the local spelling (`local rep nullable`), and a narrowed read's `.length`
(`member nullable`).
