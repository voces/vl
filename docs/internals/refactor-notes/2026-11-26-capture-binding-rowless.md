# IR: a capture held at a row its read does not record (lane COV-CLOS, 2026-11-26)

A list callback whose list's build is stored at a declared record (`const dA: J = mk2()` with
`src = [mk2()]`) is instanced at `J`, while every read of its parameter is typed at the literal's
record `{ f: null }` (D17084). A closure capturing the parameter held it at `J` and missed
`capture binding`, since the read's rep was not the held one. A local's read of the same
parameter already passes as it is held (`rowlessReadTyOfVar`); the capture read now does the
same (`capRowlessTy`, `capturedAsHeld`): the environment's field, or the lifted function's
parameter, at the held rep and type. `rowlessReadTyOfVar`'s test is shared as `rowlessReadTyAt`.

## Measurements

I8 census over the `tests/cases` programs (base and head at master `a39d4847a`): `capture binding`
9 → 0 unclaimed functions. Claimed 97,397 → 97,405, unclaimed 499 → 491, claimed starts 8,390 →
8,390, and 0 claimed functions or starts lost. One unit moves on to `index element coercion` (6 → 7).

Claims-off ripple (`VL_IR_SHADOW=1`, every `tests/cases` program): 0 of 8,184 built programs
differ in bytes; 1,447 fail to build on both seeds (expected-error cases).

Q58 position sweep (`tests/cases/closures/callback-param-capture-at-build-row-positions.vl`: a
field read, a record field, a list element, a nested declaration, two deep): base 5 functions
miss `capture binding`, head 0; output identical claims-off and on.

## Left open

- `index element coercion`: `[y][0]` in a closure builds the list at `J` and reads its element at
  `{ f: null }`, an element read off a list laid out at another row (the layout family).
- D17660 (filed): legacy writes invalid wasm when the closure passes the parameter whole to an
  un-annotated function, or returns it whole, beside a record holding it. Not this change's;
  the position test leaves both out.
