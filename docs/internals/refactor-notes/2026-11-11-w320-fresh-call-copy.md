# A maker's call is copied where it lands wider, so nothing is kept, 2026-11-11

Lane w320. Base is master `161d481c`. One rule change, graded by one position matrix.

## Why every delivery position needed its own code

A function with no declared result returning a record literal (a maker) was **kept**: one
delivery at a record that stores a field differently (`const dA: J = mk2()`) rebuilt the maker
there, so every call of it handed over a `J` while its checked type stayed `{f: i32}`. That one
decision was about the FUNCTION, not the value. Every other position the call or a container of
it could reach then had to learn that its value was stored at another row than its type, and each
position that had not was a refusal or invalid wasm. D15654 to D15698 were that, one position at a
time.

## The rule

The fact belongs to the value. A call's value is fresh, so a delivery whose destination stores a
field differently records a converting copy on that call (`recCopyTyIx`, the coercion record of
architecture-target §0), and the maker keeps its own record. Every other position reads the value
at its checked type and needs nothing.

- `recFreshCallCopy` (check_fit_rules.vl): a direct call delivered wider, from `recAdoptNote` and
  `recAdForce`. A maker called once keeps D3444's build at its one landing.
- `recHeldFreshCopy`: a binding holding such a call, or a join of them, delivered wider copies its
  calls where it is bound and is built there (`recBuildPush`), as a binding of a literal is.
- The copy is offered where `recCopyBoxesOnly` holds (each field as stored, or a scalar boxed
  into `| null`). A union or width pair keeps the keep.
- Emit: a copied call arm lands at its copy's row in a join (`rjaRowOf`, `ifExprRefSlot`), a join
  of copied calls is stamped there (`litKeptRepOf` no longer requires a kept function), and a copy
  whose source record is also a union's arm finds its row by type (`copyArmRowOf`).

## Graded

`scripts/capability-probes/matrix/kept-maker-delivery.matrix.vl` (the generator gains template
cells, `@@CELL_<name>@@`, and `owed-annotated` for a refusal the design owes): master 39 of
120 run, 2 SILENT; now 123 of 123, plus 3 owed refusals: an annotated binding handed on at `J`
has its own storage and identity, and a copy would split it.

Rows closed: D8301, D15219, D15241, D15316, D15318, D15380, D15653, D15691, D15692, D15693,
D15696, D15697, D15698. Filed: D15712 (through a generic identity, still refused), D15713 (a `??`
of a map read with a hole parameter at `J`, invalid wasm on master too), D15714 (a field that is a
union of the scalar), D15715 (a wider nullable number).

Fixtures: 18 refusal pins now run and are `@run` fixtures, renamed `*-runs`. Four still refuse,
with moved positions: a `i32 | string` field (lists, maps), an `i64 | null` field, and the identity
relay.

Distilled regress: no runs lost. 24 cells move reject → runs. Two cells, `d15318_pin_J` and
`d15318_two_pins`, would move loud → invalid wasm, a compiler trap to the sweep: a `??` over a map
read at its own row, defaulted to a hole parameter a call pins at `J`. That is D15713, a master
defect the keep had hidden; it needs the instance's union row (w316, w321). Until it lands,
`storeHoleDefaultApart` (check_store_rep.vl) refuses exactly that shape, so the cells stay refused. Four named cells' manifest wants were "no legitimate value" placeholders; they now
hold the values the programs print.

The box-dst shadow (`tests/vl_box_dst_shadow_test.ts`) had three witnesses whose wider build was a
kept maker. With the copy they box nothing, so two now build wide through a literal binding:
`storewrite` (3 agreements, one more read) and `paramwrite` (the hole parameter alone). `storelit`
keeps its program and expects no rows, since the map keeps its own build. The literal-binding
spelling of `storelit` is invalid wasm on master, filed as D15718.
