# IR decision modules 3b-1b: a narrowed union-box read (2026-11-20, lane IR6)

§10.1(a) stage 3, narrowed-read coverage after the member-read arm (#9192). Legacy's identifier
read takes its `unbox` arm (`identReadArmOf`) for a union-box local the checker narrowed to one
atom: it picks the atom, or traps where a generic function's box cannot hold it, then writes
`emitValueUnionUnboxRead`. The IR missed every such read ("narrowed read").

## The shared decision

`identUnboxAtomOf(ix, fnIx): i32`, in `emit_plan_union.vl`, is that choice: the atom kind, or -1
for the dead read. `fnHasTyParams` and `unionTyHasValueKind` move with it.
- **legacy:** the `unbox` arm asks it, traps on -1, and hands the atom to
  `emitValueUnionUnboxRead`, whose tail after the box is `emitUnionUnboxTail(ak)`, no callback;
- **the IR:** `narrowedLocalRead` claims a box (or disc-4 nullable) local on the `unbox` arm as an
  `RBoxNarrow` with `bnAtom` set; -1 misses as "narrowed read dead". `boxNarrow` lowers it as the
  operand, then the same tail. `ir_verify` admits the disc-4 nullable operand only with an atom.

## Lines

| | lines |
|---|---|
| compiler | +95, −62 |
| `wasmEmit.vl` | +6, −58 (the decision and its two helpers out; the tail split out) |
| `emit_plan_union.vl` | +66 (moved, not new) |
| IR | +23 (the claim arm, its lowering and the verifier term) |
