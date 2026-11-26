# A joined const atom compared as a string (lane COV-UNION, 2026-11-26)

## The row

`compare of a joined const atom` (3) in regen-10/11: `const-literal-join-local-decodes-its-member.vl`
`pick`, `const-literal-join-stored-as-its-set.vl` `main`, `assignment-value-into-literal-union-place.vl`
`@start`.

## The change

The builder refused an `==`/`!=` with a side the checker typed `string` and holds as an atom
(`atomCellWidened`), because legacy declares a string compare's locals for it that no IR compare
route declares: the refusal kept bytes, not behaviour. Since byte identity is no longer a gate
(behaviour parity is, coordinator ruling at #10329), the refusal is removed and the compare takes
the IR's own route. The only byte difference in the three units is the locals prefix.

## Measured

- Sweep `tests/cases/literal-unions/const-literal-join-compared-in-each-position.vl` (against a
  const, a literal, a built string, either side, `!=`, in a closure): master blocks five functions;
  on the head none block and the `@log` lines hold under `VL_IR_REQUIRE_CLAIM=1`. Two neighbouring
  spellings miss elsewhere on both seeds and stay out of the sweep: two joins compared
  (`operand at string`) and a top-level join (`pre-path atom hook`).
- Census A/B (base 3a7b1df55): the three units are claimed; cases unclaimed 201 to 198; nothing
  lost. `ir-identity --cases`: 0 differ, 166 of 166 behave the same.
