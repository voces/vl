# Object field coercion: a plain record at its variant twin, a boolean list at an i32 list (2026-11-25, lane COV-START)

`object field coercion` was re-graded on master d37f1f18. Every miss's two reps were printed from
a scratch build (never committed). The scan covered tests/cases, the capability probes and the
distilled cells: 19 units.

## Parked: the IR's row rep disagrees with legacy's heap (14 units)

| program(s) | the value's rep → the field's rep | legacy's heap |
|---|---|---|
| `records/let-copy-of-fn-record-*`, `let-copy-chain-past-sixteen-fn-field-write` (6 programs, 8 units) | `{i32}` → `{closure}` | `{i32}`, the set's id (`struct.new $1 (i32.const 13)`) |
| `records/built-record-*` (3, D16957/D16964) | `{i32}` → `{i32 \| null}` | the binding and the map's records are built at `J` |
| `closures/record-repointed-at-subset-of-its-fn-set` (2, D16916) | `[i32]` → `[closure]` | the list holds the set's ids |
| `structs/rowless-record-narrowed-to-arm-as-field` (2, D17402) | `{i32 \| null}` → `{null}` | the `Circle` arm |
| `closures/record-pushed-onto-literal-records-of-wider-set-beside-returned-list` (1) | `closure` → `i32` | a closure struct |

In each, the IR's operand agrees with legacy's heap and the IR's row rep does not.

## The mechanisms, one commit each

- **A plain record at its variant twin.** `recRetag` admitted a variant record at its plain struct
  twin: the same fields, stored on one heap. It did not admit the reverse. Take a field `n: Node`
  where `Node` is also an arm of `Node | R | null`: the row holds `n` at `Node`'s variant rep. A
  plain record delivered there missed. Either direction is now the one struct as it stands.
  - The rule is shared, so the same pair also claims a return and argument coercion in the
    class's programs.
- **A boolean list at an i32 list.** `boolean[]` rides the `i32[]` backing (`rlCanonElemName`).
  So a hole's `[x]` built at `[bool]`, where the record's row holds the `i32` instance's list, is
  that list. `listRetag` admits the unpacked pair.

## Measured

The class's programs, armed shadow (`$VL_IR_SHADOW=1`), master → head:

| program | master | head |
|---|---|---|
| `records/intersection-recursive-twin-row-retag-positions.vl` | 3 matched; object field, return coercion uncovered | 5 matched |
| `globals/record-global-read-at-its-row-positions.vl` | 67 matched; object field, return and 2 argument coercions uncovered | 71 matched |
| `generics/hole-list-literal-in-record-field-at-two-types.vl` | 7 matched; object field uncovered | 8 matched |

Each prints the same output on legacy and under `$VL_IR_STRICT=1`.

The sweep `tests/cases/records/plain-record-at-variant-twin-and-bool-list-at-i32-positions.vl`
covers:
- a plain record at its twin: a field, a nested field, an argument and a return;
- a boolean list at an i32 row: a field and a nested field.

On master 5 functions were matched and the start body missed. On head 10 are matched, with the
start body. One function stays on `declaration coercion` (a `Node[]` binding of `M` elements),
another lane's class.
