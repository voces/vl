# IR: a narrowed local read (coverage step), 2026-11-18

Lane STORE, assigned the `narrowed read` door beside IR2's B4, on IR2's step pattern. On B3
(`ir-b3-list-length`), the self-compile blocker census put 653 functions behind this class alone:
`identRead` refused any local read whose rep differs from its variable's. A probe naming the two reps
split them: a box read at a record (552 alone) and a nullable read at its inner rep (91 alone).

## What landed

- **Shared tails legacy consumes.**
  - `narrowedVariantTail(vi)` writes the box payload's cast to variant `vi`. `emitVariantCoerce`'s
    box arm and `narrowedFieldTail` now call it.
  - `localNulStrRecovers(ix, fnIx)` names the `string | null` local read that recovers non-null.
    `emitIdentLocalRead` now asks it.
- **One decision for `emitIdentNode`'s ladder.** `identReadArmOf(e, ix, fnIx, pastNull)` names the
  arm that reads an identifier past the list overrides, in the ladder's own order: `nulnone`,
  `nullread`, `defglobal`, `unbox`, `niche`, `reflist`, `map`, `capture`, `nonlocal` or `local`.
  `emitIdentNode` dispatches on it with an exhaustive `match`. After a null read that found no
  other null to deliver, it asks again past that arm. The IR asks the same function whether the
  answer is `local`. The capture test is `captureSlotOf`, which `emitCapturedRead` also reads. The
  ladder exists once, so no copy can drift from it.
- **`narrowedBoxVariantPlain`** adds the box arm's own conditions to a `local` read: a union read
  with no bare variant and no cross-tag fit owing a refusal. The variant it names is the read's
  narrowing, while legacy casts to the destination's. `narrowedVariantRepIs(vi, rep)` makes their
  agreement a check: the builder takes the read only where the variant's record is the read's
  rep. `RBoxNarrow` carries that rep (`bnRep`), and the lowering checks it again.
- **The list overrides are checked, not argued.** `emitIdentNode` decides first. Each list override
  that then takes a read the decision names `local` asks `identListArmCheck`, which fails the build
  (`emitFail`) unless the read is list-typed (`identReadIsList`). `RRecover` leaves list-typed reads
  out, since a nullable list's inner rep is a list. Every legacy compile now proves that no list
  override takes a read the IR writes.
- **`RBoxNarrow { bnV, bnAt }`** (box family): the box local, then `narrowedVariantTail`. **`RRecover
  { rcV, rcAt }`** (scalar family): the nullable local, then `ref.as_non_null` where
  `localNulStrRecovers`. The builder's `narrowedLocalRead` takes a box read at a record, or a
  nullable read at exactly its inner rep. Anything else stays the named miss `narrowed read`. The
  verifier requires a box, or a nullable, operand.
- **Claim hazard.** The list arms run ahead of the decision and stay legacy's alone: the
  union-of-lists override, the list-fit shadow and the capture stand-in. They read state the body
  lowering writes, and they fire only for a read typed as a list. These reads are typed as a record
  or as a nullable's inner rep. Everything the decision reads is checker, rep or pre-pass state
  (the capture cache is filled before any body lowers). Mode 3 is clean.

## Coverage

Fixpoint seeds of B3's head (`9afa0ee3`) and of this step merged onto it, each built from its own
checkout.

| reading | B3 | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched | 11,016 | 11,637 | **+621** |
| self-compile claimed (`$VL_IR_SHADOW=5`) | 11,016 | 11,637 | +621 |
| corpus claimed (12,297 cells) | 30,400 | 30,485 | +85 |
| self-compile blocked by `narrowed read` alone | 653 | 7 | |

Net compiler lines are +144 (+266, −122): 4.3 self-compile functions per line. Making the ladder one
decision replaced the mirrored predicate at no cost. The review's two checks, the variant's rep and the
list overrides, add 32 lines.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; armed self-build covered = verified = matched = 11,637 |
| corpus identity, B3 seed vs this seed | 9,030 identical, 3,267 fail under both, 0 differ, 0 one-only; self-compile identical |
| `--names` identity | the same: 0 differ, self-compile identical |
| `ir-identity.sh --cases` (shipped vs same-tree `CLAIMED = []`, every non-error `tests/cases` program plus the capability probes) | 7,432 identical, 69 fail under both, 0 differ |
| `--claims` | corpus 30,485, `ir-shadow: ok`, 0 fell back; self-compile 11,637 claimed, 0 fell back |
| mode 3 (this seed under `$VL_IR_SHADOW=3` against B3's default) | 9,030 same, 0 differ, 0 one-only; self-compile identical |
| shadow | corpus all matched, `ir-shadow: ok` |
| L2 self-compile fuel | 96,852,104,405 (B3) to 96,776,231,378 (−0.08%) |
| `ladder-sets.vl` | 50 closed sets and 87 set-typed fields match (`IdentReadArm` added; `bnV`, `rcV` registered) |
| lint-self | clean |
| witnesses (`vl_ir_shadow_test`, `vl_ir_list_test`) | a narrowed box read whole at its variant; a `string \| null` parameter read at its string; 24 passed |

The `--claims` readings need a host with the shipped claim. The shared `vl` here predates it, so they
were taken with one built in an isolated target dir.
