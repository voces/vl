# IR N2b-2c-1: the `K | null` atom rep, its retag and its null, 2026-11-16

Lane IR-C. This is the first nullable discipline of N2b-2c, ruled ahead of `string | null` (2c-2),
with `boolean | null` (d2) left a named miss. A throwaway build tagged each nullable miss with its
discipline. On master plus N2b-2a the census counted the literal-union atom's `K | null` (discipline
3) as the largest: 117 self-compile and 39 corpus functions held by it alone. `CLAIMED` stays empty,
and no emitted byte moves.

## What legacy writes, read before building

- **An atom into its `K | null` is the same i32.** `coerceKindAt` has no row for it: the box row
  needs `boxOwedAt`, which excludes a nullable niche, and `atomstr` is atom to string only.
- **A `null` literal into a `K | null` is legacy's sentinel.** The decision is `nullOwnAt` (here
  `NULL_OWN_ATOM`) and the writer is `emitNullOwn`. Nothing in the IR hard-codes the sentinel.
- **A return of a call whose `K` result is retagged into the caller's `K | null`** is a tail call
  (`return_call`), since both are the same wasm i32.

## What landed

- `valueRep` admits the `K | null` rep (`atomNullable`, discipline 3).
- **`RRetag { rgV }`**: an atom into its `K | null`, taken only where the checker records no box.
  It lowers as the operand alone, writing no bytes. The verifier requires an atom into the
  `K | null` whose inner rep it is.
- **`RNullOf { nuAt }`**: a `null` literal where `nullOwnIsAtom` holds, lowered through legacy's
  `emitNullAt`.
- **The retagged tail call.** `ret` looks through one `RRetag` to the call temp under it and writes
  the tail form. Mode 3 caught the first build writing `return (call …)` in `capturedKindOf`
  (locals prefix `0xc2` against `0xc3`). The shared witness `pk` is its control: the build without
  the fix mismatches on it.
- `boxTemp` and the new ops share one `repTemp`, a temp typed at the destination.

## Coverage

| reading | N2b-2a | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,383 | 5,434 | +51 |
| corpus covered = matched (12,294 cells) | 23,077 | 23,124 | +47 |

The nullable rep classes no longer hold any self-compile function alone. The `K | null` functions
that now reach further stop mostly at a compare of a `K | null` against a literal or `null`, which
legacy routes through its null-test and string ladders. On the self-compile, `string operand
coercion` now holds 108 functions alone. That compare is the next step, a shared null-test plan.

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical |
| corpus identity against the N2b-2a seed, 12,294 cells | 9,016 identical, 3,278 fail under both, 0 differ |
| mode 3 with `list` admitted (throwaway build) | self-compile 5,434 claimed and byte-identical, the same 2 fallbacks as before; corpus 9,016 identical, 0 differ, 0 fell back |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | 95,256,867,281 to 95,316,549,942 (+0.06%) |
| seed size, N2b-2a seed to this one | 6,515,176 to 6,516,503 (+1,327); +2.7% on the baseline, under +3%, so no baseline write |
