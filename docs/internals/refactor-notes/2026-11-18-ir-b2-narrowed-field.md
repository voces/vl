# IR B2: a narrowed box's field read, 2026-11-18

Lane IR2. With the box's `is` test claimed (B1), the self-compile's next door was the member
read right after it: `u.f` on a union box local or parameter narrowed to one record variant.

## What landed

- **One predicate, one writer, shared with legacy.**
  - `narrowedFieldPlain(memIx, fnIx)` names the field index `emitNarrowedMem` reads in its plain
    form, or -1. That rules out a null-unit or niche read, `length`, a two-list use, a receiver
    owing a recover, and a union-box field to unbox.
  - `narrowedFieldTail(vi, idx, memIx, fnIx)` writes the payload cast, the field read and the
    `string | null` field's recover. `emitNarrowedMem` now calls it.
- **`RBoxField { bfV, bfAt }`**, in the `box` family. The builder (`buildMember`) reads the box
  local at its own box rep (`irBBoxLocal`), not its narrowed rep. The verifier requires a box
  operand. The lowering writes the receiver, then the tail, then `emitReadRecover`, the read's
  own recover, as `emitExpr`'s member arm does.
- **Claim hazard.** Both recovers' predicates read checker and rep state only: `nodeTyAt`,
  `repOfNode`, `asgReReadOf` and `isStorageRead`. None of it is written by legacy's body
  lowering.

## Coverage

Fixpoint seeds of master 944a8d60 and of this step, each built from its own checkout.

| reading | master | this step | gained |
|---|---:|---:|---:|
| self-compile covered = matched = claimed | 7,065 | 8,389 | **+1,324** |
| corpus covered = matched = claimed (12,297 cells) | 28,692 | 28,695 | +3 |

| first miss, self-compile | master | this step |
|---|---:|---:|
| `member record` | 2,648 | 481 |
| `list length rep` | 2,529 | 2,696 |
| `is guard` | 134 | 306 |
| `callee signature` | 430 | 586 |
| `expression if` | 1,034 | 1,154 |

Net compiler lines are +82 (+95, −13): 16 self-compile functions per line. In the corpus a
narrowed field read is rarely the first miss: `member record` there falls only 32 → 29.

Next door, from the self-compile blocker census on this step: `list length rep` alone blocks
1,348 functions, and 296 more with `expression if`.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; master's fixpoint seed builds this source to it byte for byte, so the 1,324 newly claimed functions write legacy's bytes; `--names` build too, 10,999,334 B both |
| corpus identity, master seed vs this seed | 9,030 identical, 3,267 fail under both, 0 differ; `--names`: 0 differ |
| `--claims` and mode 3 | self-compile 8,389, corpus 28,695; mode 3 corpus identity 0 differ |
| shadow | all matched; the armed self-build is byte-identical |
| L2 self-compile fuel | 96,653,793,638 to 96,456,352,188 (−0.20%) |
| pin helpers in `emit_mono.vl` | 904 |
