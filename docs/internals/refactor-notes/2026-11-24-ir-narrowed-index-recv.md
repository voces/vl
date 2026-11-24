# IR coverage: `member record` family B1, a field read off an element narrowed through its index place (2026-11-24, lane IR-N8)

Family B of `member record` (`2026-11-24-ir-member-record-c.md`) is the `narrowed` arm on a union
receiver. B1 is its index-place part: `if xs[0] is A { xs[0].r }` (and `m["k"]` the same way),
which legacy's `emitNarrowedMem` writes as the element re-read at its storage box, the box's
payload, `ref.cast` to the arm, then the field. On master `9fc46f2d1`: 15 functions and 3 starts
over 4 programs of tests/cases.

- **`narrowedFieldPlain` (emit_plan_union.vl)** takes an `Index` receiver, and looks through parens.
- **The builder** (`buildMember`) reads a non-`Ident` receiver with `storedBoxRead`, the box the
  element is stored as, which an `Index` reads the same way a `Member` does.

## The re-read is the place's, and the checker keeps it sound

The IR, like legacy, reads the element again at the field read rather than reusing the narrowed
value. That is sound only while the place still holds an `A`, and the checker already keeps it so.
Each spelling below is a test:

- The element is replaced by another `A` between the test and the read, so the read sees the new
  element: `narrowed-index-element-replaced-runs.vl` prints `5` under the base, the head and
  claim-all. This is the one spelling that compiles and exercises the re-read.
- The subscript changes between the test and the read: refused, `field 'r' is not on every member of
  M` (`narrowed-index-subscript-changes-refused.vl`).
- A call that may mutate the element: refused, `'xs[0]' is no longer narrowed to A`
  (`narrowed-index-element-mutated-by-call-refused.vl`).
- An effectful subscript: refused, `field 'r' is not on every member of M`
  (`narrowed-index-effectful-subscript-refused.vl`).
- A map key deleted between the test and the read: refused, `'m["k"]' is no longer narrowed to A`
  (`narrowed-map-key-deleted-refused.vl`).

## Measured

Base master `9fc46f2d1`, head this branch on it, both seeds fixpoints.

- Class regrade over the 4 programs plus the new tests and row: base 15 `uncovered member record`
  and 3 `start uncovered member record`; head 150/150 functions and 9/9 starts matched.
- Covered-fell: tests/cases fell 0, rose 8; corpus fell 0, rose 0.
- Census, each arm in a tree at its own commit (#26): CENSUS.
- L2 self-compile fuel per PR −0.01% on `9fc46f2d1`; the pair (the head seed compiling the base
  tree) is +0.0007%.

Disassembly: in `tests/cases/unions/narrowed-index-field-read-positions-runs.vl`, `argScalar`'s
read is `struct.get $21 0 (ref.cast (ref $21) (struct.get $19 1 (ref.as_non_null (array.get $2 …))))`
after the element's bounds check. The whole module, with `--names`, is byte-identical under the
base seed and under the head seed with every function claimed.

Position sweep (Q58), the same file: the read in 10 positions, a map index place, and the
narrowing's other arm. Under `VL_IR_SHADOW=6` the base has 12 `uncovered member record` of 78
functions; the head matches 78/78 functions and 2/2 starts. Output `5 5 6 v5 h5 5 5 5 5 5 3 0` under the base, the head
and claim-all. Row: `tests/ir-shadow-rows/narrowed-index-place-read.vl`.

#9900's note said tests/cases read `1 claim fell back: stack value read out of order`
(`unions/empty-list-is-store-back.vl`). That held on `26a9bee9`, and it is gone by `9fc46f2d1`.

## Legacy tails the IR calls

None new: `narrowedMemTail` and `unionFieldNarrowUnboxOf`, which the `Ident` and `Member` receivers
already call.
