# A call part of a list literal is copied into the list's build, 2026-11-10

D15652 closes: it runs. D15655 is filed for a `const` holding the call, which still refuses.

**The gap.** In `[xs[0], os0()]`, `xs[0]` is built at `J`. The list stamp (`recListLitBuild`)
builds a fresh literal part at the other parts' build, but a call has no literal to stamp, so the
part was refused as a capability gap. Building the call there instead (`recAdoptNote`) rebuilds
`os0` itself. When `os0` is also called at its own type, that trapped the compiler in
`recStoresAgree`.

**The change.**

- check_bind_adopt.vl:
  - `recListCallCopy` records a call part on the record-copy column (`recCopyTyIx`) at the
    list's build. The function stays as it is: the copy happens where the part lands, as a
    held-pinned call's copy back does (D15266).
  - `recCopyBoxesOnly` gates it. Each field of the build stores as the call's does, or a scalar
    field as that scalar or `null`. Any other pair keeps the refusal.
- wasmEmit.vl: `emitRecCopyLevel` boxes such a field (`rcWrapKind`): the scalar's tag, its value
  box, then the union box. This is the dual of the unwrap D15184 added. Only the top level boxes;
  a nested record pair is refused by the gate.

Only a direct call is copied. A `const` holding one is a record another read reaches, and a copy
would split it.

**Graded** (master `e7ebdb52` → now):

| spelling | master | now |
| --- | --- | --- |
| the repro `[xs[0], os0()]` | check reject | runs, `1` |
| `[os0(), xs[0]]` | check reject | runs |
| `[...xs, os0()]` | check reject | runs |
| `os0` also called and bound at its own type | check reject | runs |
| a write `ws[1].f = 9` through the copy | check reject | runs, `9` |
| `[xs[0], id({ f: 2 })]`, a generic's call | check reject | runs |
| a hole function's call, spread beside it | check reject | runs |
| a string field and an `f64` field (`{f: string \| null, g: f64}`) | check reject | runs |
| `const o = os0(); [xs[0], o]` (D15655) | check reject | check reject |
| `const o = id({ f: 1 }); [xs[0], o]` (D15375) | check reject | check reject |
| `[xs[0], mk()]`, the kept maker's own call | check reject, owed | check reject, owed |

Disassembly of the repro: the part is `struct.new $J (struct.new $box (i32.const 0)
(struct.new $i32box (struct.get … (call $os0)))))`. The call is evaluated once.

**Proof run locally.**
- refresh ×2 (fixpoint)
- lint-self, rep-fuzz, seed size, late demands (6)
- dead-export, render-parse, pin-helper and comment budgets
- cases_wasm, inventory refs/rows, scaling shape, probe rollback, fn-ret shadow
- check-filed-witnesses `--strict` on both inventories
- distilled regress
