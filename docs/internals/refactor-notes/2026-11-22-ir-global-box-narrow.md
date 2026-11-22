# IR coverage: a union-box global read narrowed to a record, list or map arm (2026-11-22, lane IR-N1)

`global read coercion` is a module global whose read rep is not its cell's. In `tests/cases` the
largest groups are a union-box cell narrowed to a record arm and to a container arm. The global
read path built only the atom arm (`globalUnboxRead`), where a local's narrowed read builds all
three through `boxNarrowArmOf` and `boxContainerReadOf`.

## What landed

- `identRead`'s global path asks the local path's own questions: `boxNarrowArmOf` names the atom
  or record (`variant`) arm, and `boxContainerReadOf` names a ref-element list or map arm.
- `globalUnboxRead` takes the arm and the container. It builds the same `RBoxNarrow` a local's
  narrowed read builds, over the cell's box read (`globalBoxAt`): `bnAtom` for the atom arm, -1
  for a record arm's cast, and `bnCon` for a container. No predicate is added, and a global's
  temp read is not marked re-readable.
- Shadow row `tests/ir-shadow-rows/global-box-narrowed-read.vl`.

## Coverage

Measured on fixpoint seeds of this branch and of master `1f51d3cf`.

| population | master | this branch |
| --- | ---: | ---: |
| `tests/cases` start bodies covered / matched | 5,995 / 5,994 | 6,025 / 6,024 |
| `tests/cases` functions covered / matched | 69,215 / 69,214 | 69,216 / 69,215 |
| `start uncovered global read coercion` rows | 89 | 49 |
| self-compile functions with no blocker | 19,890 | 19,890 |
| corpus with no blocker (45,678) | 45,224 | 45,224 |

The armed shadow adds no fail, differ or mismatch row. Its one `node-in array: differ`,
`unions/discriminant-mixed-litunion-bare-literal-arm.vl`, is on master too. It is D17048's read
in a list-literal fragment, which #9567 makes a named miss.

- **Byte proof:** mode 3 self-compile identical; `--names` self-compile identical; `--cases`
  identical 7,624, fail under both 68, differ 0, witnesses same 61; `--claimless` identical
  14,019, fail under both 3,267, differ 0; `tests/cases` A/B same 8,738, differ 0.
- **Order check (mode 6):** 0 order rows over 21,042 programs.
- **Stack margin:** 960 and 940 KB pass, 920 KB fails, on this branch and on master.
- **Fuel:** L2 +0.01% on master's fixpoint.
