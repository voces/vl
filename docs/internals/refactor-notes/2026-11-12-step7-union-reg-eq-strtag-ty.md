# Step 7 L6 (step C8): the empty-fit arms and the union-union eq fallback key by the box read's type; the literal-union string-tag floors are loud, 2026-11-12

The base is master `a90218dfd`, after C7 (#7478).

## Changed

- **Site 92 (`emitListEmptyFitArms`'s arm collection) and sites 96/97 (`emitUnionUnionEq`'s
  fallback, when `msMemberAtomsOfSet` does not cover a side)** read
  `unionTyArms(unionBoxTyOfRead(..))`, as C7's receiver readers do.
- **`emitIs`'s literal-union string-tag floor and `litStrMembersOutsideBox`'s box branch** now
  fail loudly (`emitFail`). They used to read the receiver's union name to count its string arms
  (`isStrTagUnionNameOf`, `unionStrArmCountOf`).
- **Deleted:** `isStrTagUnionNameOf`, `unionStrArmCountOf`, and `unionTyIxOfIdentRead`, which has
  no reader left after C7 and this step.

## Census

A scratch probe compiler was run over the cases and cells.
- **Site 92:** 586 calls in 165 programs agree with the box-read type. 2 calls in 2 programs
  differ: the type covers `i32[]|string|null` where today's lookup found no row.
- **Sites 96/97:** 12 calls in 1 program, all agreeing.
- **The two string-arm counts:** 0 hits over the corpus. Five hand controls reach neither, and
  an earlier `is` rung answers each:
  - `is K` over a `K | i32 | string` parameter;
  - over a `K | i32` parameter;
  - over a record field `r.x`;
  - over an index `xs[0]`;
  - over a call result `mk(1)`.

  Each now fails loudly if a program reaches it. The full sweep shows none does.

## What is left

`msSetOfNameTy`, after the rep-key dedupe and the one-row-per-canonical-rep merge (the next
steps).

## Proof

**Local full sweep:** in the PR.
