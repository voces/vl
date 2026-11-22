# IR: the map-read tail, batched (2026-11-22, lane IR-N2)

The first batch under the owner's batch-big ruling. The census is the forced IR-only one at
master 14d707ae:

| class | before | after this PR |
| --- | ---: | ---: |
| `map read atom` | 20 fns + 10 starts | measured in the PR |
| `map read sentinel` | 13 fns | measured in the PR |
| `map get rep` | 10 fns + 10 starts | measured in the PR |

## The mechanisms, one commit each

- **atom**: legacy writes an atom-valued map's `??` as the plain `i32` read with
  `emitMonoMapDefault` in the miss arm. The IR's form 1 now takes that arm, its default
  `deliver`ed at the atom rep, which turns a member literal into its id as legacy does.
- **sentinel**: a `K | null` or `boolean | null` value reads its raw `i32`, or the sentinel on a
  miss, and the default replaces the sentinel. The arm is a head and a tail writer
  (`mapGetOrSentinelHead`, `mapGetOrSentinelTail`), which legacy and the IR's new form 6 share.
  `repHeldAsI32` (`ir.vl`) is the read's rep for both forms, in the builder and the verifier.
- **map get rep**: `mapGetRepOk` and the verifier's `mapGetDstOk` accept three more reads:
  - a slot whose value is already a ref niche, read at that niche (a miss is its null);
  - a scalar slot read at the value itself, which can only be a narrowed read;
  - a record inside a ref-niche value, read narrowed.

Left out:
- `map read receiver computes`: the receiver is built as earlier statements, the local-order
  class.
- `one-literal-map-value-delivery::rdn`: a `K | null` map read at the bare atom.

Row file `tests/ir-shadow-rows/atom-sentinel-and-narrowed-map-reads.vl`; witness
`tests/cases/maps/atom-sentinel-and-narrowed-map-reads.vl`.
