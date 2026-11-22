# IR coverage: a tagged call's module-global callee is read as its cell stores it (2026-11-22, lane IR-N7)

A choice of functions in a module global, `const g = if b { inc0 } else { dbl0 }`, is stored as its
tagged set's `i32` id. Read at a closed function type (`const h: (x: i32) => i32 = g`, or handed to
`apply(f: (x: i32) => i32)`), legacy writes an adapter whose body is a tagged call through `g`:
- **Legacy:** `emitFnTagDispatch` writes the callee with `emitExpr`. On the `nonlocal` arm, a module
  global that is no function value is `emitIdentNonLocalRead`'s plain `global.get`, the cell's id,
  whatever type the checker gave the read.
- **IR:** `tagDispatchAt` and `tagDispatchVoid` read the callee at its checked rep, a closure. That
  differs from the cell's `i32`, so the read missed `global read coercion`.

## Change

- **`tagCallee`** (`ir_build.vl`) reads a dispatch's callee for both builders. On legacy's `nonlocal`
  arm (`identReadArmOf`), for a module global that is no function value (`fnValueFeOf`), it reads
  the cell as stored, but only where the read was checked at another rep. Every other callee is
  `irBExpr`'s, as before.
- **`globalStoredRead`** is `identRead`'s existing `stored` branch, extracted so both use it: the
  cell's rep, typed at the binding's own type.
- **New row:** `tests/ir-shadow-rows/tag-global-callee-closed-type.vl`.

## Measured

Against master 1d40e100's fixpoint seed, with an L1 head:
- tests/cases bodies covered = matched 69,060 → 69,097;
- starts unchanged at 5,996;
- no mismatch row moved;
- `global read coercion` 68 → 32 and `rep ?` 125 → 124.

Without the rep condition, 12 starts that match on master mismatched (`i32.const` against
`local.get`/`global.get`), and 37 starts missed `tag dispatch callee rep`. Without the
`nonlocal`/`fnValueFeOf` condition, 3 bodies also mismatched.
