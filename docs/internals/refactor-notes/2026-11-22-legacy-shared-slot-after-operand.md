# Legacy: a shared stash slot is taken after its operand (2026-11-22, lane IR-N2)

Coordinator ruling (D) on the IR's slot-order misses. Three legacy writers asked for
`sharedFieldRecvSlot` before writing the operand they stash, so an operand that mints locals
declared them after the slot. The IR builds that operand as earlier statements and lowers them
first, so its locals came first and the function's bytes differed in declaration order only.

The sites, and the IR lowering each one keeps matching:

| legacy writer | its IR twin | IR miss it unblocks |
| --- | --- | --- |
| `emitPrintValueUnion` | `printOp` | a union `print` of a fused `??` or a valued `if` |
| `emitMemSharedRead`, its stash | `sharedRead` | `coalesce nulRef join past the optional chains` (`d15241_param_J`) |
| `emitCoalesceBoxFieldScalar` | none yet | `coalesce nulRef boxFieldScalar` |

## The change

Each writer now writes the operand, then asks for the slot and sets it. The slot is minted once
per function by its code (`scratchSlot`), so the index it names and the value it holds are
unchanged; only where it is declared moves. The IR's two twins move with them.

## Measured

On fixpoint seeds of master e48f0bff and of this branch:

- 529 of 19,717 programs moved bytes (132 tests/cases, 397 distilled cells), the same set
  claimless and as shipped.
- No exit code changed, and the run outputs of all 529 are identical.
- `wasm-dis` shows each move as a swap of local declarations and the indices that read them.
- The compiler itself has no moved site (`--names`: `self-compile identical`).

The per-site split and the moved list are in the PR.
