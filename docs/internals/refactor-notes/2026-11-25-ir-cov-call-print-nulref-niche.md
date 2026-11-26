# COV-CALL: `print` of a nullable reference narrowed to `null` (2026-11-25)

Lane COV-CALL; census class `print nulRefNiche` (`classes/print-nulrefniche.txt`).

## Mechanism

A nullable reference whose other arm has no printed form (a record, list, map or closure) can
print only as `null`. Legacy's `emitPrintNulRefNiche` writes the argument, `ref.is_null`, the
`null` word and `unreachable` on the other arm. Where `readNarrowedBoxToNull` holds, it writes the
argument at its storage. The IR refused the arm.

The builder (`printNulRefNiche`) builds the operand and wants a nullable reference. A name is read
at its storage. Legacy's read of a name narrowed to `null` is the plain `local.get` or `global.get`,
and the builder's narrowed read of a module global otherwise misses on `global read coercion` (its
narrowed type is the `null` unit). A field read stays unstored, since the verifier wants a stored
field read to be its declared box. The lowering writes the operand under legacy's storage scope,
then `printNulRefNicheTail`, which legacy's writer now calls too.

## Proof

- **Census**, class programs on this branch: `print nulRefNiche` 4 → 0, and both witnesses are
  fully claimed. The case's start body still misses on `global read coercion` at
  `const z = q` (a null-narrowed global delivered to a binding). That miss also stands on master
  and is a separate mechanism.
- **Q58:** `tests/cases/unions/print-nullable-ref-null-positions.vl` prints the null-narrowed
  reference from a module binding, a parameter, a local, a record field, a closure parameter, a
  loop, and a function run with both arms. On the master seed all six functions and the start body
  miss on `print nulRefNiche`. On this branch all match, and the armed run prints the `@log` list.
