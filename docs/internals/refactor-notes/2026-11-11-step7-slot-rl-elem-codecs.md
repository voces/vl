# Step 7 slot layer: the ref-list element codecs go, 2026-11-11

This is §4 item 5 of `2026-11-10-step7-vkind-census.md`, for the ref-list bank's three element
codecs in §1.1: `rlElemListRep`, `rlElemListRepFrom` and `pushDestVKind`. It is stacked on #7157,
which took the map-value bank off `rlElemListRep`.

## What the codec decoded

The ref-list table stores no element code. `rlElemKindAt(s)` computes one from the row's type:
`rlKindOfVKind(repSigKindOfTy(rlElemTyIx[s]))`. Every list kind and its nullable twin map to the
twin pair's one list code, and every other kind maps to a non-list code or -1. `rlElemListRep`
then searched the seven non-null list reps for the one whose code matched.

So `rlElemListRep(rlElemKindAt(s))` turned a `VKind` into a code and back. It answered the
non-null list rep of the row's element kind, or null.

## What changed

- **`rlElemListRepAt(s)`** (`emit_list_rep.vl`) reads the same answer off the row's type. It takes
  `repSigKindOfTy(rlElemTyIx[s])`, gives a nullable list at its non-null twin (`nulListBase`), and
  passes the result through `listRepOrNull`. Its callers:
  - `eqgRefElemClass` and `eqgInnerKind` (`emit_eq_rows.vl`);
  - `rlTwinSigOf` (`emit_collect.vl`);
  - `pushDestVKind`'s list tail (`wasmEmit.vl`). Its struct, map and closure rungs still compare
    `rlElemKindAt` against named codes. That compares codes; it decodes nothing.
- **`rlElemCodeIsList(code)`** is membership in the list-code table. It serves the one caller
  that holds a code from its own caller rather than a row: `rlElemNicheNullable(kind, ty)`, which
  `rlInternNameTy` asks before the row exists.
- **`rlElemListRep` and `rlElemListRepFrom` are deleted.**

## Why this is byte-identical by construction

Both sides are total functions of `repSigKindOfTy(ty)`:

- **A list kind or its nullable twin.** The old side decodes the twin pair's code to the non-null
  rep, and the new side's `nulListBase` / `listRepOrNull` gives the same rep.
- **Any other kind.** The old code is struct (1), union (2), map (3), closure (5) or -1. None of
  them is in `rlElemCodeByList` (`[4, 11, 8, 10, 7, 6, 9]`), so the decode is null. The new side
  is null too.

`rlElemCodeIsList(c)` is true exactly when `rlElemListRep(c) != null`. The search returned a rep
exactly when one of the seven codes equalled `c`. Under the standing velocity instruction, CI's
`sweep` job re-proves identity on the merged tree, so no local sweep was run.

## Proof

<!-- gates -->

## What is left

`rlElemKindAt` itself is the code. Its other readers compare it against `RLK_*`. Each of those
can become a read of the row's kind once the ref-list table stores a rep record, the way the
map-value bank's `mvValRep` does after #7157. `fieldCode*` belongs to lane w314.
