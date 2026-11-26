# A map read narrowed to a literal member the box holds as a string is that string (lane CENSUS, 2026-11-26)

**Mechanism.** `m[k]` over a null-free `i32 | K` map (`K` a literal set), narrowed past `i32`,
takes `narrowedMapReadOf` arm `unbox` at atom kind 2. Beside `i32` the box holds the member as its
string, so legacy unboxes the payload to the string (`emitUnionUnboxTail`, a cast to the string
type) and prints it along the `str` arm. The IR asked for the read at `K`'s atom rep and refused it
(`map get union box rep`). It is now built as a `string` temp (`mapGetAt`, `strMember`).

**Reading** (census probe on master's fixpoint seed; regen-11 — 3 units):

| unit | before | after |
|---|---|---|
| `wit/inv1/D14911/w.vl` `@start` | `map get union box rep` | claimed, byte-matched |
| `map-read-narrowed-to-litunion-arm-prints.vl` `@start` | `map get union box rep` | unchanged |
| `map-read-is-else-litunion-arm.vl` `f` | `map get union box rep` | unchanged |

The two unchanged units are a different shape: a `K | null` read (`i32 | K | null`, or a read not
narrowed past `null`) at the nullable niche while the map's value is the box (`na` `none`), which
legacy converts at the print (`emitPrintNulLitUnion`).

**Found behind it.** `if m[k] is K` stashes the map read's box in a local whose boxed-nullable rep
writes no local valtype (`repLocalValtype`), so the lowering refuses it, in a function body and at
top level alike. It was masked by this miss. The decline now names itself (`slotless local at a rep
with no valtype`, a `claim fell back` reason the registry routes to COV-START) and needs its own
lowering.

New case `tests/cases/literal-unions/map-read-narrowed-string-member-positions.vl`: the guarded and
bare else of `is i32`, the `i32` arm, and a parameter map in a function body; every unit claimed and
byte-matched, and the program runs under `VL_IR_REQUIRE_CLAIM=1`.
