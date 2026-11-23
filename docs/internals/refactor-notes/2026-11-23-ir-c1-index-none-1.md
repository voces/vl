# `index none`, batch 1: the arm-site writer (IR-C1)

`index none` was 7 functions in tests/cases on master b03c57be, all one mechanism: an element read
through a union of lists or maps (`a[i]` with `a: i32[] | f64[]`, a hole parameter), which legacy
lowers by `emitArmSite`'s per-arm tag chain and the IR sent to the list reader's `none` arm.

The coordinator ruled option (b): one `RArmSite` with a shared writer, the `mapGetArmOf` precedent.

- **Legacy** (`wasmEmit.vl`): `emitArmSite` keeps its receiver stash and calls `armSiteWrite`, the
  chain after it. The writer's inputs are the box's local and the read's index or key operand: a
  local, an immediate (`ARM_IDX_IMM`), the key's string literal (`ARM_IDX_STR`) or, for legacy,
  the node (`ARM_IDX_NODE`). Inside each arm, the list readers and the map key write their index
  through `emitIdxIndex` / `emitArmIdx`, which take the writer's operand where it stands for the
  node. The receiver is overridden to the arm's wrapper local as before. Legacy passes its node,
  so its bytes are unchanged (`--cases`, `--claimless` differ 0; A/B 0 moved).
- **IR**: `buildIndex` routes an `armSiteReads` read to `armSiteRead`. That needs a named receiver,
  a variable box and an atom index (`readsAgain`, or the key's own `OStr`), so per-arm evaluation is
  the same bytes. Otherwise it is a named miss (`arm site stashed receiver`, `arm site operand`).
  `RArmSite` is in the `box` family. The lowering passes the receiver's and index's plain locals
  (`plainVarLocal`: no temp, staged value or range copy) and banks the element-read row as
  `emitIndexBanked` does. The writer sets `idxSpanNode` so the per-arm reads bank none of their own.
- **Verifier**: an arm-site read takes a box and an i32 index or a string key.

## What stays

- `last` (`a[a.length - 1]`): the index is no atom, and its `a.length` is `member box`, which is
  batch 2 on the same writer.
- The module body of `is-list-arm-read-at-numeric-literal-set`: its receiver is a global
  (`start: arm site operand`).

## Legacy tails the IR calls

`armSiteWrite` (shared with legacy). Inside each arm it runs legacy's element read of the node
with both operands overridden, so no user code is emitted from it.

## Readings (base b03c57be9, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7722, fail under both 68, differ 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14047, differ 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus / `--claims` | 45457 covered = verified = matched; no fallback |
| order check (`ir-shadow.vl --prepost`) | 0 order rows, base and head |
| R7, margin | 437 ok; fail 903 KB / pass 906 KB on both |
| L2 self-compile fuel per PR | +0.20% on 121,632,754,489 |
| legacy A/B (tests/cases + probes) | 0 moved programs |
| `self ir misses` | ok, 0 missed (baseline 0) |
| `tests/vl_deep_nesting_test.ts` (host linked) | 8 passed, 0 failed |
| tests/cases `index none` (IR-only census) | 7 → 0 functions |
| tests/cases claimed | functions 79,041 → 79,046, starts 6,856 → 6,856 (0 lost) |
| shadow row `arm-site-element-read.vl` | 9 covered = matched (master: 4, 5 `index none`) |

The first `gate.sh --fast` failed on `lint-self` (an unused local) and `kind-ladder sets` (the
lint's closed `Rhs` copy lacked `RArmSite`, then its field-set copy `asV` / `asIx`). All are fixed;
after merging master (clean), fixpoint, `--cases` (identical 7741, differ 0), the fast tier,
`self ir misses` (0) and deep nesting (8/8) ran on the final tree.
