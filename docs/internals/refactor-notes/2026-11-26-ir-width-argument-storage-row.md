# Argument coercion: a width retag from a record's storage row (2026-11-26, lane COV-START)

CENSUS's census (fcf003d9) gave COV-START the coercion family. A scan found six start units of
`argument coercion`. A scratch build printed both reps at each miss. In two of them a wider plain
record went to a narrower parameter (`{i32,i32} -> {i32}`, `{i32,bool} -> {bool}`).

## The mechanism

Legacy declares the wider row a wasm subtype of the narrower one and passes the record as it stands.
The IR admits that as a width retag (`recSubAdmit`), which asks `recordHeapSubOf` whether the
destination's heap is on the source row's `sSuper` chain. `recordHeapSubOf` found the source row
only from the type's own struct index. A literal of a declared type's shape has no row of its own:
it is stored at the declared type's row (`structRowOfRecordTy`). Delta-debugging the generic case
gave this minimal witness:

```
type W2 = { y: i32, x: boolean }
function getX<T>(r: { x: T }): T { return r.x }
const a = { y: 5, x: true }
print(getX(a))
```

Remove the unused `type W2` and the call is matched on master. `recordHeapSubOf` now starts from
the storage row when the type has no row of its own (`recStorageRow` in the builder). The verifier
is unchanged: it re-checks the noted pair and the field prefix (`recSubRetag`).

## Measured

| program | master | head |
|---|---|---|
| `generics/record-pattern-bool-i32-instances.vl` | start uncovered | start matched |
| `modules/overload-monotone-one-to-two/entry.vl` | start uncovered | start matched |

- Both print the same output on legacy and under `$VL_IR_STRICT=1`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- The sweep `tests/cases/records/wider-record-into-narrower-parameter-positions.vl` covers a module
  binding, a local, a generic record pattern whose fields lead with another name, an inline literal,
  a loop, and a relay through a parameter. Its start body misses on master and is matched on the
  head; its output is the same on legacy and under strict IR.
- The other four `argument coercion` units are a map at another map rep (two), the parked rowless
  record row, and a covariant list of records. None of them is a width retag.
