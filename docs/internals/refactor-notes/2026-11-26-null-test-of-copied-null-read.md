# Null test of a copy of a read narrowed to `null` (2026-11-26, lane COV-IS)

- **The defect** (clause 2, found by START-2): `const z = q` of a global `q: Rec | null` narrowed to
  `null`, then `z == null`. Legacy refused with `struct equality is not supported yet`; the IR
  declined at `global read coercion`. `z` is typed `_ | null`, but its binding is stored as the
  source's nullable record (`letBindRep`), so no null-test arm named it and the compare fell
  through to the record refusal. A local source refused the same way.
- **Shared plan** (`nulTestArmOf`): a name typed `_ | null` whose binding is stored as a nullable
  reference takes the `nullRef` arm (`ref.is_null`). The open-type gate keeps every concretely
  typed name on its old route: legacy's claims-off bytes are identical over `tests/cases/{null,
  records, unions, soundness, numerics, generics}` (2,892 programs), master's claimless compiler
  against this one; on the witness they differ (master refuses, this prints `1`).
- **IR**: the declaration reads such an initializer at its storage (`letStoresNullRead`), which
  `localStoredAt` takes; a global read narrowed to `null` whose storage is that null reads the cell
  at the binding's row; a `null`-unit destination of such a read is its own null.
- **Q58 position sweep** (`tests/cases/null/copy-of-null-narrowed-read-null-tested-positions.vl`,
  new): global, local and parameter sources, `==` and `!=`, an `if`, a print, an annotated copy and
  the start body. Master refuses the program; here all 7 functions and the start body are claimed
  and byte-identical.
- Left: `print(z)` of such a copy is `print nulRefNiche`; `const w: null = z` is `declaration
  coercion`.
