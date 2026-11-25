# Start-body coercions: sub-word storage, a boxed nullable field, a hole's closure list (2026-11-25, lane COV-START)

COV-START owns 34 start-body classes, among them `object field coercion`, `index element
coercion` and `argument coercion`. A scratch build of the compiler printed both reps at each miss
(never committed). Grouped by rep pair, three mechanisms are general builder gaps. Each misses the
same way inside a function.

## The mechanisms, one commit each

- **A sub-word storage width.** A `flat` record's `i8`, `u16` or `i16` field, and an `i8`, `u16`
  or `i16` list element, are packed rows: `RPrim` with `rpPacked` set, so `repPrim` names no
  primitive. Until now the builder and the verifier admitted a plain i32 only into `u8`.
  `repSubWord` (`ir.vl`) now names every sub-word width. Four places read it, each with its
  verifier rule:
  - a record literal's field takes a plain i32;
  - a list element reads into an i32;
  - a field read is typed at the i32 it reads, not at the packed kid;
  - a field store takes a plain i32.

  The lowering is legacy's tail in each case, so the read keeps legacy's sign extension.
- **A scalar into a field its row holds as that scalar's boxed nullable.** A record literal is
  built at a wider row (D16957): `{ f: 1 }` stored where `J = { f: i32 | null }` is the row. The
  value is boxed at the field's rep. These starts now miss one step later, on `box ladder`: the
  shared box plan's ladder arm, which CENSUS owns.
- **A hole's closure list handed to a closure-list parameter.** `id([inc0, half])` with `id`
  un-annotated. The literal's rep is a list of hole closures, `(unsup) -> unsup`, which writes no
  valtype (`refRepValtype`). Legacy keys it at the parameter's wrapper (one list type in the
  module), and `cloListUndeclaredTakes` retags it there.
  - The verifier's twin, `vfCloListUndeclared`, reads the two valtypes the builder notes for a
    retag (`irNoteVerifyFacts`). `ir_verify` cannot import the facts module: that would be an
    import cycle.

## Measured, master b99a1fcb → head

Census probe (`$VL_IR_SHADOW=5`), same program lists on both sides.
- 9,347 tests/cases programs run one per check where a batch dropped them: an emit error stops
  `vl check` for the rest of its batch.
- 5,092 witnesses filed `runs`, 282 capability probes, 12,700 distilled cells.

| reading | master | head |
|---|---:|---:|
| start bodies claimed, tests/cases | 7,846 | see PR |
| start bodies claimed, witnesses | 5,048 | see PR |
| functions newly unclaimed, any population | | 0 |

## Moved, not claimed

- `object field coercion` → `box ladder` (CENSUS): D16957, D16964, D16965 and D16967, plus
  `built-record-field-read-stored`, `built-record-join-binding-read` and
  `built-record-stored-into-nullable-field`.
- `argument coercion` → `operand coercion`: `mixed-result-fn-list-call-bound-in-block`.
- A function binding the hole list's call result, `const r = id([inc0, half])` inside a function,
  now misses on `declaration coercion` (a function lane's class), not `argument coercion`.

## Left in these classes

| class | the rep pair | shape |
|---|---|---|
| `object field coercion` | list → list, record → record | a filter or slice result, or a built record, held at another row's list or record (D16765, D16916, D17402) |
| `index element coercion` | record → record, list → list, box → record | an element at a twin row, D16134 and D16784 |
| `argument coercion` | map → map, list of records | a map or list built at another row's value (D13902, D14381) |
